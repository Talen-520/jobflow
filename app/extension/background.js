const API_ORIGIN = "http://127.0.0.1:8765";
const WS_ORIGIN = "ws://127.0.0.1:8765";
const SUPPORTED_HOSTS = [
  "greenhouse.io",
  "ashbyhq.com",
  "myworkdayjobs.com",
  "workdayjobs.com",
  "oraclecloud.com",
  "taleo.net",
  "jobs.lever.co",
];

let socket = null;
let socketPromise = null;
let activeTabId = null;
let activeTab = null;
let heartbeat = null;
let reconnectTimer = null;
let pairingPromise = null;
let aiCustomFields = false;
let lastPromptedForm = "";
const frames = new Map();
let detectedForm = {
  detected: false,
  fieldCount: 0,
  ats: "",
  formUrl: "",
};
let fillRun = {
  status: "idle",
  message: "",
  result: null,
};

function refreshDetectedFormFromFrames() {
  const detectedFrames = [...frames.values()]
    .filter((frame) => Number(frame.fieldCount || 0) > 0)
    .sort((left, right) => Number(right.fieldCount) - Number(left.fieldCount));
  const best = detectedFrames[0];
  detectedForm = best
    ? {
        detected: true,
        fieldCount: Number(best.fieldCount),
        ats: best.ats || "generic",
        formUrl: best.url || "",
      }
    : { detected: false, fieldCount: 0, ats: "", formUrl: "" };
}

function connectionStatus() {
  return {
    connected: socket?.readyState === WebSocket.OPEN,
    connecting: Boolean(socketPromise) || socket?.readyState === WebSocket.CONNECTING,
    tab: activeTab,
    frameCount: frames.size,
    formDetected: detectedForm.detected,
    fieldCount: detectedForm.fieldCount,
    ats: detectedForm.ats,
    formUrl: detectedForm.formUrl,
    aiCustomFields,
    fillStatus: fillRun.status,
    fillMessage: fillRun.message,
    fillResult: fillRun.result,
  };
}

function broadcastStatus() {
  const status = connectionStatus();
  chrome.runtime.sendMessage({ type: "jobflow.status_changed", ...status }).catch(() => {});
}

function promptForDetectedForm(message, tab) {
  if (!tab?.id) return;
  const promptKey = [
    tab.id,
    message.form_url || message.url || tab.url || "",
    message.ats || "generic",
    message.form_signature || message.field_count || "",
  ].join("|");
  if (promptKey === lastPromptedForm) return;
  lastPromptedForm = promptKey;
  void chrome.action?.setBadgeBackgroundColor?.({
    tabId: tab.id,
    color: "#171717",
  });
  void chrome.action?.setBadgeText?.({ tabId: tab.id, text: "1" });
  if (!chrome.action?.openPopup) return;
  void chrome.action
    .openPopup()
    .then(() => chrome.action?.setBadgeText?.({ tabId: tab.id, text: "" }))
    .catch(() => {});
}

function clearPromptBadge(tabId = activeTabId) {
  if (tabId == null) return;
  void chrome.action?.setBadgeText?.({ tabId, text: "" });
}

async function storedToken() {
  const stored = await chrome.storage.local.get("pairingToken");
  return String(stored.pairingToken || "").trim();
}

async function localPairingToken() {
  const response = await fetch(
    `${API_ORIGIN}/extension/status?include_pairing_token=true`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(`Cannot reach ${API_ORIGIN}. Start JobFlow and try again.`);
  }
  const status = await response.json();
  const token = String(status.pairing_token || "").trim();
  if (!token) throw new Error("JobFlow did not provide a local connection token.");
  return token;
}

async function loadExtensionPreferences() {
  const stored = await chrome.storage.local.get("aiCustomFields");
  aiCustomFields = Boolean(stored.aiCustomFields);
}

async function setAIForCustomFields(enabled) {
  aiCustomFields = Boolean(enabled);
  await chrome.storage.local.set({ aiCustomFields });
  broadcastStatus();
  return connectionStatus();
}

function sendToBackend(message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function sendCurrentState() {
  sendToBackend({
    type: "state",
    url: activeTab?.url || "",
    title: activeTab?.title || "",
    form_detected: detectedForm.detected,
    field_count: detectedForm.fieldCount,
    ats: detectedForm.ats,
    form_url: detectedForm.formUrl,
  });
}

async function localJson(path, body) {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // Preserve the HTTP status when the local backend returns no JSON.
  }
  if (!response.ok) {
    throw new Error(
      String(payload.detail || payload.message || `JobFlow request failed: ${response.status}`),
    );
  }
  return payload;
}

