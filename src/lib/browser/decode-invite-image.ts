import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { normaliseInviteCode } from "@/lib/domain/special-invite";

// Loaded only after an image is selected. Image bytes never leave the browser.
export async function decodeInviteImage(file: File) {
  const image = await createImageBitmap(file);
  try {
    if (image.width * image.height > 20_000_000)
      throw new Error("Image too large.");
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1800 / Math.max(image.width, image.height));
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image unavailable.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const hints = new Map<DecodeHintType, BarcodeFormat[] | boolean>([
      [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]],
      [DecodeHintType.TRY_HARDER, true],
    ]);
    const result = new BrowserMultiFormatReader(hints).decodeFromCanvas(canvas);
    const code = normaliseInviteCode(result.getText());
    if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error("Invalid invite.");
    return code;
  } finally {
    image.close();
  }
}
