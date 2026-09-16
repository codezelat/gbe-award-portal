import "server-only";
import { toBuffer } from "@bwip-js/node";
import sharp from "sharp";
import { zipSync } from "fflate";

export async function specialInviteJpeg(code: string) {
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error("Invalid invite image.");
  const barcode = await toBuffer({
    bcid: "code128",
    text: code,
    scale: 3,
    height: 22,
    includetext: true,
    textxalign: "center",
    textsize: 16,
    paddingwidth: 12,
    paddingheight: 12,
    backgroundcolor: "FFFFFF",
  });
  return sharp(barcode)
    .resize(640, 360, { fit: "contain", background: "#ffffff" })
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

export function specialInviteZip(
  images: Array<{ code: string; bytes: Uint8Array }>,
) {
  // JPEGs are already compressed. Storing them avoids unnecessary CPU work.
  return zipSync(
    Object.fromEntries(
      images.map(({ code, bytes }) => [`GBE-${code}.jpg`, bytes]),
    ),
    { level: 0 },
  );
}
