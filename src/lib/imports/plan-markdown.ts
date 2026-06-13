export type PlanImportPreview = {
  goal: string | null;
  projects: Array<{ name: string; deadline: string | null }>;
  constraints: string[];
};

export type PlanImportPublicBetaPreview = PlanImportPreview & {
  timezone: "Asia/Shanghai";
  warnings: string[];
  conflicts: string[];
};

function validDateKey(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function duplicateLabels(values: string[]) {
  const counts = new Map<string, { label: string; count: number }>();
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key) continue;
    const current = counts.get(key);
    counts.set(key, { label: current?.label ?? value, count: (current?.count ?? 0) + 1 });
  }
  return Array.from(counts.values()).filter((entry) => entry.count > 1);
}

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

export function buildPlanImportPreview(markdown: string): PlanImportPublicBetaPreview {
  if (markdown.length > 200_000) throw new Error("Plan markdown is too long");
  const preview = parsePlanMarkdown(markdown);

  if (!preview.goal && preview.projects.length === 0) {
    throw new Error("Plan import must include a Goal or Projects section");
  }
  if (preview.goal && preview.goal.length > 2000) throw new Error("Goal is too long");

  for (const project of preview.projects) {
    if (project.name.length > 120) throw new Error("Project name is too long");
    if (project.deadline && !validDateKey(project.deadline)) throw new Error("Invalid project deadline");
  }
  for (const constraint of preview.constraints) {
    if (constraint.length > 1000) throw new Error("Constraint is too long");
  }

  const duplicateProjects = duplicateLabels(preview.projects.map((project) => project.name));
  const duplicateConstraints = duplicateLabels(preview.constraints);
  const warnings = [
    ...duplicateProjects.map((entry) => `Duplicate project name: ${entry.label}`),
    ...duplicateConstraints.map((entry) => `Duplicate constraint: ${entry.label}`),
  ];
  const conflicts = duplicateProjects.map((entry) => `Project ${entry.label} appears ${entry.count} times in this import`);

  return {
    ...preview,
    timezone: "Asia/Shanghai",
    warnings,
    conflicts,
  };
}
