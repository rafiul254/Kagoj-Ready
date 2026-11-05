import { describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { manifestSchema } from "../src/lib/schemas";
import samples from "../src/data/samples.json";
import { MockProvider } from "../src/lib/ai/mock";
import { processDocument } from "../src/lib/pipeline";
import { validateImage, MAX_BYTES } from "../src/lib/validate-image";
import { scoreOutcomes } from "../src/lib/evaluation";
const manifest = manifestSchema.parse(samples);
const image = () => readFile("public/samples/baseline.png");
describe("validated extraction pipeline", () => {
  for (const fixture of manifest.fixtures)
    it(`processes ${fixture.id} through the mocked provider`, async () => {
      const bytes = await readFile("public" + fixture.file);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        fixture.sha256,
      );
      const provider = new MockProvider(fixture);
      const extract = vi.spyOn(provider, "extractDocumentFields");
      const result = await processDocument(
        {
          bytes,
          mimeType: "image/png",
          filename: fixture.id + ".png",
          language: "bn",
        },
        provider,
      );
      expect(result.mode).toBe("mock_test");
      expect(result.usage.modelCalls).toBe(0);
      if (fixture.expectedRejection) {
        expect(result.identification.reason).toBe(fixture.expectedRejection);
        expect(extract).not.toHaveBeenCalled();
        expect(result.extraction).toBeNull();
      } else {
        expect(result.extraction?.fields.name_en.rawValue).toBe(
          fixture.fields.name_en,
        );
        expect(result.trace).toHaveLength(3);
      }
    });
  it("accepts files whose extension or MIME label lies, trusting content", async () => {
    for (const [mime, name] of [
      ["image/jpeg", "x.png"],
      ["image/jpeg", "x.jpg"],
    ] as const) {
      const result = await validateImage(await image(), mime, name);
      expect(result.mimeType).toBe("image/jpeg");
      expect(result.bytes.length).toBeGreaterThan(100);
    }
  });
  it("normalizes WebP and single-frame GIF into JPEG", async () => {
    const raw = await image();
    for (const format of ["webp", "gif"] as const) {
      const bytes = await sharp(raw).toFormat(format).toBuffer();
      const result = await validateImage(bytes, "image/" + format, "photo");
      expect(result.mimeType).toBe("image/jpeg");
      const meta = await sharp(result.bytes).metadata();
      expect(meta.format).toBe("jpeg");
    }
  });
  it("rejects bad image bytes without invoking the provider", async () => {
    const provider = new MockProvider(manifest.fixtures[0]);
    const identify = vi.spyOn(provider, "identifyDocument");
    await expect(
      processDocument(
        {
          bytes: Buffer.alloc(100),
          mimeType: "image/png",
          filename: "bad.png",
          language: "en",
        },
        provider,
      ),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_FORMAT" });
    expect(identify).not.toHaveBeenCalled();
  });
  it("rejects PDFs explicitly", async () => {
    await expect(
      validateImage(Buffer.alloc(100), "application/pdf", "page.pdf"),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_FORMAT" });
  });
  it("rejects large buffers before decoding", async () => {
    await expect(
      validateImage(Buffer.alloc(MAX_BYTES + 1), "image/png", "large.png"),
    ).rejects.toMatchObject({ code: "IMAGE_SIZE" });
  });
  it("rejects small dimensions", async () => {
    const bytes = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await expect(
      validateImage(bytes, "image/png", "tiny.png"),
    ).rejects.toMatchObject({ code: "IMAGE_DIMENSIONS" });
  });
  it("rejects truncated files", async () => {
    const bytes = await image();
    await expect(
      validateImage(
        bytes.subarray(0, bytes.length / 2),
        "image/png",
        "truncated.png",
      ),
    ).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });
  it("includes failed runs in extraction accuracy denominator", () => {
    const score = scoreOutcomes([
      { fixture: manifest.fixtures[0], error: "TIMEOUT" },
    ]);
    expect(score.presentFields).toEqual({ correct: 0, total: 8, accuracy: 0 });
    expect(score.banglaText.total).toBe(1);
    expect(score.englishText.total).toBe(4);
  });
  it("does not include unreadable images in field denominators", () => {
    const score = scoreOutcomes([
      { fixture: manifest.fixtures[6], error: "TIMEOUT" },
    ]);
    expect(score.presentFields.accuracy).toBeNull();
    expect(score.rejections).toEqual({ correct: 0, total: 1, accuracy: 0 });
  });
  it("counts missing expected fields separately from present OCR", () => {
    const score = scoreOutcomes([
      { fixture: manifest.fixtures[5], error: "TIMEOUT" },
    ]);
    expect(score.presentFields.total).toBe(7);
    expect(score.missingFields.total).toBe(1);
    expect(score.missingFields.correct).toBe(0);
  });
});
