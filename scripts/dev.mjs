import { spawn } from "node:child_process";
import process from "node:process";
import readline from "node:readline";

const root = new URL("..", import.meta.url);
const useTauri = process.argv.includes("--tauri");

const services = [
  {
    name: "backend",
    cwd: new URL("app/backend/", root),
    command: "uv",
    args: [
      "run",
      "uvicorn",
      "app.main:app",
      "--reload",
      "--host",
      "127.0.0.1",
      "--port",
      "8765",
    ],
    env: {},
  },
  {
    name: useTauri ? "tauri" : "desktop",
    cwd: new URL("app/desktop/", root),
    command: "npm",
    args: useTauri ? ["run", "tauri", "dev"] : ["run", "dev", "--", "--host", "127.0.0.1"],
    env: {
      VITE_JOBFLOW_API_BASE: "http://127.0.0.1:8765",
    },
  },
];

const children = [];
let shuttingDown = false;

console.log("JobFlow dev quick start");
console.log("Backend: http://127.0.0.1:8765");
console.log(useTauri ? "Desktop: Tauri dev shell" : "Desktop: http://127.0.0.1:1420");
console.log("Press Ctrl-C to stop all services.\n");

for (const service of services) {
  startService(service);
}

function startService(service) {
  const child = spawn(service.command, service.args, {
    cwd: service.cwd,
    env: { ...process.env, ...service.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);

  pipeWithPrefix(service.name, child.stdout);
  pipeWithPrefix(service.name, child.stderr);

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }
    console.log(`[${service.name}] exited with ${signal ?? code}`);
    shutdown(code === 0 ? 0 : 1);
  });
}

function pipeWithPrefix(name, stream) {
  const rl = readline.createInterface({ input: stream });
  rl.on("line", (line) => {
    console.log(`[${name}] ${line}`);
  });
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => process.exit(code), 300);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