async function runDetectedFill() {
  if (!detectedForm.detected || detectedForm.fieldCount <= 0 || activeTabId == null) {
    throw new Error("No supported application form is ready.");
  }
  if (fillRun.status === "running") {
    throw new Error("JobFlow is already filling this page.");
  }

  fillRun = {
    status: "running",
    message: aiCustomFields
      ? "Preparing Profile values and source-backed AI answers..."
      : "Preparing saved Profile values...",
    result: null,
  };
  broadcastStatus();
  try {
    const form = await localJson("/automation/inspect", {});
    const plan = await localJson("/automation/prepare-fill-plan", {
      form,
      allow_ai_custom_fields: aiCustomFields,
    });
    const result = await localJson("/automation/apply-fill-plan", {
      plan,
      form,
      dry_run: false,
    });
    fillRun = {
      status: result.error_count > 0 ? "warning" : "success",
      message: `Filled ${result.filled_count}; ${result.review_count} left; ${result.error_count} errors.`,
      result,
    };
    broadcastStatus();
    return connectionStatus();
  } catch (error) {
    fillRun = {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to fill this page.",
      result: null,
    };
    broadcastStatus();
    throw error;
  }
}

function releaseCurrentTab() {
  const releasedTabId = activeTabId;
  activeTabId = null;
  activeTab = null;
  lastPromptedForm = "";
  frames.clear();
  detectedForm = { detected: false, fieldCount: 0, ats: "", formUrl: "" };
  fillRun = { status: "idle", message: "", result: null };
  clearPromptBadge(releasedTabId);
  broadcastStatus();
  return connectionStatus();
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (socket?.readyState === WebSocket.OPEN) return;
    ensureBackendConnection().catch(scheduleReconnect);
  }, 1500);
}

function closeSocket() {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  if (socket) {
    socket.onclose = null;
    socket.close();
  }
  socket = null;
}

function connectSocket(token, force = false) {
  if (!force && socket?.readyState === WebSocket.OPEN) return Promise.resolve();
  if (!force && socketPromise) return socketPromise;
  closeSocket();
  socketPromise = new Promise((resolve, reject) => {
    const nextSocket = new WebSocket(`${WS_ORIGIN}/extension/ws?token=${encodeURIComponent(token)}`);
    socket = nextSocket;
    const timeout = setTimeout(() => {
      reject(new Error("JobFlow backend connection timed out."));
      nextSocket.close();
    }, 5000);
    nextSocket.onopen = () => {
      clearTimeout(timeout);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      sendToBackend({
        type: "hello",
        protocol: 1,
        extension_version: chrome.runtime.getManifest().version,
        tab: activeTab,
      });
      sendCurrentState();
      heartbeat = setInterval(sendCurrentState, 20000);
      broadcastStatus();
      resolve();
    };
    nextSocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "command") void handleCommand(message);
      } catch {
        // Ignore malformed localhost messages and keep the user-controlled tab intact.
      }
    };
    nextSocket.onerror = () => {
      clearTimeout(timeout);
      reject(new Error(`Cannot reach ${API_ORIGIN}. Start JobFlow and try again.`));
    };
    nextSocket.onclose = () => {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      if (socket === nextSocket) socket = null;
      broadcastStatus();
      scheduleReconnect();
    };
  }).finally(() => {
    socketPromise = null;
  });
  return socketPromise;
}

function ensureBackendConnection() {
  if (socket?.readyState === WebSocket.OPEN) return Promise.resolve(connectionStatus());
  if (pairingPromise) return pairingPromise;

  pairingPromise = (async () => {
    const savedToken = await storedToken();
    if (savedToken) {
      try {
        await connectSocket(savedToken);
        return connectionStatus();
      } catch {
        // The desktop app may have replaced an old token. Refresh it locally.
      }
    }

    const token = await localPairingToken();
    await connectSocket(token, true);
    await chrome.storage.local.set({ pairingToken: token });
    return connectionStatus();
  })().finally(() => {
    pairingPromise = null;
  });

  return pairingPromise;
}

async function injectIntoTab(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ["jobflow-dom.js", "content.js"],
  });
  for (const result of results) {
    frames.set(result.frameId, { frameId: result.frameId, url: "" });
  }
  await Promise.all(
    results.map((result) =>
      chrome.tabs
        .sendMessage(
          tabId,
          { type: "jobflow.report_state" },
          { frameId: result.frameId },
        )
        .catch(() => {}),
    ),
  );
}

function isSupportedApplicationUrl(url) {
  try {
    const host = new URL(String(url)).hostname.toLowerCase();
    return SUPPORTED_HOSTS.some(
      (supported) => host === supported || host.endsWith(`.${supported}`),
    );
  } catch {
    return false;
  }
}

