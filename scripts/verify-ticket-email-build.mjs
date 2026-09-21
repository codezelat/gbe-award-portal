import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Email delivery is lazy-loaded from actions and callbacks as well as cron.
// A normal local build can mask missing font files in a deployed function.
for (const route of [
  "api/cron/daily/route",
  "api/cron/email-outbox/route",
  "api/webhooks/genie-tickets/route",
  "admin/tickets/[id]/page",
  "api/public/tickets/[id]/download/route",
  "api/admin/tickets/[id]/download/route",
]) {
  const tracePath = resolve(`.next/server/app/${route}.js.nft.json`);
  const trace = JSON.parse(readFileSync(tracePath, "utf8"));
  const font = trace.files.find((file) =>
    file.endsWith("NotoSans_400Regular.ttf"),
  );
  assert.ok(font, `Ticket font is missing from the ${route} deployment trace.`);
  const bytes = readFileSync(resolve(dirname(tracePath), font));
  assert.ok(bytes.length > 1000, `Ticket font is empty in ${route}.`);
}
console.log(
  "Ticket download and email-worker font deployment traces verified.",
);
