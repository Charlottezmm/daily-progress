import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mobile floating cat positioning", () => {
  it("anchors the mobile floating capture affordance near the top-right", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const mobileBlock = css.match(/@media \(max-width: 760px\) \{[\s\S]*?\.paw-page-header/s)?.[0] ?? "";
    const floatingRule = mobileBlock.match(/\.floating-cat-root \{[\s\S]*?\}/)?.[0] ?? "";

    expect(floatingRule).toContain("right: 16px;");
    expect(floatingRule).toContain("top: calc(env(safe-area-inset-top, 0px) + 14px);");
    expect(floatingRule).toContain("bottom: auto;");
  });
});
