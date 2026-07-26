import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = resolve(root, "app/backend");
const binaryDir = resolve(root, "app/desktop/src-tauri/binaries");
const buildDir = resolve(backendDir, ".build/pyinstaller");
const target = execFileSync("rustc", ["--print", "host-tuple"], {
  encoding: "utf8",
}).trim();
const extension = process.platform === "win32" ? ".exe" : "";
const python = resolve(
  backendDir,
  process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python",
);
const builtBinary = resolve(buildDir, `dist/jobflow-backend${extension}`);
const targetBinary = resolve(
  binaryDir,
  `jobflow-backend-${target}${extension}`,
);

rmSync(buildDir, { recursive: true, force: true });
mkdirSync(binaryDir, { recursive: true });

console.log(`Building JobFlow backend sidecar for ${target}...`);
execFileSync(
  python,
  [
    "-m",
    "PyInstaller",
    "--noconfirm",
    "--clean",
    "--onefile",
    "--name",
    "jobflow-backend",
    "--paths",
    backendDir,
    "--distpath",
    resolve(buildDir, "dist"),
    "--workpath",
    resolve(buildDir, "work"),
    "--specpath",
    resolve(buildDir, "spec"),
    resolve(backendDir, "jobflow_sidecar.py"),
  ],
  {
    cwd: backendDir,
    env: {
      ...process.env,
      PYINSTALLER_CONFIG_DIR: resolve(buildDir, "config"),
    },
    stdio: "inherit",
  },
);

copyFileSync(builtBinary, targetBinary);
if (process.platform !== "win32") {
  chmodSync(targetBinary, 0o755);
}
console.log(`Sidecar ready: ${targetBinary}`);
