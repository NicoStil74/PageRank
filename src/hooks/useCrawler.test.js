import { normalizeUrl } from "./useCrawler";

describe("normalizeUrl", () => {
  test("accepts bare domains", () => {
    expect(normalizeUrl("netflix.com")).toBe("https://netflix.com/");
  });

  test("accepts bare www domains", () => {
    expect(normalizeUrl("www.netflix.com")).toBe("https://www.netflix.com/");
  });

  test("preserves paths on scheme-less input", () => {
    expect(normalizeUrl("netflix.com/browse")).toBe("https://netflix.com/browse");
  });
});
