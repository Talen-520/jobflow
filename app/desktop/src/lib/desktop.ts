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

export function showFloatingAssistant(): Promise<string> {
  return invokeDesktopCommand("show_floating_assistant");
}

export function hideFloatingAssistant(): Promise<string> {
  return invokeDesktopCommand("hide_floating_assistant");
}

export function toggleFloatingAssistant(): Promise<string> {
  return invokeDesktopCommand("toggle_floating_assistant");
}

export function collapseToFloatingAssistant(): Promise<string> {
  return invokeDesktopCommand("collapse_to_floating_assistant");
}

export function showMainWindow(): Promise<string> {
  return invokeDesktopCommand("show_main_window");
}
