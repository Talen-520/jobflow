import { spawn } from "node:child_process";
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
const browserProfilePath = join(smokeDir, "browser-profile");

let backend;

try {
  await writeFile(resumePath, "%PDF-1.4 smoke resume\n");
  backend = startBackend();
  await waitForHealth();

  const health = await getJson("/health");
  assert(health.status === "ok", "health endpoint returned ok");

  const demoHtml = await getText("/demo/application");
  assert(demoHtml.includes('data-jobflow-demo="application"'), "demo application served");

  await putJson("/profile", {
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
  console.log("✓ seeded smoke profile");

  const context = await getJson("/automation/context-preview");
  assert(context.source_count >= 6, "prompt context includes seeded local sources");

  const form = await postJson("/automation/inspect", {
    url: `${baseUrl}/demo/application`,
    html: demoHtml,
  });
  assert(form.fields.length >= 9, "demo form inspection found representative fields");
  assert(form.fields.some((field) => field.field_id === "resume"), "resume field detected");

  const plan = await postJson("/automation/create-fill-plan", { form });
  assert(plan.items.some((item) => item.field_id === "resume"), "resume upload planned");
  assert(plan.items.some((item) => item.field_id === "motivation"), "motivation planned");
  assert(plan.items.some((item) => item.field_id === "sponsorship"), "sponsorship planned");
  assert(plan.blocked_items.some((item) => item.field_id === "salary"), "salary blocked by policy");

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
      field_id: "sponsorship",
      decision: "accept",
      current_plan: reviewedPlan,
      form,
    })
  ).updated_plan;
  reviewedPlan = (
    await postJson("/automation/review-field", {
      field_id: "authorized",
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

  await postJson("/applications", success.proposed_record);
  const applications = await getJson("/applications");
  assert(applications.length === 1, "application record saved");

  console.log("\nJobFlow smoke passed");
} finally {
  await stopBackend();
}

function startBackend() {
  const child = spawn(
    "uv",
    [
      "run",
      "uvicorn",
      "app.main:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: backendDir,
      env: {
        ...process.env,
        JOBFLOW_DB_PATH: dbPath,
        JOBFLOW_VAULT_PATH: vaultPath,
        JOBFLOW_BROWSER_USER_DATA_PATH: browserProfilePath,
        JOBFLOW_BROWSER_HEADLESS: "true",
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
