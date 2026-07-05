use std::{
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
};

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const FLOATING_ASSISTANT_LABEL: &str = "floating-assistant";
const FLOATING_ASSISTANT_WIDTH: f64 = 380.0;
const FLOATING_ASSISTANT_HEIGHT: f64 = 640.0;
const FLOATING_ASSISTANT_MARGIN: f64 = 20.0;

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
    "http://127.0.0.1:8765"
}

#[tauri::command]
fn start_backend(state: tauri::State<'_, BackendState>) -> Result<String, String> {
    let mut process = state
        .process
        .lock()
        .map_err(|_| "Backend state lock poisoned".to_string())?;

    if let Some(child) = process.as_mut() {
        if child
            .try_wait()
            .map_err(|error| error.to_string())?
            .is_none()
        {
            return Ok("Backend is already running at http://127.0.0.1:8765".to_string());
        }
    }

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

    *process = Some(child);
    Ok("Backend started at http://127.0.0.1:8765".to_string())
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

    if child
        .try_wait()
        .map_err(|error| error.to_string())?
        .is_none()
    {
        child.kill().map_err(|error| error.to_string())?;
        child.wait().map_err(|error| error.to_string())?;
    }
    Ok("Backend stopped.".to_string())
}

#[tauri::command]
async fn show_floating_assistant(app: AppHandle) -> Result<String, String> {
    let window = ensure_floating_assistant(&app)?;
    position_floating_assistant(&app, &window)?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok("Floating assistant is visible.".to_string())
}

#[tauri::command]
async fn hide_floating_assistant(app: AppHandle) -> Result<String, String> {
    let Some(window) = app.get_webview_window(FLOATING_ASSISTANT_LABEL) else {
        return Ok("Floating assistant is already hidden.".to_string());
    };
    window.hide().map_err(|error| error.to_string())?;
    Ok("Floating assistant hidden.".to_string())
}

#[tauri::command]
async fn toggle_floating_assistant(app: AppHandle) -> Result<String, String> {
    if let Some(window) = app.get_webview_window(FLOATING_ASSISTANT_LABEL) {
        if window.is_visible().map_err(|error| error.to_string())? {
            window.hide().map_err(|error| error.to_string())?;
            return Ok("Floating assistant hidden.".to_string());
        }
    }
    show_floating_assistant(app).await
}

#[tauri::command]
async fn collapse_to_floating_assistant(app: AppHandle) -> Result<String, String> {
    show_floating_assistant(app.clone()).await?;
    if let Some(main) = app.get_webview_window("main") {
        main.hide().map_err(|error| error.to_string())?;
    }
    Ok("Main window collapsed to floating assistant.".to_string())
}

#[tauri::command]
async fn show_main_window(app: AppHandle) -> Result<String, String> {
    if let Some(main) = app.get_webview_window("main") {
        main.show().map_err(|error| error.to_string())?;
        main.set_focus().map_err(|error| error.to_string())?;
    }
    Ok("Main window is visible.".to_string())
}

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

fn ensure_floating_assistant(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(FLOATING_ASSISTANT_LABEL) {
        return Ok(window);
    }

    let (x, y) = floating_assistant_position(app)?;
    WebviewWindowBuilder::new(
        app,
        FLOATING_ASSISTANT_LABEL,
        WebviewUrl::App("index.html?view=assistant".into()),
    )
    .title("JobFlow Assistant")
    .inner_size(FLOATING_ASSISTANT_WIDTH, FLOATING_ASSISTANT_HEIGHT)
    .min_inner_size(FLOATING_ASSISTANT_WIDTH, 420.0)
    .position(x, y)
    .resizable(false)
    .decorations(false)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    .shadow(true)
    .visible(false)
    .build()
    .map_err(|error| error.to_string())
}

fn position_floating_assistant(app: &AppHandle, window: &WebviewWindow) -> Result<(), String> {
    let (x, y) = floating_assistant_position(app)?;
    window
        .set_position(tauri::LogicalPosition::new(x, y))
        .map_err(|error| error.to_string())
}

fn floating_assistant_position(app: &AppHandle) -> Result<(f64, f64), String> {
    let Some(monitor) = app.primary_monitor().map_err(|error| error.to_string())? else {
        return Ok((FLOATING_ASSISTANT_MARGIN, FLOATING_ASSISTANT_MARGIN));
    };

    let work_area = monitor.work_area();
    let scale = monitor.scale_factor();
    let width = FLOATING_ASSISTANT_WIDTH * scale;
    let height = FLOATING_ASSISTANT_HEIGHT * scale;
    let margin = FLOATING_ASSISTANT_MARGIN * scale;

    let min_x = f64::from(work_area.position.x);
    let min_y = f64::from(work_area.position.y);
    let max_x = min_x + f64::from(work_area.size.width) - width - margin;
    let max_y = min_y + f64::from(work_area.size.height) - height - margin;

    Ok(((max_x.max(min_x)) / scale, (max_y.max(min_y)) / scale))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(BackendState::default())
        .invoke_handler(tauri::generate_handler![
            backend_url,
            start_backend,
            stop_backend,
            show_floating_assistant,
            hide_floating_assistant,
            toggle_floating_assistant,
            collapse_to_floating_assistant,
            show_main_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running JobFlow desktop app");
}
