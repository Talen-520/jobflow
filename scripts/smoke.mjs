import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const root = new URL("..", import.meta.url);
const backendDir = new URL("app/backend/", root);
const port = Number(process.env.JOBFLOW_SMOKE_PORT ?? 18765);
const baseUrl = `http://127.0.0.1:${port}`;
const smokeDir = await mkdtemp(join(tmpdir(), "jobflow-smoke-"));
const resumePath = join(smokeDir, "resume.pdf");
const dbPath = join(smokeDir, "jobflow-smoke.sqlite");
const vaultPath = join(smokeDir, "vault");

let backend;
let extensionSocket;

try {
  await writeFile(resumePath, "%PDF-1.4 smoke resume\n");
  backend = startBackend();
  await waitForHealth();
  extensionSocket = await connectExtensionSimulator();

  const health = await getJson("/health");
  assert(health.status === "ok", "health endpoint returned ok");

  const demoHtml = await getText("/demo/application");
  assert(demoHtml.includes('data-jobflow-demo="application"'), "demo application served");

  const savedProfile = await putJson("/profile", {
    identity: {
      first_name: "Tao",
      last_name: "Hu",
      email: "tao@example.com",
      phone: "555-0100",
    },
    links: {
      linkedin: "https://linkedin.com/in/taohu",
    },
    work_authorization: {
      country: "US",
      authorized: true,
      requires_sponsorship: false,
    },
    preferences: {
      company: "AutoJob Labs",
      university: "Example University",
      heard_about_opportunity: "LinkedIn",
      disability_status: "No, I do not have a disability",
      veteran_status: "I am not a protected veteran",
    },
    documents: [
      {
        kind: "resume",
        name: "Smoke Resume",
        path: resumePath,
      },
    ],
    answer_bank: [
      {
        id: "answer_smoke_motivation",
        question_type: "motivation",
        title: "Smoke motivation",
        body: "I enjoy building local AI workflow tools that reduce repetitive manual work.",
        tags: ["ai", "automation"],
      },
    ],
    experience_facts: [
      {
        id: "fact_smoke_automation",
        title: "Automation",
        body: "Built source-backed application workflow automation.",
        tags: ["automation"],
      },
    ],
  });
  const resumeDocumentId = savedProfile.documents.find(
    (document) => document.kind === "resume",
  )?.id;
  assert(Boolean(resumeDocumentId), "seeded smoke profile stored resume document");
  console.log("✓ seeded smoke profile");

  const context = await getJson("/automation/context-preview");
  assert(context.source_count >= 6, "prompt context includes seeded local sources");

  const form = await postJson("/automation/inspect", {
    url: `${baseUrl}/demo/application`,
    html: demoHtml,
  });
  assert(form.fields.length >= 14, "demo form inspection found representative fields");
  assert(form.company_name_hint === "JobFlow Demo Co", "demo form extracted company hint");
  assert(form.job_title_hint === "Frontend Engineer", "demo form extracted job title hint");
  assert(form.fields.some((field) => field.field_id === "resume"), "resume field detected");

  const plan = await postJson("/automation/create-fill-plan", { form });
  assert(plan.items.some((item) => item.field_id === "resume"), "resume upload planned");
  assert(plan.items.some((item) => item.field_id === "motivation"), "motivation planned");
  assert(plan.items.some((item) => item.field_id === "sponsorship"), "sponsorship planned");
  assert(
    plan.items.some(
      (item) =>
        item.field_id === "current_company" &&
        item.value === "AutoJob Labs" &&
        item.source_refs.includes("profile.preferences.company"),
    ),
    "current company planned from saved profile preference",
  );
  assert(
    plan.items.some(
      (item) =>
        item.field_id === "university" &&
        item.value === "Example University" &&
        item.source_refs.includes("profile.preferences.university"),
    ),
    "university planned from saved profile preference",
  );
  assert(
    plan.items.some(
      (item) =>
        item.field_id === "source" &&
        item.value === "LinkedIn" &&
        item.source_refs.includes("profile.preferences.heard_about_opportunity"),
    ),
    "opportunity source planned from saved profile preference",
  );
  assert(plan.blocked_items.some((item) => item.field_id === "salary"), "salary blocked by policy");
  assert(
    plan.items.some(
      (item) =>
        item.field_id === "disability" &&
        item.value === "No, I do not have a disability" &&
        item.needs_review === false &&
        item.source_refs.includes("profile.preferences.disability_status"),
    ),
    "saved disability value is source-backed and ready",
  );
  assert(
    plan.items.some(
      (item) =>
        item.field_id === "veteran" &&
        item.value === "I am not a protected veteran" &&
        item.needs_review === false &&
        item.source_refs.includes("profile.preferences.veteran_status"),
    ),
    "saved veteran value is source-backed and ready",
  );

  let reviewedPlan = plan;
  reviewedPlan = (
    await postJson("/automation/review-field", {
      field_id: "motivation",
      decision: "accept",
      current_plan: reviewedPlan,
      form,
    })
  ).updated_plan;
  reviewedPlan = (
    await postJson("/automation/review-field", {
      field_id: "salary",
      decision: "edit",
      value: "$120,000 base",
      current_plan: reviewedPlan,
      form,
    })
  ).updated_plan;
  assert(
    !reviewedPlan.blocked_items.some((item) => item.field_id === "salary"),
    "salary review converted blocked field",
  );

  const dryRun = await postJson("/automation/apply-fill-plan", {
    plan: reviewedPlan,
    form,
    dry_run: true,
  });
  assert(dryRun.status === "dry_run", "safe fill dry run completed");
  assert(dryRun.filled_count >= 8, "safe fill dry run found eligible fields");

  await putJson("/preferences", {
    final_submission_mode: "manual_only",
    fill_sensitive_fields: true,
    fill_eeo_fields: true,
    open_answer_style: "concise_professional",
    open_answer_max_words: 180,
    salary_answer_policy: "ask_user",
    relocation_policy: "ask_user",
    missing_fact_policy: "ask_user",
    low_confidence_policy: "pause",
  });

  for (const atsDemo of [
    {
      ats: "greenhouse",
      path: "/demo/greenhouse/application",
      company: "Example Robotics",
      title: "Backend Engineer",
      fields: ["first_name", "last_name", "email", "authorized", "resume"],
    },
    {
      ats: "lever",
      path: "/demo/lever/application",
      company: "Example Analytics",
      title: "Frontend Engineer",
      fields: ["name", "email", "authorized", "urls[LinkedIn]", "resume"],
    },
    {
      ats: "ashby",
      path: "/demo/ashby/application",
      company: "Ashby Demo Co",
      title: "Product Engineer",
      // The protocol simulator sends static HTML. The real extension adds the
      // button-only sponsorship control through jobflow-dom.js.
      fields: ["name", "email", "resume"],
    },
    {
      ats: "oracle",
      path: "/demo/oracle/application",
      company: "Oracle Demo Co",
      title: "Cloud Engineer",
      fields: ["email", "linkedin", "resume"],
    },
    {
      ats: "workday",
      path: "/demo/workday/application",
      company: "Workday Demo Co",
      title: "Software Engineer",
      fields: ["name", "email", "phone", "sponsorship"],
    },
  ]) {
    const atsOpened = await postJson("/browser/open", {
      url: `${baseUrl}${atsDemo.path}`,
    });
    assert(atsOpened.status === "opened", `${atsDemo.ats} demo opened in browser`);
    const atsForm = await postJson("/automation/inspect", {});
    assert(atsForm.ats === atsDemo.ats, `${atsDemo.ats} demo selected adapter`);
    assert(
      atsForm.company_name_hint === atsDemo.company,
      `${atsDemo.ats} demo extracted company hint`,
    );
    assert(
      atsForm.job_title_hint === atsDemo.title,
      `${atsDemo.ats} demo extracted job title hint`,
    );
    assert(
      atsDemo.fields.every((fieldId) =>
        atsForm.fields.some((field) => field.field_id === fieldId),
      ),
      `${atsDemo.ats} demo extracted representative fields`,
    );
    const atsPlan = await postJson("/automation/create-fill-plan", { form: atsForm });
    const missingSourceBackedFields = atsDemo.fields.filter(
      (fieldId) =>
        !atsPlan.items.some(
          (item) => item.field_id === fieldId && item.source_refs.length > 0,
        ),
    );
    assert(
      missingSourceBackedFields.length === 0,
      `${atsDemo.ats} demo created source-backed fill plan; missing: ${missingSourceBackedFields.join(", ") || "none"}`,
    );
    const atsFill = await postJson("/automation/apply-fill-plan", {
      plan: atsPlan,
      form: atsForm,
      dry_run: false,
    });
    assert(atsFill.status === "applied", `${atsDemo.ats} demo safe fill applied`);
    assert(atsFill.error_count === 0, `${atsDemo.ats} demo safe fill verified DOM values`);
    assert(
      atsFill.filled_count >= atsDemo.fields.length,
      `${atsDemo.ats} demo filled high-confidence fields`,
    );
    if (["greenhouse", "ashby", "oracle", "workday"].includes(atsDemo.ats)) {
      const submitted = await postJson("/browser/open", {
        url: `${baseUrl}/demo/${atsDemo.ats}/submitted`,
      });
      assert(submitted.status === "opened", `${atsDemo.ats} success page opened`);
      const detected = await postJson("/automation/detect-success", {
        ats: atsDemo.ats,
        company_name_hint: atsDemo.company,
        job_title_hint: atsDemo.title,
      });
      assert(detected.detected === true, `${atsDemo.ats} success detected`);
      assert(
        detected.signals.some((signal) => signal.startsWith(`${atsDemo.ats}:`)),
        `${atsDemo.ats} emitted dedicated success signal`,
      );
    }
  }

  const opened = await postJson("/browser/open", {
    url: `${baseUrl}/demo/application`,
  });
  assert(opened.status === "opened", "extension bridge opened demo application");
  const browserForm = await postJson("/automation/inspect", {});
  assert(
    browserForm.fields.length >= 14,
    "extension snapshot inspection found demo fields",
  );
  assert(
    browserForm.company_name_hint === "JobFlow Demo Co",
    "extension snapshot extracted company hint",
  );
  assert(
    browserForm.job_title_hint === "Frontend Engineer",
    "extension snapshot extracted job title hint",
  );
  const browserFill = await postJson("/automation/apply-fill-plan", {
    plan: reviewedPlan,
    form: browserForm,
    dry_run: false,
  });
  assert(browserFill.status === "applied", "safe fill applied through extension bridge");
  assert(browserFill.error_count === 0, "extension fill returned verified values");
  assert(
    browserFill.filled_count >= 8,
    "extension filled eligible source-backed fields",
  );

  const submittedHtml = await getText("/demo/submitted");
  const success = await postJson("/automation/detect-success", {
    url: `${baseUrl}/demo/submitted`,
    html: submittedHtml,
    ats: "generic",
  });
  assert(success.detected === true, "demo submitted page detected as success");
  assert(
    success.proposed_record?.company_name === "JobFlow Demo Co",
    "success proposal includes demo company",
  );

  const submittedPage = await postJson("/browser/open", {
    url: `${baseUrl}/demo/submitted`,
  });
  assert(submittedPage.status === "opened", "extension bridge opened submitted page");
  const browserSuccess = await postJson("/automation/detect-success", {});
  assert(browserSuccess.detected === true, "extension snapshot success page detected");
  assert(
    browserSuccess.proposed_record?.company_name === "JobFlow Demo Co",
    "browser success proposal includes demo company",
  );
  await postJson("/browser/stop", {});

  const uploadedDocuments = uploadedDocumentIdsFromPlan(reviewedPlan);
  assert(
    uploadedDocuments.resume_document_id === resumeDocumentId,
    "fill plan links uploaded resume to saved document id",
  );

  const answersSnapshot = buildApplicationAnswersSnapshot(reviewedPlan, browserFill);
  assert(answersSnapshot.version === 1, "answers snapshot uses current schema version");
  assert(
    answersSnapshot.summary.filled_count === browserFill.filled_count,
    "answers snapshot records browser fill count",
  );
  assert(
    answersSnapshot.fields.some(
      (field) =>
        field.field_id === "current_company" &&
        field.status === "filled" &&
        field.source_refs.includes("profile.preferences.company"),
    ),
    "answers snapshot stores source-backed filled fields",
  );
  assert(
    answersSnapshot.fields.some(
      (field) =>
        field.field_id === "disability" &&
        field.status === "filled" &&
        field.source_refs.includes("profile.preferences.disability_status"),
    ),
    "answers snapshot stores source-backed EEO fields",
  );

  const applicationRecord = {
    ...browserSuccess.proposed_record,
    ...uploadedDocuments,
    answers_snapshot: answersSnapshot,
  };
  const savedApplication = await postJson("/applications", applicationRecord);
  assert(
    savedApplication.resume_document_id === resumeDocumentId,
    "application record stores uploaded resume id",
  );
  assert(
    savedApplication.answers_snapshot?.fields?.some(
      (field) =>
        field.field_id === "email" &&
        field.source_refs.includes("profile.identity.email"),
    ),
    "application record stores answer source provenance",
  );

  const applications = await getJson("/applications");
  assert(applications.length === 1, "application record saved");
  assert(
    applications[0].answers_snapshot?.fields?.length === answersSnapshot.fields.length,
    "application history preserves answer snapshot fields",
  );

  console.log("\nJobFlow smoke passed");
} finally {
  extensionSocket?.close();
  await stopBackend();
}

