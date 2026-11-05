import { describe, expect, it } from "vitest";
import { z } from "zod";
import { extractJsonObject, parseModelJson } from "../src/lib/ai/json";
import { SafeError } from "../src/lib/errors";

const schema = z.object({ name: z.string() });

describe("extractJsonObject", () => {
  it("returns a plain JSON object untouched", () => {
    expect(extractJsonObject('{"name":"a"}')).toBe('{"name":"a"}');
  });

  it("unwraps a surrounding markdown fence with or without a language tag", () => {
    const fenced = '```json\n{"name":"a"}\n```';
    expect(extractJsonObject(fenced)).toBe('{"name":"a"}');
    expect(extractJsonObject('```\n{"name":"a"}\n```')).toBe('{"name":"a"}');
  });

  it("extracts the object from surrounding prose, skipping braces in strings", () => {
    const prose =
      'Here is the result: {"name":"a {weird} \\"value\\"" } hope that helps!';
    expect(JSON.parse(extractJsonObject(prose) ?? "")).toEqual({
      name: 'a {weird} "value"',
    });
  });

  it("returns null for text without a complete object", () => {
    expect(extractJsonObject("not json at all")).toBeNull();
    expect(extractJsonObject('{"name":"truncated')).toBeNull();
    expect(extractJsonObject("")).toBeNull();
  });
});

describe("parseModelJson", () => {
  it("parses clean JSON directly", () => {
    expect(parseModelJson('{"name":"a"}', schema)).toEqual({ name: "a" });
  });

  it("salvages fenced JSON", () => {
    expect(parseModelJson('```json\n{"name":"a"}\n```', schema)).toEqual({
      name: "a",
    });
  });

  it("validates against the schema after repair", () => {
    expect(() => parseModelJson('```json\n{"name":42}\n```', schema)).toThrow(
      SafeError,
    );
  });

  it("throws INVALID_OUTPUT when nothing can be salvaged", () => {
    try {
      parseModelJson("no object here", schema);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SafeError);
      expect((error as SafeError).code).toBe("INVALID_OUTPUT");
    }
  });
});
