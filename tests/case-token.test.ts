import { describe, expect, it } from "vitest";
import { createCaseBudget, getCaseBudget } from "../src/lib/agent/budget";

describe("stateless signed case token (serverless-safe)", () => {
  it("verifies on an instance that never saw the case", async () => {
    const token = await createCaseBudget();
    (
      globalThis as { kagojBudgets?: Map<string, unknown> }
    ).kagojBudgets?.clear();
    await expect(getCaseBudget(token)).resolves.toBeDefined();
  });
  it("rejects forged, tampered and malformed ids", async () => {
    const token = await createCaseBudget();
    const [id, exp] = token.split(".");
    await expect(
      getCaseBudget(`${id}.${exp}.forgedsignature`),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(
      getCaseBudget(`${id}.${Number(exp) + 1}.${token.split(".")[2]}`),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(getCaseBudget("not-a-token")).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    await expect(getCaseBudget(id)).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
  });
});
