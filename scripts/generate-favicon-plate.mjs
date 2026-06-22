/**
 * Favicon / apple-touch: gold mark on brand red plate (#8c0003), matching featured TLKV brand cards.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const MARK = path.join(ROOT, "assets/tlkv-logo-mark.png");
const PLATE = { r: 140, g: 0, b: 3, alpha: 1 };
/** ~4px padding on 65px mobile plate */
const PADDING_RATIO = 4 / 65;

async function writePlateIcon(size, outPath) {
  const padding = Math.max(2, Math.round(size * PADDING_RATIO));
  const inner = size - padding * 2;
  const logo = await sharp(MARK)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: PLATE,
    },
  })
    .composite([{ input: logo, top: padding, left: padding }])
    .png()
    .toFile(outPath);

  console.log("wrote", outPath, size + "x" + size);
}

await writePlateIcon(48, path.join(ROOT, "assets/favicon-48.png"));
await writePlateIcon(180, path.join(ROOT, "assets/apple-touch-icon-180.png"));
