(function initializeJobFlowContent() {
  const contentVersion = chrome.runtime.getManifest().version;
  if (globalThis.__jobflowContentVersion === contentVersion) return;
  globalThis.__jobflowContentVersion = contentVersion;

  globalThis.__jobflowWorkdaySearch = async (control, value) => {
    const response = await chrome.runtime.sendMessage({
      type: "jobflow.workday_search",
      control_id: control?.id || "",
      value: String(value || ""),
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Workday search failed.");
    }
    return true;
  };

  globalThis.__jobflowWorkdayOption = async (control, value) => {
    const response = await chrome.runtime.sendMessage({
      type: "jobflow.workday_option",
      control_id: control?.id || "",
      value: String(value || ""),
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Workday option selection failed.");
    }
    return true;
  };

  function snapshot() {
    const form = JobFlowDOM.extractForm(document, location.href);
    const rawHtml = document.documentElement?.outerHTML || "";
    const html =
      rawHtml.length <= 1_500_000
        ? rawHtml
        : `<title>${document.title}</title><main>${(document.body?.innerText || "").slice(0, 500_000)}</main>`;
    return {
      url: location.href,
      title: document.title,
      html,
      form,
      captcha_detected: JobFlowDOM.captchaPresent(document),
    };
  }

  let reportTimer = null;
  let lastReportSignature = "";

  function reportFormState() {
    const current = snapshot();
    const signature = JSON.stringify([
      current.form.url,
      current.form.ats,
      current.form.fields.map((field) => field.field_id),
    ]);
    if (signature === lastReportSignature) return;
    lastReportSignature = signature;
    void chrome.runtime
      .sendMessage({
        type: "jobflow.frame_ready",
        url: location.href,
        title: document.title,
        form_detected: current.form.fields.length > 0,
        field_count: current.form.fields.length,
        form_signature: signature,
        ats: current.form.ats,
        form_url: current.form.url,
        captcha_detected: current.captcha_detected,
      })
      .catch(() => {});
  }

  function scheduleFormReport() {
    if (reportTimer !== null) window.clearTimeout(reportTimer);
    reportTimer = window.setTimeout(reportFormState, 450);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "jobflow.report_state") {
      lastReportSignature = "";
      reportFormState();
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "jobflow.snapshot") {
      sendResponse({ ok: true, snapshot: snapshot() });
      return;
    }
    if (message?.type === "jobflow.fill_plan") {
      JobFlowDOM.applyFillPlan(message.plan, message.form, document)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Fill failed.",
          }),
        );
      return true;
    }
  });

  reportFormState();
  new MutationObserver(scheduleFormReport).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
