/* eslint-env jest */
const {
  THEMES,
  getTheme,
  getAvailableThemes,
  getThemeChoices,
  resolveTheme,
  applyBrand,
  inferTheme,
  normalizeHex,
  contrastRatio,
  bestTextColor,
  ensureContrast,
} = require("../../../../../../../utils/agents/aibitat/plugins/create-files/pptx/themes.js");

describe("normalizeHex", () => {
  test("expands short hex and strips the hash", () => {
    expect(normalizeHex("#abc")).toBe("AABBCC");
    expect(normalizeHex("0c1929")).toBe("0C1929");
    expect(normalizeHex("  #C9943E  ")).toBe("C9943E");
  });

  test("returns the fallback for invalid input", () => {
    expect(normalizeHex("not-a-color")).toBe("000000");
    expect(normalizeHex(null)).toBe("000000");
    expect(normalizeHex("nope", "")).toBe("");
  });
});

describe("contrast helpers", () => {
  test("black on white is the maximum WCAG ratio", () => {
    expect(contrastRatio("000000", "FFFFFF")).toBeCloseTo(21, 0);
    expect(contrastRatio("FFFFFF", "FFFFFF")).toBeCloseTo(1, 5);
  });

  test("picks readable text for light and dark backgrounds", () => {
    expect(bestTextColor("0C1929")).toBe("FFFFFF");
    expect(bestTextColor("FFFFFF")).toBe("111827");
  });

  test("ensureContrast raises an unreadable color to the target", () => {
    const adjusted = ensureContrast("EEEEEE", "FFFFFF", 4.5);
    expect(contrastRatio(adjusted, "FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("themes", () => {
  test("ships the documented preset list", () => {
    const keys = getAvailableThemes();
    expect(keys).toHaveLength(8);
    expect(keys).toEqual(
      expect.arrayContaining(["default", "corporate", "dark"])
    );
    expect(getThemeChoices()).toEqual(
      expect.arrayContaining(["auto", ...keys])
    );
  });

  test("getTheme returns a copy with a key and falls back safely", () => {
    const theme = getTheme("dark");
    expect(theme.key).toBe("dark");
    theme.accentColor = "FF0000";
    expect(THEMES.dark.accentColor).not.toBe("FF0000");

    expect(getTheme("missing").key).toBe("default");
  });

  test("inferTheme matches topic keywords", () => {
    expect(inferTheme("Quarterly revenue and margin review")).toBe("corporate");
    expect(inferTheme("AI platform product roadmap")).toBe("tech");
    expect(inferTheme("University research findings")).toBe("academic");
    expect(inferTheme("Brand marketing campaign pitch")).toBe("creative");
    expect(inferTheme("Clean minimal update")).toBe("minimal");
    expect(inferTheme("")).toBe("default");
  });

  test("resolveTheme reports whether it auto-selected", () => {
    const explicit = resolveTheme({ themeName: "editorial" });
    expect(explicit.key).toBe("editorial");
    expect(explicit.autoSelected).toBe(false);

    const automatic = resolveTheme({
      themeName: "auto",
      text: "Financial results and revenue",
    });
    expect(automatic.key).toBe("corporate");
    expect(automatic.autoSelected).toBe(true);

    const unknown = resolveTheme({ themeName: "does-not-exist" });
    expect(unknown.autoSelected).toBe(true);
  });

  test("applyBrand overrides colors and keeps text readable", () => {
    const theme = applyBrand(getTheme("default"), {
      primary: "0C1929",
      accent: "C9943E",
    });

    expect(theme.titleSlideBackground).toBe("0C1929");
    expect(theme.accentColor).toBe("C9943E");
    expect(theme.chartPalette[0]).toBe("C9943E");
    expect(
      contrastRatio(theme.titleColor, theme.background)
    ).toBeGreaterThanOrEqual(6.9);
    expect(theme.tableHeaderColor).toBe(bestTextColor(theme.tableHeaderBg));
  });

  test("applyBrand does not mutate the shared preset", () => {
    const before = THEMES.default.background;
    applyBrand(getTheme("default"), { background: "000000", text: "FFFFFF" });
    expect(THEMES.default.background).toBe(before);
  });
});
