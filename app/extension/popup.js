const statusElement = document.querySelector("#status");
const atsBadgeElement = document.querySelector("#ats-badge");
const fieldCountElement = document.querySelector("#field-count");
const detailTitleElement = document.querySelector("#detail-title");
const detailElement = document.querySelector("#detail");
const aiCustomFieldsElement = document.querySelector("#ai-custom-fields");
const startFillElement = document.querySelector("#start-fill");
const fillStatusElement = document.querySelector("#fill-status");

function atsLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const labels = {
    ashby: "Ashby",
    greenhouse: "Greenhouse",
    lever: "Lever",
    oracle: "Oracle",
    workday: "Workday",
    generic: "Application",
  };
  return labels[normalized] || "Application";
}

function render(status) {
  const ready = Boolean(status.connected && status.formDetected);
  statusElement.textContent = ready
    ? "Ready"
    : status.connected
      ? "Connected"
    : status.connecting
      ? "Connecting"
      : "Offline";
  statusElement.dataset.state = ready
    ? "ready"
    : status.connected || status.connecting
      ? "connecting"
      : "offline";
  if (ready) {
    const label = atsLabel(status.ats);
    atsBadgeElement.textContent = label;
    fieldCountElement.textContent = `${status.fieldCount} fields`;
    detailTitleElement.textContent = `${label} application ready`;
    detailElement.textContent = "Saved Profile values can fill this page.";
  } else if (status.tab?.title) {
    atsBadgeElement.textContent = "No form";
    fieldCountElement.textContent = "0 fields";
    detailTitleElement.textContent = "No application form";
    detailElement.textContent = "Open the application form in this Chrome tab.";
  } else if (status.connected) {
    atsBadgeElement.textContent = "No form";
    fieldCountElement.textContent = "0 fields";
    detailTitleElement.textContent = "Waiting for an application";
    detailElement.textContent = "Open a supported application form in Chrome.";
  } else {
    atsBadgeElement.textContent = "Unavailable";
    fieldCountElement.textContent = "0 fields";
    detailTitleElement.textContent = "JobFlow is offline";
    detailElement.textContent = "Open the JobFlow desktop app, then reopen this popup.";
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

const previewState = new URLSearchParams(globalThis.location?.search || "").get(
  "preview",
);

if (globalThis.location?.protocol === "http:" && previewState === "workday") {
  render({
    connected: true,
    connecting: false,
    formDetected: true,
    ats: "workday",
    fieldCount: 13,
    aiCustomFields: true,
    fillStatus: "idle",
    fillMessage: "",
    fillResult: null,
  });
} else {
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
}
