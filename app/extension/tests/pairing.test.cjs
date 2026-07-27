const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const extensionRoot = path.resolve(__dirname, "..");

test("extension refreshes a stale token and saves only the verified token", async () => {
  const sockets = [];
  const writes = [];
  const listeners = [];

  class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 3;

    constructor(url) {
      this.url = url;
      this.readyState = MockWebSocket.CONNECTING;
      sockets.push(this);
      queueMicrotask(() => {
        if (url.includes("stale-token")) {
          this.readyState = MockWebSocket.CLOSED;
          this.onerror?.();
          this.onclose?.();
          return;
        }
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.();
      });
    }

    close() {
      this.readyState = MockWebSocket.CLOSED;
      this.onclose?.();
    }

    send() {}
  }

  const chrome = {
    runtime: {
      getManifest: () => ({ version: "0.3.0" }),
      onMessage: { addListener: (listener) => listeners.push(listener) },
      sendMessage: () => Promise.resolve(),
    },
    scripting: { executeScript: async () => [] },
    storage: {
      local: {
        get: async () => ({ pairingToken: "stale-token" }),
        set: async (value) => writes.push(value),
      },
    },
    tabs: {
      get: async () => null,
      onActivated: { addListener() {} },
      onRemoved: { addListener() {} },
      onUpdated: { addListener() {} },
      query: async () => [],
      sendMessage: async () => ({ ok: true }),
    },
  };

  const context = {
    WebSocket: MockWebSocket,
    chrome,
    clearInterval() {},
    clearTimeout,
    console,
    fetch: async () => ({
      ok: true,
      json: async () => ({ pairing_token: "current-token" }),
    }),
    queueMicrotask,
    setInterval: () => 1,
    setTimeout,
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(extensionRoot, "background.js"), "utf8"),
    context,
  );

  assert.equal(
    context.filenameFromContentDisposition(
      "attachment; filename*=utf-8''Tao%20Hu%20R%C3%A9sum%C3%A9%202026.pdf",
    ),
    "Tao Hu Résumé 2026.pdf",
  );
  assert.equal(
    context.filenameFromContentDisposition(
      'attachment; filename="Tao Hu Resume 2026.pdf"',
    ),
    "Tao Hu Resume 2026.pdf",
  );

  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(sockets.length, 2);
  assert.match(sockets[0].url, /stale-token/);
  assert.match(sockets[1].url, /current-token/);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].pairingToken, "current-token");

  const statusListener = listeners.find((listener) => {
    let responded = false;
    const keepAlive = listener(
      { type: "jobflow.status" },
      {},
      () => {
        responded = true;
      },
    );
    return keepAlive === true && responded === false;
  });
  assert.equal(typeof statusListener, "function");
});

test("popup owns fill controls without pairing or manual page connection", () => {
  const popup = fs.readFileSync(path.join(extensionRoot, "popup.html"), "utf8");
  assert.doesNotMatch(popup, /pairing-token|pairing code/i);
  assert.doesNotMatch(popup, /Use current page|Release page/);
  assert.match(popup, /Start filling/);
  assert.match(popup, /AI answers/);
  assert.match(popup, /CAPTCHA and submit stay manual/);
});

test("detected forms open the toolbar popup without injecting page controls", () => {
  const content = fs.readFileSync(path.join(extensionRoot, "content.js"), "utf8");
  const background = fs.readFileSync(path.join(extensionRoot, "background.js"), "utf8");
  assert.doesNotMatch(content, /attachShadow|jobflow-extension-controls/);
  assert.match(background, /\.openPopup\(\)/);
  assert.match(background, /\/automation\/inspect/);
  assert.match(background, /\/automation\/prepare-fill-plan/);
  assert.match(background, /\/automation\/apply-fill-plan/);
  assert.match(background, /allow_ai_custom_fields: aiCustomFields/);
});

