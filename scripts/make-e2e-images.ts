import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
async function main() {
  const png = await readFile("public/samples/baseline.png");
  await writeFile(
    "/tmp/own-photo.webp",
    await sharp(png).webp({ quality: 90 }).toBuffer(),
  );
  await writeFile("/tmp/renamed-photo.jpg", png);
  console.log("test images written");
}
main();
