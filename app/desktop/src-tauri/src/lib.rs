use std::sync::Mutex;

#[derive(Default)]
struct BackendState {
    running: Mutex<bool>,
}

#[tauri::command]
fn backend_url() -> &'static str {
    "http://127.0.0.1:8765"
}

#[tauri::command]
fn start_backend(state: tauri::State<'_, BackendState>) -> Result<String, String> {
    let mut running = state
        .running
        .lock()
        .map_err(|_| "Backend state lock poisoned".to_string())?;
    *running = true;
    Ok("Backend sidecar start placeholder registered. Run FastAPI locally during MVP development.".to_string())
}

#[tauri::command]
fn stop_backend(state: tauri::State<'_, BackendState>) -> Result<String, String> {
    let mut running = state
        .running
        .lock()
        .map_err(|_| "Backend state lock poisoned".to_string())?;
    *running = false;
    Ok("Backend sidecar stop placeholder registered.".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(BackendState::default())
        .invoke_handler(tauri::generate_handler![
            backend_url,
            start_backend,
            stop_backend
        ])
        .run(tauri::generate_context!())
        .expect("error while running JobFlow desktop app");
}