async function restoreSupportedTab(tab) {
  if (!tab?.id || !isSupportedApplicationUrl(tab.url)) return connectionStatus();
  activeTabId = tab.id;
  activeTab = { id: tab.id, url: tab.url, title: tab.title || "" };
  frames.clear();
  detectedForm = { detected: false, fieldCount: 0, ats: "", formUrl: "" };
  fillRun = { status: "idle", message: "", result: null };
  await injectIntoTab(tab.id);
  sendToBackend({
    type: "hello",
    protocol: 1,
    extension_version: chrome.runtime.getManifest().version,
    tab: activeTab,
  });
  broadcastStatus();
  return connectionStatus();
}

async function restoreActiveSupportedTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return restoreSupportedTab(tab);
}

async function connectActiveTab() {
  await ensureBackendConnection();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || /^(chrome|edge|about):/.test(tab.url)) {
    throw new Error("Open a job application webpage before using the current page.");
  }
  activeTabId = tab.id;
  activeTab = { id: tab.id, url: tab.url, title: tab.title || "" };
  frames.clear();
  await injectIntoTab(tab.id);
  sendToBackend({
    type: "hello",
    protocol: 1,
    extension_version: chrome.runtime.getManifest().version,
    tab: activeTab,
  });
  broadcastStatus();
  return connectionStatus();
}

function adoptDetectedForm(message, sender) {
  const tab = sender.tab;
  const fieldCount = Number(message.field_count || 0);
  if (!tab?.id || !tab.active || fieldCount <= 0) return false;
  if (activeTabId !== tab.id) {
    frames.clear();
  }
  activeTabId = tab.id;
  activeTab = {
    id: tab.id,
    url: tab.url || message.url || "",
    title: tab.title || message.title || "",
  };
  const frameId = sender.frameId ?? 0;
  frames.set(frameId, {
    frameId,
    url: message.form_url || message.url || "",
    ats: message.ats || "generic",
    fieldCount,
  });
  refreshDetectedFormFromFrames();
  fillRun = { status: "idle", message: "", result: null };
  promptForDetectedForm(message, tab);
  void ensureBackendConnection()
    .then(() => {
      sendToBackend({
        type: "hello",
        protocol: 1,
        extension_version: chrome.runtime.getManifest().version,
        tab: activeTab,
      });
      sendToBackend({
        type: "state",
        url: activeTab.url,
        title: activeTab.title,
        form_detected: true,
        field_count: fieldCount,
        ats: detectedForm.ats,
        form_url: detectedForm.formUrl,
        captcha_detected: Boolean(message.captcha_detected),
      });
      broadcastStatus();
    })
    .catch(scheduleReconnect);
  return true;
}

async function snapshotFrames() {
  if (activeTabId == null) return [];
  const snapshots = [];
  for (const [frameId] of [...frames]) {
    try {
      const response = await chrome.tabs.sendMessage(
        activeTabId,
        { type: "jobflow.snapshot" },
        { frameId },
      );
      if (response?.ok && response.snapshot) {
        snapshots.push({ ...response.snapshot, frame_id: frameId });
        frames.set(frameId, {
          frameId,
          url: response.snapshot.url,
          ats: response.snapshot.form?.ats || "generic",
          fieldCount: Number(response.snapshot.form?.fields?.length || 0),
        });
      }
    } catch {
      frames.delete(frameId);
    }
  }
  return snapshots;
}

async function fetchLocalDocument(url) {
  const response = await fetch(String(url), { cache: "no-store" });
  if (!response.ok) throw new Error(`Local document read failed: ${response.status}`);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > 10 * 1024 * 1024) {
    throw new Error("Local document exceeds the 10 MB extension limit.");
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  const disposition = response.headers.get("content-disposition") || "";
  const matchedName = disposition.match(/filename="?([^";]+)"?/i);
  return {
    base64: btoa(binary),
    filename: matchedName?.[1] || "resume.pdf",
    type: response.headers.get("content-type") || "application/octet-stream",
  };
}

function frameForForm(form) {
  const exact = [...frames.values()].find((frame) => frame.url === form?.url);
  if (exact) return exact.frameId;
  const atsMatch = [...frames.values()].find((frame) => frame.ats === form?.ats);
  return atsMatch?.frameId ?? 0;
}

