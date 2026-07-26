import { invoke, isTauri } from "@tauri-apps/api/core";

export function isDesktopRuntime(): boolean {
  return isTauri();
}

async function invokeDesktopCommand(command: string): Promise<string> {
  if (!isTauri()) {
    return "Desktop shell is not available in the web preview.";
  }
  return invoke<string>(command);
}

export function showMainWindow(): Promise<string> {
  return invokeDesktopCommand("show_main_window");
}