test("extension start action runs one page and forwards the saved AI option", async () => {
  const listeners = [];
  const requests = [];
  const socketMessages = [];
  let popupOpenCount = 0;
  const badgeTexts = [];

  class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;

    constructor() {
      this.readyState = MockWebSocket.CONNECTING;
      queueMicrotask(() => {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.();
      });
    }

    close() {}
    send(message) {
      socketMessages.push(JSON.parse(message));
    }
  }

  const chrome = {
    action: {
      openPopup: async () => {
        popupOpenCount += 1;
      },
      setBadgeBackgroundColor: async () => {},
      setBadgeText: async ({ text }) => {
        badgeTexts.push(text);
      },
    },
    runtime: {
      getManifest: () => ({ version: "0.5.5" }),
      onMessage: { addListener: (listener) => listeners.push(listener) },
      sendMessage: () => Promise.resolve(),
    },
    scripting: { executeScript: async () => [] },
    storage: {
      local: {
        get: async () => ({ pairingToken: "verified-token", aiCustomFields: false }),
        set: async () => {},
      },
    },
    tabs: {
      get: async () => null,
      onActivated: { addListener() {} },
      onRemoved: { addListener() {} },
      onUpdated: { addListener() {} },
      query: async () => [],
      sendMessage: async () => ({ ok: true }),
    },
  };

  const context = {
    WebSocket: MockWebSocket,
    chrome,
    clearInterval() {},
    clearTimeout,
    console,
    fetch: async (url, options = {}) => {
      requests.push({
        url,
        body: options.body ? JSON.parse(options.body) : null,
      });
      if (url.endsWith("/automation/inspect")) {
        return {
          ok: true,
          json: async () => ({
            ats: "ashby",
            url: "https://jobs.ashbyhq.com/example/application",
            fields: [{ field_id: "name" }],
          }),
        };
      }
      if (url.endsWith("/automation/prepare-fill-plan")) {
        return {
          ok: true,
          json: async () => ({ form_url: "https://jobs.ashbyhq.com/example/application" }),
        };
      }
      if (url.endsWith("/automation/apply-fill-plan")) {
        return {
          ok: true,
          json: async () => ({
            filled_count: 1,
            review_count: 0,
            error_count: 0,
          }),
        };
      }
      return { ok: true, json: async () => ({ pairing_token: "verified-token" }) };
    },
    queueMicrotask,
    setInterval: () => 1,
    setTimeout,
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(extensionRoot, "background.js"), "utf8"),
    context,
  );
  await new Promise((resolve) => setTimeout(resolve, 10));

  const listener = listeners[0];
  listener(
    {
      type: "jobflow.frame_ready",
      field_count: 1,
      form_signature: "workday-step-one",
      ats: "ashby",
      form_url: "https://jobs.ashbyhq.com/example/application",
    },
    {
      frameId: 0,
      tab: {
        id: 42,
        active: true,
        url: "https://jobs.ashbyhq.com/example/application",
        title: "Example role",
      },
    },
    () => {},
  );
  listener(
    {
      type: "jobflow.frame_ready",
      field_count: 0,
      ats: "generic",
      form_url: "about:blank",
    },
    {
      frameId: 7,
      tab: {
        id: 42,
        active: true,
        url: "https://jobs.ashbyhq.com/example/application",
        title: "Example role",
      },
    },
    () => {},
  );
  await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(popupOpenCount, 1);
  assert.equal(badgeTexts.at(-1), "");
  listener(
    {
      type: "jobflow.frame_ready",
      field_count: 2,
      form_signature: "workday-step-two",
      ats: "ashby",
      form_url: "https://jobs.ashbyhq.com/example/application",
    },
    {
      frameId: 0,
      tab: {
        id: 42,
        active: true,
        url: "https://jobs.ashbyhq.com/example/application",
        title: "Example role",
      },
    },
    () => {},
  );
  await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(popupOpenCount, 2);

  await new Promise((resolve, reject) => {
    listener(
      { type: "jobflow.set_ai_custom_fields", enabled: true },
      {},
      (response) => (response.ok ? resolve() : reject(new Error(response.error))),
    );
  });
  const fillResponse = await new Promise((resolve, reject) => {
    listener(
      { type: "jobflow.start_fill" },
      {},
      (response) => (response.ok ? resolve(response) : reject(new Error(response.error))),
    );
  });

  assert.deepEqual(
    requests
      .filter((request) => request.url.includes("/automation/"))
      .map((request) => new URL(request.url).pathname),
    [
      "/automation/inspect",
      "/automation/prepare-fill-plan",
      "/automation/apply-fill-plan",
    ],
  );
  const prepareRequest = requests.find((request) =>
    request.url.endsWith("/automation/prepare-fill-plan"),
  );
  assert.equal(prepareRequest.body.allow_ai_custom_fields, true);
  assert.equal(fillResponse.status.fillResult.filled_count, 1);
  assert.match(fillResponse.status.fillMessage, /Filled 1; 0 left; 0 errors/);
  const lastState = socketMessages.filter((message) => message.type === "state").at(-1);
  assert.equal(lastState.form_detected, true);
  assert.equal(lastState.field_count, 2);
  assert.equal(lastState.ats, "ashby");
});

test("supported ATS pages receive automatic all-frame form detection", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(extensionRoot, "manifest.json"), "utf8"),
  );
  const detector = manifest.content_scripts[0];

  assert.equal(detector.all_frames, true);
  assert.deepEqual(detector.js, ["jobflow-dom.js", "content.js"]);
  assert.ok(detector.matches.includes("https://*.ashbyhq.com/*"));
  assert.ok(detector.matches.includes("https://*.greenhouse.io/*"));
  assert.ok(detector.matches.includes("https://*.myworkdayjobs.com/*"));
  assert.ok(detector.matches.includes("https://*.oraclecloud.com/*"));
  assert.ok(detector.matches.includes("https://jobs.lever.co/*"));
});

test("extension startup restores the active supported application tab", () => {
  const background = fs.readFileSync(path.join(extensionRoot, "background.js"), "utf8");
  assert.match(background, /restoreActiveSupportedTab/);
  assert.match(background, /isSupportedApplicationUrl/);
  assert.match(background, /injectIntoTab\(tab\.id\)/);
  assert.match(background, /chrome\.tabs\.onActivated/);
  assert.match(background, /jobflow\.report_state/);
});
