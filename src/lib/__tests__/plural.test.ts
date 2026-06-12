import { describe, it, expect } from "vitest";
import { plural } from "../plural";

const forms: [string, string, string] = ["камера", "камеры", "камер"];

describe("plural", () => {
  it.each([
    [1, "камера"],
    [2, "камеры"],
    [4, "камеры"],
    [5, "камер"],
    [11, "камер"],
    [12, "камер"],
    [14, "камер"],
    [21, "камера"],
    [22, "камеры"],
    [25, "камер"],
    [100, "камер"],
    [101, "камера"],
    [111, "камер"],
    [0, "камер"],
  ])("%i → %s", (n, expected) => {
    expect(plural(n as number, forms)).toBe(expected);
  });
});