function startBackend() {
  const venvPython = new URL("app/backend/.venv/bin/python", root);
  const command = existsSync(venvPython) ? venvPython.pathname : "uv";
  const args = existsSync(venvPython)
    ? ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(port)]
    : [
        "run",
        "uvicorn",
        "app.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
      ];
  const child = spawn(
    command,
    args,
    {
      cwd: backendDir,
      env: {
        ...process.env,
        JOBFLOW_DB_PATH: dbPath,
        JOBFLOW_VAULT_PATH: vaultPath,
        JOBFLOW_EXTENSION_API_ORIGIN: baseUrl,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", (chunk) => process.stdout.write(`[backend] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[backend] ${chunk}`));
  child.on("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`[backend] exited with ${signal ?? code}`);
    }
  });
  return child;
}

async function connectExtensionSimulator() {
  const pairing = await getJson("/extension/status?include_pairing_token=true");
  const websocketUrl = `ws://127.0.0.1:${port}/extension/ws?token=${encodeURIComponent(pairing.pairing_token)}`;
  const socket = new WebSocket(websocketUrl);
  let currentUrl = `${baseUrl}/demo/application`;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Extension simulator timed out")), 5000);
    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      socket.send(JSON.stringify({
        type: "hello",
        protocol: 1,
        extension_version: "smoke",
        tab: { url: currentUrl, title: "JobFlow smoke tab" },
      }));
      resolve();
    }, { once: true });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("Extension simulator could not connect"));
    }, { once: true });
  });

  socket.addEventListener("message", (event) => {
    void (async () => {
      const message = JSON.parse(event.data);
      if (message.type !== "command") return;
      try {
        let payload = {};
        if (message.command === "navigate") {
          currentUrl = message.payload.url;
          payload = { url: currentUrl };
        } else if (message.command === "snapshot") {
          payload = {
            snapshots: [{
              url: currentUrl,
              title: "JobFlow smoke tab",
              html: await (await fetch(currentUrl)).text(),
              captcha_detected: false,
            }],
          };
        } else if (message.command === "fill_plan") {
          payload = { result: simulatedFillResult(message.payload.plan) };
        } else if (message.command === "disconnect") {
          payload = { disconnected: true };
        } else {
          throw new Error(`Unsupported smoke command: ${message.command}`);
        }
        socket.send(JSON.stringify({
          type: "result",
          request_id: message.request_id,
          ok: true,
          payload,
        }));
      } catch (error) {
        socket.send(JSON.stringify({
          type: "result",
          request_id: message.request_id,
          ok: false,
          error: error instanceof Error ? error.message : "Smoke extension failed",
        }));
      }
    })();
  });
  return socket;
}

