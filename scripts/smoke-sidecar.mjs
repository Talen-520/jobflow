import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

const target = execFileSync("rustc", ["--print", "host-tuple"], {
  encoding: "utf8",
}).trim();
const extension = process.platform === "win32" ? ".exe" : "";
const binary = resolve(
  `app/desktop/src-tauri/binaries/jobflow-backend-${target}${extension}`,
);
const temp = mkdtempSync(join(tmpdir(), "jobflow-sidecar-"));
const port = process.env.JOBFLOW_SIDECAR_SMOKE_PORT ?? "18766";
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(binary, [], {
  env: {
    ...process.env,
    JOBFLOW_DB_PATH: join(temp, "jobflow.sqlite"),
    JOBFLOW_VAULT_PATH: join(temp, "vault"),
    JOBFLOW_PORT: port,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let sidecarOutput = "";
child.stdout.on("data", (chunk) => {
  sidecarOutput += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  sidecarOutput += chunk.toString();
});

try {
  await waitForHealth();
  const health = await fetch(`${baseUrl}/health`).then((response) =>
    response.json(),
  );
  if (
    health.status !== "ok" ||
    health.service !== "jobflow-backend" ||
    health.protocol_version !== 2
  ) {
    throw new Error("Unexpected sidecar health response");
  }
  if (!readdirSync(temp).includes("jobflow.sqlite")) {
    throw new Error("Sidecar did not use the configured app-data path");
  }
  console.log("JobFlow packaged sidecar smoke passed");
} finally {
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise((resolveExit) => child.once("exit", resolveExit));
  }
  rmSync(temp, { recursive: true, force: true });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(
        `Sidecar exited before readiness: ${child.exitCode}\n${sidecarOutput}`,
      );
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // The one-file executable needs a moment to unpack on first launch.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Timed out waiting for packaged sidecar readiness");
}
