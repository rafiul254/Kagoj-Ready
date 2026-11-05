import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { MockProvider } from "../../src/lib/ai/mock";
import { processDocument } from "../../src/lib/pipeline";
import { manifestSchema } from "../../src/lib/schemas";
import samples from "../../src/data/samples.json";
test("Bangla-first home → sample extraction with mocked provider → delete data", async ({
  page,
}) => {
  const fixture = manifestSchema.parse(samples).fixtures[0];
  const payload = await processDocument(
    {
      bytes: await readFile("public" + fixture.file),
      mimeType: "image/png",
      filename: "baseline.png",
      language: "en",
    },
    new MockProvider(fixture),
  );
  await page.route("**/api/samples", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      sampleId: "baseline",
      language: "en",
      consent: true,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  await page.getByRole("button", { name: "Switch to English" }).click();
  await page.goto("/lab");
  await expect(
    page.getByRole("heading", { name: "Read a sample. Inspect the evidence." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Read sample with Gemini" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Read sample with Gemini" }).click();
  await expect(page.getByText("MOCK TEST · NO LIVE MODEL")).toBeVisible();
  await expect(page.getByText("Namuna Meghla", { exact: true })).toBeVisible();
  await expect(page.getByText("•••• 0001", { exact: true })).toBeVisible();
  await expect(page.getByText("SAMPLE-000001", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Unconfirmed — not a readiness report.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("MOCK TEST · NO LIVE MODEL")).toBeVisible();
  await page.getByRole("button", { name: "Delete my data" }).click();
  await expect(page.getByText("Namuna Meghla", { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((k) => k.startsWith("kagoj:")),
    ),
  ).toEqual([]);
});
test("mobile layout and safe failure do not imply a live success", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Switch to English" }).click();
  await page.goto("/lab");
  await page.route("**/api/samples", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "NOT_CONFIGURED" }),
    }),
  );
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Read sample with Gemini" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "No AI provider is configured",
  );
  await expect(
    page.getByText("LIVE GEMINI · SAMPLE INPUT", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    page
      .getByAltText(/Built for Ostad presents YUNet AIgnite Buildathon 2026/)
      .last(),
  ).toBeVisible();
});
