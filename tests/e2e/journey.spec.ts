import { test, expect } from "@playwright/test";
test("complete synthetic journey, confirmation gate, corrected sample diff, print and delete", async ({
  page,
}) => {
  await page.goto("/prepare?sample=1");
  await page.getByRole("button", { name: "Switch to English" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue to documents" }).click();
  await page.getByLabel("Processing mode").selectOption("synthetic_fixture");
  await page.getByRole("button", { name: "Read selected documents" }).click();
  await expect(
    page.getByRole("heading", { name: "You have the final say." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Compare and build my plan" }),
  ).toBeDisabled();
  for (const checkbox of await page
    .getByRole("checkbox", {
      name: "I checked this field against the original",
    })
    .all())
    await checkbox.check();
  await page.getByRole("button", { name: "Compare and build my plan" }).click();
  await expect(
    page.getByRole("heading", { name: "Your preparation review", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Some confirmed values differ.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Kalpo Tara", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator("#report-document")).not.toContainText(
    "SAMPLE-000001",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your preparation review", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Upload corrected document" })
    .nth(1)
    .click();
  await page.getByRole("button", { name: "Read selected documents" }).click();
  await expect(
    page.getByRole("heading", { name: "You have the final say." }),
  ).toBeVisible();
  for (const checkbox of await page
    .getByRole("checkbox", {
      name: "I checked this field against the original",
    })
    .all())
    await checkbox.check();
  await page.getByRole("button", { name: "Compare and build my plan" }).click();
  await expect(
    page.getByRole("heading", { name: "What changed after replacement" }),
  ).toBeVisible();
  await expect(
    page.getByText("No discrepancies were found in the fields compared.", {
      exact: false,
    }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download report HTML" }).click();
  expect((await download).suggestedFilename()).toBe("kagoj-ready-report.html");
  await page.emulateMedia({ media: "print" });
  await expect(
    page
      .getByAltText(/Built for Ostad presents YUNet AIgnite Buildathon 2026/)
      .last(),
  ).toBeVisible();
  await expect(
    page
      .getByText("A preparation aid, not an official government service.", {
        exact: false,
      })
      .last(),
  ).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "Delete my data" }).click();
  await expect(
    page.getByRole("heading", { name: "First, a little context" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((k) => k.startsWith("kagoj:")),
    ),
  ).toEqual([]);
});
test("unsupported applicant category is not sent for document processing", async ({
  page,
}) => {
  let requested = false;
  page.on("request", (r) => {
    if (r.url().includes("/api/agent")) requested = true;
  });
  await page.goto("/prepare");
  await page.getByRole("button", { name: "Switch to English" }).click();
  await page.getByLabel("Applicant age band").selectOption("under_18");
  await page.getByLabel("Application type").selectOption("first_time");
  await page
    .getByLabel("Where are you applying from?")
    .selectOption("bangladesh");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue to documents" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Verified rules for this exact case are not in our registry yet.",
    }),
  ).toBeVisible();
  expect(requested).toBe(false);
});
test("sample auto mode has an honest fallback and mobile report fits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/prepare?sample=1");
  await page.getByRole("button", { name: "Switch to English" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue to documents" }).click();
  await page.getByRole("button", { name: "Read selected documents" }).click();
  await expect(
    page.getByRole("heading", { name: "You have the final say." }),
  ).toBeVisible();
  await expect(
    page.getByText("Synthetic fixture — not AI", { exact: true }).first(),
  ).toBeVisible();
  for (const checkbox of await page
    .getByRole("checkbox", {
      name: "I checked this field against the original",
    })
    .all())
    await checkbox.check();
  await page.getByRole("button", { name: "Compare and build my plan" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/evaluation");
  await expect(
    page.getByRole("heading", { name: "Live Gemini evaluation" }),
  ).toBeVisible();
  await expect(
    page.getByText("Not measured — Gemini configuration is missing", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
