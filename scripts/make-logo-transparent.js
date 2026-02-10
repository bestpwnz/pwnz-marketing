const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const assetsDir = path.join(__dirname, '..', 'assets');
const inputPath = path.join(assetsDir, 'rekruteer-logo.png');
const outputPath = path.join(assetsDir, 'rekruteer-logo-transparent.png');

const BLACK_THRESHOLD = 35; // pixels with r,g,b all below this become transparent

async function main() {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r <= BLACK_THRESHOLD && g <= BLACK_THRESHOLD && b <= BLACK_THRESHOLD) {
      data[i + 3] = 0; // set alpha to 0
    }
  }

  await sharp(data, { raw: { width, height, channels } })
    .png()
    .toFile(outputPath);

  fs.unlinkSync(inputPath);
  fs.renameSync(outputPath, inputPath);
  console.log('Logo saved with transparent background:', inputPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
