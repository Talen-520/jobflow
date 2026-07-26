const statusElement = document.querySelector("#status");
const detailElement = document.querySelector("#detail");
const aiCustomFieldsElement = document.querySelector("#ai-custom-fields");
const startFillElement = document.querySelector("#start-fill");
const fillStatusElement = document.querySelector("#fill-status");

function render(status) {
  statusElement.textContent = status.connected
    ? "Connected"
    : status.connecting
      ? "Connecting"
      : "JobFlow unavailable";
  if (status.formDetected) {
    detailElement.textContent = `${status.ats || "Job"} form detected · ${status.fieldCount} fields`;
  } else if (status.tab?.title) {
    detailElement.textContent = `Watching ${status.tab.title}`;
  } else if (status.connected) {
    detailElement.textContent = "Open a supported job application. JobFlow will detect it automatically.";
  } else {
    detailElement.textContent = "Start the JobFlow desktop app, then reopen this extension.";
  }
  aiCustomFieldsElement.checked = Boolean(status.aiCustomFields);
  const running = status.fillStatus === "running";
  startFillElement.disabled = !status.connected || !status.formDetected || running;
  startFillElement.textContent = running
    ? "Filling..."
    : status.fillResult
      ? "Fill again"
      : "Start filling";
  fillStatusElement.textContent = status.fillMessage || "";
}

async function refresh() {
  render({ connected: false, connecting: true, tab: null });
  try {
    render(await chrome.runtime.sendMessage({ type: "jobflow.status" }));
  } catch {
    render({ connected: false, connecting: false, tab: null });
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "jobflow.status_changed") {
    render(message);
  }
});

aiCustomFieldsElement.addEventListener("change", async () => {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "jobflow.set_ai_custom_fields",
      enabled: aiCustomFieldsElement.checked,
    });
    if (!response?.ok) throw new Error(response?.error || "Unable to save preference.");
    render(response.status);
  } catch {
    fillStatusElement.textContent = "Unable to save the AI option.";
  }
});

startFillElement.addEventListener("click", async () => {
  startFillElement.disabled = true;
  startFillElement.textContent = "Filling...";
  fillStatusElement.textContent = "Preparing this page...";
  try {
    const response = await chrome.runtime.sendMessage({ type: "jobflow.start_fill" });
    if (!response?.ok) throw new Error(response?.error || "Unable to fill this page.");
    render(response.status);
  } catch (error) {
    startFillElement.disabled = false;
    startFillElement.textContent = "Start filling";
    fillStatusElement.textContent =
      error instanceof Error ? error.message : "Unable to fill this page.";
  }
});

void refresh();
