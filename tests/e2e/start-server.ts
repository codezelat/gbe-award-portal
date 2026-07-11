import setup from "./global-setup";
import { spawn } from "node:child_process";

await setup();

const server = spawn(
  "bun",
  ["run", "dev", "--hostname", "localhost", "--port", "3100"],
  { cwd: process.cwd(), env: process.env, stdio: "inherit" },
);

const stop = () => server.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.exitCode = await new Promise<number>((resolve, reject) => {
  server.once("error", reject);
  server.once("exit", (code) => resolve(code ?? 0));
});
