// Local-only payment sandbox. Credentials stay in memory; existing .env and production data are not changed.
import { createConnection } from "node:net";
import { userInfo } from "node:os";
import { spawn } from "node:child_process";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const keysPath = process.argv[2];
if (!keysPath)
  throw new Error(
    "Usage: bun scripts/dev-genie.mjs /path/to/test-api-keys.txt",
  );
const document = await Bun.file(keysPath).text();
const key = document.match(/eyJ[A-Za-z0-9_.-]+/)?.[0];
const appId = document.match(/[a-f0-9]{8}-[a-f0-9-]{27,}/i)?.[0];
if (!key || !appId)
  throw new Error(
    "The file must contain the Genie test App key and Application ID.",
  );
const claims = JSON.parse(
  Buffer.from(key.split(".")[1], "base64url").toString(),
);
if (claims.appId !== appId)
  throw new Error("The test App ID does not match the supplied key.");
if (appId !== "36bafce7-a201-429b-a9e2-c5b78546677c")
  throw new Error(
    "This helper accepts only the supplied Genie UAT application, never production keys.",
  );
const dbName = "gbe_award_portal_test_genie";
const publicUrl = process.env.GENIE_LOCAL_PUBLIC_URL ?? "http://localhost:3101";
const publicOrigin = new URL(publicUrl);
if (publicOrigin.protocol !== "https:" && publicUrl !== "http://localhost:3101")
  throw new Error("The sandbox public URL must use HTTPS.");
const localUrl = `postgres://${encodeURIComponent(userInfo().username)}@127.0.0.1:5432/${dbName}`;
const admin = postgres(
  `postgres://${encodeURIComponent(userInfo().username)}@127.0.0.1:5432/postgres`,
  { max: 1 },
);
if (!(await admin`select 1 from pg_database where datname=${dbName}`).length)
  await admin.unsafe(`CREATE DATABASE "${dbName}"`);
await admin.end();
const client = postgres(localUrl, { max: 1 });
await migrate(drizzle(client), { migrationsFolder: "./drizzle/migrations" });
await client.end();

const bridge = Bun.serve({
  hostname: "127.0.0.1",
  port: 5433,
  fetch(request, server) {
    if (server.upgrade(request, { data: {} })) return;
    return new Response("WebSocket required", { status: 400 });
  },
  websocket: {
    open(ws) {
      const socket = createConnection({ host: "127.0.0.1", port: 5432 });
      ws.data.socket = socket;
      socket.on("data", (data) => ws.send(data));
      socket.on("error", () => ws.close());
      socket.on("close", () => ws.close());
    },
    message(ws, message) {
      ws.data.socket?.write(
        typeof message === "string" ? Buffer.from(message) : message,
      );
    },
    close(ws) {
      ws.data.socket?.destroy();
    },
  },
});
const environment = {
  ...process.env,
  APP_ENV: "local",
  DATABASE_URL: localUrl,
  DATABASE_URL_DIRECT: localUrl,
  NEXT_PUBLIC_APP_URL: publicOrigin.origin,
  BETTER_AUTH_URL: publicOrigin.origin,
  GENIE_ENABLED: "true",
  GENIE_ENVIRONMENT: "sandbox",
  GENIE_API_KEY: key,
  GENIE_APP_ID: appId,
  RESEND_API_KEY: "",
  R2_OBJECT_PREFIX: "e2e/genie",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  TURNSTILE_EXPECTED_HOSTNAME: `localhost,127.0.0.1,${publicOrigin.hostname}`,
  SEED_CYCLE_OPENS_AT: "2026-01-01T00:00:00.000Z",
  SEED_CYCLE_CLOSES_AT: "2027-01-01T00:00:00.000Z",
};
const seed = spawn("bun", ["--conditions=react-server", "scripts/seed.ts"], {
  env: environment,
  stdio: "inherit",
});
await new Promise((resolve, reject) =>
  seed.on("exit", (code) =>
    code === 0 ? resolve() : reject(new Error("Local seed failed")),
  ),
);
const local = postgres(localUrl, { max: 1 });
await local`update award_cycles set status='open' where slug='gbe-awards-2026'`;
await local.end();
const server = spawn(
  "bun",
  ["run", "dev", "--hostname", "localhost", "--port", "3101"],
  { env: environment, stdio: "inherit" },
);
console.log(
  `Genie sandbox: ${publicOrigin.origin}/apply (local test database, test R2 prefix, email disabled)`,
);
const stop = () => {
  server.kill("SIGTERM");
  bridge.stop(true);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await new Promise((resolve) => server.on("exit", resolve));
bridge.stop(true);
