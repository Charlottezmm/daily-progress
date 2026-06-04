export type PlanImportPreview = {
  goal: string | null;
  projects: Array<{ name: string; deadline: string | null }>;
  constraints: string[];
};

export function parsePlanMarkdown(markdown: string): PlanImportPreview {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const goalLine = lines.find((line) => line.toLowerCase().startsWith("goal:"));
  const projects: PlanImportPreview["projects"] = [];
  const constraints: string[] = [];
  let section: string | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      section = headingMatch[1].trim().toLowerCase();
      continue;
    }

    if (!line.startsWith("- ")) {
      continue;
    }

    const item = line.slice(2).trim();
    const projectMatch = item.match(/^(.+?):\s+.*?\bby\s+(\d{4}-\d{2}-\d{2})\b/i);
    if (section === "projects" && projectMatch) {
      projects.push({ name: projectMatch[1].trim(), deadline: projectMatch[2] });
    }

    if (section === "constraints" && item.toLowerCase().includes("protect")) {
      constraints.push(item);
    }
  }

  return {
    goal: goalLine ? goalLine.slice("Goal:".length).trim() : null,
    projects,
    constraints,
  };
}
