import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { toBuffer } from "@bwip-js/node";

const root = fileURLToPath(new URL("../", import.meta.url));
const tracePath = join(
  root,
  ".next/server/app/api/admin/special-invites/download/route.js.nft.json",
);
const destination = mkdtempSync(join(tmpdir(), "gbe-invite-build-check-"));

try {
  const trace = JSON.parse(readFileSync(tracePath, "utf8"));
  // Reproduce a function deployment with ONLY traced dependencies. A normal
  // local start can hide missing native libraries in the full node_modules.
  for (const file of trace.files) {
    const source = resolve(dirname(tracePath), file);
    const local = relative(root, source);
    if (!local.startsWith("node_modules/")) continue;
    const target = join(destination, local);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { dereference: true });
  }
  const isolatedRequire = createRequire(join(destination, "smoke.cjs"));
  const sharp = isolatedRequire("sharp");
  const barcode = await toBuffer({
    bcid: "code128",
    text: "A8X42Z",
    scale: 3,
    height: 22,
    includetext: true,
  });
  const bytes = await sharp(barcode)
    .resize(640, 360, { fit: "contain", background: "#ffffff" })
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .toBuffer();
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, 640);
  assert.equal(metadata.height, 360);
  console.log("Invite download build verified using isolated traced dependencies.");
} catch {
  console.error(
    "Invite download build failed: its traced dependencies could not produce a JPG. Check the Sharp native-library includes in next.config.ts.",
  );
  process.exitCode = 1;
} finally {
  rmSync(destination, { recursive: true, force: true });
}