async function handleCommand(message) {
  const { command, payload = {}, request_id: requestId } = message;
  try {
    let result = {};
    if (command === "snapshot") {
      result = { snapshots: await snapshotFrames() };
    } else if (command === "fill_plan") {
      if (activeTabId == null) throw new Error("No Chrome tab is authorized.");
      const response = await chrome.tabs.sendMessage(
        activeTabId,
        {
          type: "jobflow.fill_plan",
          plan: payload.plan,
          form: payload.form,
        },
        { frameId: frameForForm(payload.form) },
      );
      if (!response?.ok) throw new Error(response?.error || "Active-tab fill failed.");
      result = { result: response.result };
    } else if (command === "navigate") {
      if (activeTabId == null) throw new Error("No Chrome tab is authorized.");
      const tab = await chrome.tabs.update(activeTabId, { url: payload.url, active: true });
      activeTab = { id: tab.id, url: payload.url, title: tab.title || "" };
      frames.clear();
      result = { url: payload.url };
    } else if (command === "focus") {
      if (activeTabId == null) throw new Error("No Chrome tab is authorized.");
      await chrome.tabs.update(activeTabId, { active: true });
    } else if (command === "disconnect") {
      result = { disconnected: true };
    } else {
      throw new Error(`Unsupported JobFlow command: ${command}`);
    }
    sendToBackend({ type: "result", request_id: requestId, ok: true, payload: result });
    if (command === "disconnect") setTimeout(releaseCurrentTab, 50);
  } catch (error) {
    sendToBackend({
      type: "result",
      request_id: requestId,
      ok: false,
      error: error instanceof Error ? error.message : "Extension command failed.",
    });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "jobflow.frame_ready") {
    if (adoptDetectedForm(message, sender)) {
      sendResponse({ ok: true, detected: true, status: connectionStatus() });
      return;
    }
    if (sender.tab?.id !== activeTabId) {
      sendResponse({
        ok: true,
        detected: false,
        status: connectionStatus(),
      });
      return;
    }
    frames.set(sender.frameId ?? 0, {
      frameId: sender.frameId ?? 0,
      url: message.form_url || message.url || "",
      ats: message.ats || "generic",
      fieldCount: Number(message.field_count || 0),
    });
    refreshDetectedFormFromFrames();
    sendToBackend({
      type: "state",
      url: activeTab?.url || message.url || "",
      title: activeTab?.title || message.title || "",
      form_detected: detectedForm.detected,
      field_count: detectedForm.fieldCount,
      ats: detectedForm.ats,
      form_url: detectedForm.formUrl,
      captcha_detected: Boolean(message.captcha_detected),
    });
    sendResponse({ ok: true, status: connectionStatus() });
    return;
  }
  if (message?.type === "jobflow.pair") {
    ensureBackendConnection()
      .then(() => sendResponse({ ok: true, status: connectionStatus() }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Local connection failed.",
        }),
      );
    return true;
  }
  if (message?.type === "jobflow.set_ai_custom_fields") {
    setAIForCustomFields(message.enabled)
      .then((status) => sendResponse({ ok: true, status }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unable to save AI preference.",
        }),
      );
    return true;
  }
  if (message?.type === "jobflow.start_fill") {
    runDetectedFill()
      .then((status) => sendResponse({ ok: true, status }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unable to fill this page.",
        }),
      );
    return true;
  }
  if (message?.type === "jobflow.connect") {
    connectActiveTab()
      .then((status) => sendResponse({ ok: true, status }))
      .catch((error) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "Connect failed." }),
      );
    return true;
  }
  if (message?.type === "jobflow.disconnect_tab") {
    sendResponse({ ok: true, status: releaseCurrentTab() });
    return;
  }
  if (message?.type === "jobflow.fetch_document") {
    fetchLocalDocument(message.url)
      .then((payload) => sendResponse({ ok: true, payload }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Local document read failed.",
        }),
      );
    return true;
  }
  if (message?.type === "jobflow.status") {
    clearPromptBadge();
    ensureBackendConnection()
      .catch(() => {})
      .then(() => storedToken())
      .then((token) =>
        sendResponse({ ...connectionStatus(), hasToken: Boolean(token) }),
      );
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) releaseCurrentTab();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId !== activeTabId) return;
  activeTab = { id: tabId, url: tab.url || activeTab?.url || "", title: tab.title || "" };
  if (changeInfo.status !== "complete") return;
  lastPromptedForm = "";
  frames.clear();
  detectedForm = { detected: false, fieldCount: 0, ats: "", formUrl: "" };
  injectIntoTab(tabId).catch(() => {
    sendToBackend({
      type: "state",
      url: activeTab.url,
      title: activeTab.title,
      captcha_detected: false,
    });
  });
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs
    .get(tabId)
    .then((tab) => restoreSupportedTab(tab))
    .catch(() => {});
});

void loadExtensionPreferences()
  .then(() => {
    broadcastStatus();
    return ensureBackendConnection();
  })
  .then(() => restoreActiveSupportedTab())
  .catch(scheduleReconnect);
