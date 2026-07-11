import setup from "./global-setup";
import teardown from "./global-teardown";
import { spawn } from "node:child_process";

await setup();

const server = spawn(
  "bun",
  ["run", "dev", "--hostname", "127.0.0.1", "--port", "3100"],
  { cwd: process.cwd(), env: process.env, stdio: "inherit" },
);

const stop = () => server.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
try {
  process.exitCode = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.once("exit", (code) => resolve(code ?? 0));
  });
} finally {
  await teardown();
}
