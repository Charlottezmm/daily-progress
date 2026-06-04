import { describe, expect, it } from "vitest";
import { parsePlanMarkdown } from "@/lib/imports/plan-markdown";

describe("plan markdown parser", () => {
  it("extracts goal, projects with deadlines, and protect constraints", () => {
    const result = parsePlanMarkdown(`# June Plan

Goal: finish planning MVP

## Projects
- Daily Progress: ship v0.1 by 2026-06-30
- Hardware Learning: finish week 1 by 2026-06-15

## Constraints
- protect morning deep work
- keep Friday evening open
`);

    expect(result).toEqual({
      goal: "finish planning MVP",
      projects: [
        { name: "Daily Progress", deadline: "2026-06-30" },
        { name: "Hardware Learning", deadline: "2026-06-15" },
      ],
      constraints: ["protect morning deep work"],
    });
  });

  it("only extracts projects and protect constraints from their sections", () => {
    const result = parsePlanMarkdown(`# June Plan

Goal: finish planning MVP

## Notes
- Side Project: ship someday by 2026-07-01
- protect random note

## Projects
- Daily Progress: ship v0.1 by 2026-06-30

## Constraints
- protect morning deep work
`);

    expect(result.projects).toEqual([{ name: "Daily Progress", deadline: "2026-06-30" }]);
    expect(result.constraints).toEqual(["protect morning deep work"]);
  });
});
