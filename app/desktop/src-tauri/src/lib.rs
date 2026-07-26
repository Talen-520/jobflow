use std::{
    fs,
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
};

use tauri::{AppHandle, Manager};

const BACKEND_ADDRESS: &str = "127.0.0.1:8765";
const BACKEND_URL: &str = "http://127.0.0.1:8765";
const BACKEND_PROTOCOL_VERSION: u64 = 2;

#[derive(Default)]
struct BackendState {
    process: Mutex<Option<Child>>,
}

impl Drop for BackendState {
    fn drop(&mut self) {
        if let Ok(mut process) = self.process.lock() {
            if let Some(mut child) = process.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[tauri::command]
fn backend_url() -> &'static str {
    BACKEND_URL
}

#[tauri::command]
fn start_backend(app: AppHandle, state: tauri::State<'_, BackendState>) -> Result<String, String> {
    if backend_is_compatible() {
        return Ok(format!("Backend is already running at {BACKEND_URL}"));
    }

    retire_incompatible_backend()?;
    let mut process = state
        .process
        .lock()
        .map_err(|_| "Backend state lock poisoned".to_string())?;
    if let Some(mut stale) = process.take() {
        let _ = stale.kill();
        let _ = stale.wait();
    }
    *process = Some(spawn_backend(&app)?);
    wait_for_backend()?;
    Ok(format!("Backend started at {BACKEND_URL}"))
}

#[tauri::command]
fn stop_backend(state: tauri::State<'_, BackendState>) -> Result<String, String> {
    let mut process = state
        .process
        .lock()
        .map_err(|_| "Backend state lock poisoned".to_string())?;

    let Some(mut child) = process.take() else {
        return Ok("Backend is not running from the desktop shell.".to_string());
    };
    let _ = child.kill();
    let _ = child.wait();
    Ok("Backend stopped.".to_string())
}

fn spawn_backend(app: &AppHandle) -> Result<Child, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
    let db_path = data_dir.join("jobflow.sqlite");
    let vault_path = data_dir.join("vault");

    #[cfg(debug_assertions)]
    {
        let backend_dir = backend_dir()?;
        let child = Command::new("uv")
            .args([
                "run",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                "8765",
            ])
            .current_dir(&backend_dir)
            .env("JOBFLOW_DB_PATH", &db_path)
            .env("JOBFLOW_VAULT_PATH", &vault_path)
            .env("JOBFLOW_MIGRATE_LEGACY", "true")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| {
                format!(
                    "Failed to start backend from {}: {}",
                    backend_dir.display(),
                    error
                )
            })?;
        return Ok(child);
    }

    #[cfg(not(debug_assertions))]
    {
        let sidecar_path = bundled_sidecar_path(app)?;
        Command::new(&sidecar_path)
            .env("JOBFLOW_DB_PATH", db_path)
            .env("JOBFLOW_VAULT_PATH", vault_path)
            .env("JOBFLOW_MIGRATE_LEGACY", "true")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| {
                format!(
                    "Failed to start bundled backend {}: {}",
                    sidecar_path.display(),
                    error
                )
            })
    }
}

#[cfg(not(debug_assertions))]
fn bundled_sidecar_path(app: &AppHandle) -> Result<PathBuf, String> {
    let executable_name = if cfg!(windows) {
        "jobflow-backend.exe"
    } else {
        "jobflow-backend"
    };
    let current_exe = std::env::current_exe().map_err(|error| error.to_string())?;
    if let Some(sidecar) = current_exe
        .parent()
        .map(|parent| parent.join(executable_name))
        .filter(|path| path.is_file())
    {
        return Ok(sidecar);
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        for candidate in [
            resource_dir.join(executable_name),
            resource_dir.join("binaries").join(executable_name),
        ] {
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }
    Err("Bundled JobFlow backend sidecar was not found.".to_string())
}

fn backend_port_is_open() -> bool {
    let address: SocketAddr = BACKEND_ADDRESS.parse().expect("valid backend address");
    TcpStream::connect_timeout(&address, Duration::from_millis(100)).is_ok()
}

fn backend_health() -> Option<serde_json::Value> {
    let address: SocketAddr = BACKEND_ADDRESS.parse().expect("valid backend address");
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_millis(250)).ok()?;
    stream
        .set_read_timeout(Some(Duration::from_millis(500)))
        .ok()?;
    stream
        .set_write_timeout(Some(Duration::from_millis(500)))
        .ok()?;
    stream
        .write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1:8765\r\nConnection: close\r\n\r\n")
        .ok()?;

    let mut response = String::new();
    stream.read_to_string(&mut response).ok()?;
    let (_, body) = response.split_once("\r\n\r\n")?;
    serde_json::from_str(body).ok()
}

