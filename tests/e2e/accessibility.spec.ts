import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("automated accessibility scan on home, context, review, report and evaluation", async ({
  page,
}) => {
  async function check() {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
  await page.goto("/");
  await check();
  await page.goto("/prepare?sample=1");
  await check();
  await page.getByRole("button", { name: "Switch to English" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue to documents" }).click();
  await page.getByLabel("Processing mode").selectOption("synthetic_fixture");
  await page.getByRole("button", { name: "Read selected documents" }).click();
  await expect(
    page.getByRole("heading", { name: "You have the final say." }),
  ).toBeVisible();
  await check();
  for (const checkbox of await page
    .getByRole("checkbox", {
      name: "I checked this field against the original",
    })
    .all())
    await checkbox.check();
  await page.getByRole("button", { name: "Compare and build my plan" }).click();
  await check();
  await page.goto("/evaluation");
  await check();
});