function simulatedFillResult(plan) {
  const result = {
    status: "applied",
    filled_count: 0,
    skipped_count: 0,
    review_count: 0,
    error_count: 0,
    items: [],
  };
  for (const item of plan.items ?? []) {
    const eligible =
      item.action !== "skip" &&
      !item.needs_review &&
      Number(item.confidence) >= 0.85 &&
      (item.source_refs ?? []).length > 0;
    result.items.push({
      field_id: item.field_id,
      status: eligible ? "filled" : item.needs_review ? "needs_review" : "skipped",
      reason: eligible
        ? "Filled by extension protocol simulator."
        : "Not eligible for extension write.",
    });
    if (eligible) result.filled_count += 1;
    else if (item.needs_review) result.review_count += 1;
    else result.skipped_count += 1;
  }
  for (const blocked of plan.blocked_items ?? []) {
    result.items.push({ ...blocked, status: "blocked" });
    result.review_count += 1;
  }
  return result;
}

async function waitForHealth() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      await sleep(250);
      continue;
    }
    await sleep(250);
  }
  throw new Error("Timed out waiting for smoke backend health");
}

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  await assertOk(response, `GET ${path}`);
  return response.json();
}

async function getText(path) {
  const response = await fetch(`${baseUrl}${path}`);
  await assertOk(response, `GET ${path}`);
  return response.text();
}