fn backend_is_compatible() -> bool {
    backend_health().is_some_and(|health| {
        health.get("service").and_then(|value| value.as_str()) == Some("jobflow-backend")
            && health
                .get("protocol_version")
                .and_then(|value| value.as_u64())
                == Some(BACKEND_PROTOCOL_VERSION)
    })
}

fn retire_incompatible_backend() -> Result<(), String> {
    if !backend_port_is_open() {
        return Ok(());
    }

    let health = backend_health().ok_or_else(|| {
        "Port 8765 is occupied by a service that is not a compatible JobFlow backend.".to_string()
    })?;
    if health.get("service").and_then(|value| value.as_str()) != Some("jobflow-backend") {
        return Err(
            "Port 8765 is occupied by another application. Close it before starting JobFlow."
                .to_string(),
        );
    }

    terminate_stale_backend()?;
    for _ in 0..30 {
        if !backend_port_is_open() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(100));
    }
    Err(
        "The previous JobFlow backend did not stop. Quit JobFlow completely and reopen it."
            .to_string(),
    )
}

#[cfg(target_os = "macos")]
fn terminate_stale_backend() -> Result<(), String> {
    let output = Command::new("/usr/sbin/lsof")
        .args(["-nP", "-tiTCP:8765", "-sTCP:LISTEN"])
        .output()
        .map_err(|error| format!("Unable to locate the previous JobFlow backend: {error}"))?;
    let pids = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| line.trim().parse::<u32>().ok())
        .collect::<Vec<_>>();
    if pids.is_empty() {
        return Err("Unable to locate the previous JobFlow backend process.".to_string());
    }
    for pid in pids {
        let status = Command::new("/bin/kill")
            .args(["-TERM", &pid.to_string()])
            .status()
            .map_err(|error| format!("Unable to stop the previous JobFlow backend: {error}"))?;
        if !status.success() {
            return Err(format!(
                "Unable to stop the previous JobFlow backend process {pid}."
            ));
        }
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn terminate_stale_backend() -> Result<(), String> {
    Err("Quit the previous JobFlow version completely before opening this version.".to_string())
}

fn wait_for_backend() -> Result<(), String> {
    for _ in 0..100 {
        if backend_is_compatible() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(100));
    }
    Err("Timed out waiting for a compatible local JobFlow backend.".to_string())
}

#[tauri::command]
async fn show_main_window(app: AppHandle) -> Result<String, String> {
    if let Some(main) = app.get_webview_window("main") {
        main.show().map_err(|error| error.to_string())?;
        main.set_focus().map_err(|error| error.to_string())?;
    }
    Ok("Main window is visible.".to_string())
}

#[cfg(debug_assertions)]
fn backend_dir() -> Result<PathBuf, String> {
    if let Ok(path) = std::env::var("JOBFLOW_BACKEND_DIR") {
        return Ok(PathBuf::from(path));
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .and_then(|desktop_dir| desktop_dir.parent())
        .map(|app_dir| app_dir.join("backend"))
        .ok_or_else(|| "Unable to resolve backend directory.".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(BackendState::default())
        .setup(|app| {
            if !backend_is_compatible() {
                retire_incompatible_backend()?;
                let child = spawn_backend(app.handle())?;
                let state = app.state::<BackendState>();
                *state
                    .process
                    .lock()
                    .map_err(|_| "Backend state lock poisoned")? = Some(child);
                wait_for_backend()?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            backend_url,
            start_backend,
            stop_backend,
            show_main_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running JobFlow desktop app");
}
