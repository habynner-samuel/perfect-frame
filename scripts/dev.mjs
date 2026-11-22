// Inicia o site (next dev) e o ajudante local do YouTube juntos.
import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [
  spawn(npm, ["run", "dev:site"], { stdio: "inherit", shell: process.platform === "win32" }),
  spawn(process.execPath, ["scripts/youtube-local.mjs"], { stdio: "inherit" }),
];
const stop = () => {
  for (const c of children) c.kill();
  process.exit();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const c of children) c.on("exit", (code) => { if (code) stop(); });