async function postJson(path, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await assertOk(response, `POST ${path}`);
  return response.json();
}

async function putJson(path, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await assertOk(response, `PUT ${path}`);
  return response.json();
}

async function assertOk(response, label) {
  if (response.ok) {
    return;
  }
  const body = await response.text();
  throw new Error(`${label} failed: ${response.status} ${body}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Smoke assertion failed: ${message}`);
  }
  console.log(`✓ ${message}`);
}

function uploadedDocumentIdsFromPlan(plan) {
  const documents = {};
  for (const item of plan.items ?? []) {
    if (item.action !== "upload") {
      continue;
    }
    const documentId = (item.source_refs ?? [])
      .find((sourceRef) => sourceRef.startsWith("profile.documents."))
      ?.replace("profile.documents.", "");
    if (!documentId) {
      continue;
    }

    const fieldText = `${item.field_id} ${item.reason}`.toLowerCase();
    if (fieldText.includes("cover")) {
      documents.cover_letter_document_id = documentId;
    } else {
      documents.resume_document_id = documentId;
    }
  }
  return documents;
}

function buildApplicationAnswersSnapshot(plan, result) {
  const resultByField = new Map(
    (result.items ?? []).map((item) => [item.field_id, item]),
  );
  const fields = (plan.items ?? []).map((item) => {
    const resultItem = resultByField.get(item.field_id);
    return {
      field_id: item.field_id,
      action: item.action,
      status: resultItem?.status ?? (item.needs_review ? "needs_review" : "planned"),
      confidence: Math.round(item.confidence * 100) / 100,
      needs_review: item.needs_review,
      source_refs: item.source_refs ?? [],
      value_kind: valueKind(item),
      value_preview: valuePreview(item),
      reason: resultItem?.reason || item.reason,
    };
  });

  return {
    version: 1,
    summary: {
      planned_count: plan.items?.length ?? 0,
      blocked_count: plan.blocked_items?.length ?? 0,
      review_required_count:
        result.review_count ??
        plan.items?.filter((item) => item.needs_review).length ??
        0,
      filled_count: result.filled_count ?? 0,
      skipped_count: result.skipped_count ?? 0,
      error_count: result.error_count ?? 0,
    },
    fields,
    blocked_items: plan.blocked_items ?? [],
  };
}

function valueKind(item) {
  if (item.action === "upload") {
    return "document";
  }
  if (typeof item.value === "boolean") {
    return "boolean";
  }
  if (item.value === null || item.value === "") {
    return "empty";
  }
  return "text";
}

function valuePreview(item) {
  if (item.action === "upload") {
    return "[local document]";
  }
  if (typeof item.value === "boolean") {
    return item.value ? "Yes" : "No";
  }
  if (item.value === null || item.value === "") {
    return "";
  }
  const value = String(item.value).trim();
  if (value.includes("/") || value.includes("\\")) {
    return "[local file]";
  }
  return value.length > 140 ? `${value.slice(0, 137)}...` : value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopBackend() {
  if (!backend || backend.killed) {
    return;
  }
  backend.kill("SIGTERM");
  await new Promise((resolve) => {
    backend.once("exit", resolve);
    setTimeout(resolve, 1500);
  });
}
