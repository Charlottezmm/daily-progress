# AI Planning App v0.1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `daily-progress` from a static single-file dashboard into the Next.js + Postgres foundation for an AI planning app that can become internally usable by Charlotte in the next execution plan.

**Architecture:** Treat the existing `index.html` as a legacy prototype, not the base to extend. Build a new Next.js App Router application with a Postgres-backed workspace model, BYOK secret storage, patch-based AI rescheduling contracts, and responsive Web/PWA delivery. Keep this foundation focused on single-user/internal use while preserving `workspace_id` boundaries for Hosted Lite.

**Tech Stack:** Next.js App Router, TypeScript, Postgres, Drizzle ORM, Zod, Tailwind CSS, shadcn/ui-compatible component structure, Vitest for unit tests, Playwright for one browser smoke test, Web App Manifest for PWA.

---

## Product and Design Workflow

Codex owns product architecture, data model, API contracts, implementation, and verification. Claude Design should own visual design, layout polish, visual hierarchy, and interaction styling after Codex has fixed the information architecture and screen states.

Recommended order:

1. Codex locks the IA and screen state inventory in this plan.
2. Codex implements backend, schema, auth, and unstyled/low-style screens.
3. Claude Design creates UI design for the fixed screens: Today, Week, Month, Inbox, Settings, Import, Reschedule Preview.
4. Codex implements the approved UI design with real data and tests.

Do not ask Claude Design to invent product scope. Give it constraints: Web/PWA, schedule-first, dense operational interface, no marketing landing page, Today/Week as primary views, project/course/track as filters.

## First-Stage Scope

This first-stage plan includes:

- Responsive Web app and PWA manifest.
- Workspace password login.
- Encrypted workspace-level DeepSeek API key.
- Postgres schema with `workspace_id` on all core data.
- Today / Week / Month / Inbox / Settings / Import / Reschedule Preview routes.
- Task, project, course, tag, track, routine, recovery, capacity, check-in, AI patch, change log.
- Quick Capture to Inbox.
- Routine and Recovery blocks that occupy capacity but are not AI-movable tasks.
- Track balance calculations.
- Segment energy settings.
- `plan.md` and `timetable.csv` import preview.
- AI patch schema, prompt rules, and protected-block validation.
- API routes shaped for `Re-plan today` and `Re-plan week`.

This first-stage plan excludes:

- Hosted public onboarding for arbitrary users.
- Full DeepSeek baseline generation persistence.
- Full AI patch application transaction.
- OAuth, email login, billing, team workspaces.
- Public read-only sharing pages.
- Calendar sync.
- Native iOS.
- PDF/image import.
- Push notifications.

## Target File Structure

```txt
daily-progress/
  package.json
  next.config.ts
  tsconfig.json
  postcss.config.mjs
  tailwind.config.ts
  drizzle.config.ts
  vitest.config.ts
  playwright.config.ts
  public/
    manifest.webmanifest
  src/
    app/
      (app)/
        layout.tsx
        today/page.tsx
        week/page.tsx
        month/page.tsx
        inbox/page.tsx
        import/page.tsx
        settings/page.tsx
        reschedule/page.tsx
      api/
        auth/login/route.ts
        auth/logout/route.ts
        workspace/route.ts
        settings/deepseek-key/route.ts
        inbox/route.ts
        tasks/route.ts
        checkins/route.ts
        imports/plan/route.ts
        imports/timetable/route.ts
        ai/generate-plan/route.ts
        ai/reschedule/route.ts
        ai/apply-patch/route.ts
      layout.tsx
      page.tsx
    components/
      app-shell.tsx
      quick-capture.tsx
      today-view.tsx
      week-view.tsx
      month-view.tsx
      inbox-view.tsx
      settings-view.tsx
      import-view.tsx
      reschedule-preview.tsx
    lib/
      auth/session.ts
      crypto/secrets.ts
      db/client.ts
      db/schema.ts
      db/queries.ts
      ai/deepseek.ts
      ai/prompts.ts
      ai/patch-schema.ts
      imports/plan-markdown.ts
      imports/timetable-csv.ts
      planning/capacity.ts
      planning/track-balance.ts
      planning/warnings.ts
      validation/common.ts
    tests/
      unit/
        crypto-secrets.test.ts
        plan-markdown.test.ts
        timetable-csv.test.ts
        capacity.test.ts
        track-balance.test.ts
        patch-schema.test.ts
      e2e/
        app-smoke.spec.ts
  docs/
    legacy/
      index-static-dashboard.html
```

## Environment Variables

```bash
DATABASE_URL=postgres://user:password@host:5432/daily_progress
APP_SECRET=replace-with-32-byte-random-secret
KEY_ENCRYPTION_SECRET=replace-with-32-byte-random-secret
NEXT_PUBLIC_APP_NAME=Daily Progress
```

## Task 1: Scaffold Next.js App and Preserve Legacy Static Dashboard

**Files:**
- Create: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/(app)/layout.tsx`
- Create: `src/components/app-shell.tsx`
- Move: `index.html` to `docs/legacy/index-static-dashboard.html`
- Modify: `README.md`

- [ ] **Step 1: Verify the current baseline**

Run:

```bash
git status --short --branch
```

Expected:

```txt
## main...origin/main
```

- [ ] **Step 2: Preserve the static prototype**

Run:

```bash
mkdir -p docs/legacy
git mv index.html docs/legacy/index-static-dashboard.html
```

Expected:

```txt
R  index.html -> docs/legacy/index-static-dashboard.html
```

- [ ] **Step 3: Create `package.json`**

Create `package.json`:

```json
{
  "name": "daily-progress",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@neondatabase/serverless": "latest",
    "bcryptjs": "latest",
    "drizzle-orm": "latest",
    "lucide-react": "latest",
    "next": "latest",
    "papaparse": "latest",
    "react": "latest",
    "react-dom": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "@playwright/test": "latest",
    "@tailwindcss/postcss": "latest",
    "@types/bcryptjs": "latest",
    "@types/node": "latest",
    "@types/papaparse": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "drizzle-kit": "latest",
    "tailwindcss": "latest",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

- [ ] **Step 4: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and install exits with code 0.

- [ ] **Step 5: Create TypeScript and Next config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
};

export default nextConfig;
```

- [ ] **Step 6: Create Tailwind and test config**

Create `postcss.config.mjs`:

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

Create `tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
};

export default config;
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/unit/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
```

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "src/tests/e2e",
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 13"] } }
  ],
});
```

- [ ] **Step 7: Create app shell**

Create `src/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daily Progress",
  description: "AI planning app with schedule-first planning.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

Create `src/app/globals.css`:

```css
@import "tailwindcss";

:root {
  color-scheme: light;
  --background: #ffffff;
  --foreground: #111827;
}

body {
  margin: 0;
  background: var(--background);
  color: var(--foreground);
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif;
}
```

Create `src/components/app-shell.tsx`:

```tsx
import Link from "next/link";

const navItems = [
  { href: "/today", label: "Today" },
  { href: "/week", label: "Week" },
  { href: "/month", label: "Month" },
  { href: "/inbox", label: "Inbox" },
  { href: "/import", label: "Import" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <aside className="fixed inset-y-0 left-0 hidden w-56 border-r border-zinc-200 bg-white p-4 md:block">
        <div className="mb-6 text-sm font-semibold">Daily Progress</div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="block rounded px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100">
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="min-h-screen p-4 md:ml-56 md:p-6">{children}</main>
    </div>
  );
}
```

Create `src/app/(app)/layout.tsx`:

```tsx
import { AppShell } from "@/components/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
```

Create `src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/today");
}
```

- [ ] **Step 8: Create initial routes**

Create `src/app/(app)/today/page.tsx`:

```tsx
export default function TodayPage() {
  return <h1 className="text-xl font-semibold">Today</h1>;
}
```

Create `src/app/(app)/week/page.tsx`:

```tsx
export default function WeekPage() {
  return <h1 className="text-xl font-semibold">Week</h1>;
}
```

Create `src/app/(app)/month/page.tsx`:

```tsx
export default function MonthPage() {
  return <h1 className="text-xl font-semibold">Month</h1>;
}
```

Create `src/app/(app)/inbox/page.tsx`:

```tsx
export default function InboxPage() {
  return <h1 className="text-xl font-semibold">Inbox</h1>;
}
```

Create `src/app/(app)/import/page.tsx`:

```tsx
export default function ImportPage() {
  return <h1 className="text-xl font-semibold">Import</h1>;
}
```

Create `src/app/(app)/settings/page.tsx`:

```tsx
export default function SettingsPage() {
  return <h1 className="text-xl font-semibold">Settings</h1>;
}
```

Create `src/app/(app)/reschedule/page.tsx`:

```tsx
export default function ReschedulePage() {
  return <h1 className="text-xl font-semibold">Reschedule Preview</h1>;
}
```

- [ ] **Step 9: Create PWA manifest**

Create `public/manifest.webmanifest`:

```json
{
  "name": "Daily Progress",
  "short_name": "Progress",
  "description": "Schedule-first AI planning app.",
  "start_url": "/today",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#111827",
  "icons": []
}
```

- [ ] **Step 10: Update README**

Replace the current README with:

```markdown
# Daily Progress

Open-source schedule-first AI planning app.

The old static May dashboard prototype is preserved at `docs/legacy/index-static-dashboard.html`.

## v0.1 Direction

- Web + PWA
- Next.js + Postgres
- Workspace password login
- Bring your own DeepSeek API key
- AI-generated plan and reschedule patch preview

## Development

```bash
npm install
npm run dev
```
```

- [ ] **Step 11: Verify scaffold**

Run:

```bash
npm run build
```

Expected: Next.js production build exits with code 0.

- [ ] **Step 12: Commit scaffold**

Run:

```bash
git add package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs tailwind.config.ts vitest.config.ts playwright.config.ts public src README.md docs/legacy
git commit -m "chore: scaffold Next.js planning app"
```

## Task 2: Database Schema, Drizzle, and Core Types

**Files:**
- Create: `drizzle.config.ts`
- Create: `src/lib/db/client.ts`
- Create: `src/lib/db/schema.ts`
- Create: `src/lib/validation/common.ts`
- Create: `src/tests/unit/schema-shape.test.ts`

- [ ] **Step 1: Create Drizzle config**

Create `drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
```

- [ ] **Step 2: Create database client**

Create `src/lib/db/client.ts`:

```ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const sql = neon(process.env.DATABASE_URL);

export const db = drizzle(sql, { schema });
```

- [ ] **Step 3: Create schema**

Create `src/lib/db/schema.ts` with tables matching the PRD:

```ts
import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const planStatus = pgEnum("plan_status", ["active", "archived"]);
export const planVersionSource = pgEnum("plan_version_source", ["baseline", "manual_edit", "ai_patch"]);
export const taskStatus = pgEnum("task_status", ["todo", "done", "skipped", "backlog"]);
export const priority = pgEnum("priority", ["low", "normal", "high", "urgent"]);
export const energyLevel = pgEnum("energy_level", ["low", "medium", "high"]);
export const daySegment = pgEnum("day_segment", ["morning", "afternoon", "evening"]);
export const trackKind = pgEnum("track_kind", ["main", "work", "side", "recovery", "custom"]);
export const timeBlockKind = pgEnum("time_block_kind", ["course", "meeting", "unavailable", "routine", "recovery"]);
export const aiPatchStatus = pgEnum("ai_patch_status", ["draft", "applied", "rejected"]);
export const inboxSource = pgEnum("inbox_source", ["manual", "imported"]);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceSecrets = pgTable("workspace_secrets", {
  workspaceId: uuid("workspace_id").primaryKey().references(() => workspaces.id, { onDelete: "cascade" }),
  deepseekApiKeyEncrypted: text("deepseek_api_key_encrypted").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 180 }).notNull(),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  status: planStatus("status").notNull().default("active"),
  baselineSnapshot: jsonb("baseline_snapshot").notNull(),
  currentVersionId: uuid("current_version_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const planVersions = pgTable("plan_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  source: planVersionSource("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  color: varchar("color", { length: 32 }).notNull().default("#71717a"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  color: varchar("color", { length: 32 }).notNull().default("#2563eb"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tracks = pgTable("tracks", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  kind: trackKind("kind").notNull(),
  targetMinPercent: integer("target_min_percent"),
  targetMaxPercent: integer("target_max_percent"),
  color: varchar("color", { length: 32 }).notNull().default("#16a34a"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 240 }).notNull(),
  notes: text("notes"),
  date: timestamp("date", { withTimezone: true }).notNull(),
  daySegment: daySegment("day_segment").notNull(),
  status: taskStatus("status").notNull().default("todo"),
  priority: priority("priority").notNull().default("normal"),
  estimatedMinutes: integer("estimated_minutes").notNull().default(30),
  energyLevel: energyLevel("energy_level").notNull().default("medium"),
  movable: boolean("movable").notNull().default(true),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
  trackId: uuid("track_id").references(() => tracks.id, { onDelete: "set null" }),
  parentTaskId: uuid("parent_task_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const timeBlocks = pgTable("time_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 180 }).notNull(),
  kind: timeBlockKind("kind").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  recurrenceRule: text("recurrence_rule"),
  courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
  trackId: uuid("track_id").references(() => tracks.id, { onDelete: "set null" }),
  movable: boolean("movable").notNull().default(false),
  estimatedMinutes: integer("estimated_minutes"),
  energyLevel: energyLevel("energy_level"),
});

export const routines = pgTable("routines", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 180 }).notNull(),
  defaultTimeSegment: daySegment("default_time_segment").notNull(),
  defaultStartTime: varchar("default_start_time", { length: 5 }),
  defaultEndTime: varchar("default_end_time", { length: 5 }),
  weekdayPattern: varchar("weekday_pattern", { length: 80 }).notNull(),
  estimatedMinutes: integer("estimated_minutes").notNull(),
  energyLevel: energyLevel("energy_level").notNull().default("low"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const routineCompletions = pgTable("routine_completions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  routineId: uuid("routine_id").notNull().references(() => routines.id, { onDelete: "cascade" }),
  date: timestamp("date", { withTimezone: true }).notNull(),
  completed: boolean("completed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inboxItems = pgTable("inbox_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 240 }).notNull(),
  source: inboxSource("source").notNull().default("manual"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiPatches = pgTable("ai_patches", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  status: aiPatchStatus("status").notNull().default("draft"),
  scopeStart: timestamp("scope_start", { withTimezone: true }).notNull(),
  scopeEnd: timestamp("scope_end", { withTimezone: true }).notNull(),
  reason: text("reason").notNull(),
  patchJson: jsonb("patch_json").notNull(),
  model: varchar("model", { length: 120 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
});

export const workspaceRelations = relations(workspaces, ({ many }) => ({
  plans: many(plans),
  tasks: many(tasks),
}));
```

- [ ] **Step 4: Add shape test**

Create `src/tests/unit/schema-shape.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { tasks, timeBlocks, tracks, inboxItems } from "@/lib/db/schema";

describe("schema shape", () => {
  it("keeps track on tasks, not plans", () => {
    expect(tasks.trackId).toBeDefined();
  });

  it("supports routine and recovery time blocks", () => {
    expect(timeBlocks.kind).toBeDefined();
  });

  it("supports inbox capture", () => {
    expect(inboxItems.title).toBeDefined();
  });

  it("supports track thresholds", () => {
    expect(tracks.targetMinPercent).toBeDefined();
    expect(tracks.targetMaxPercent).toBeDefined();
  });
});
```

- [ ] **Step 5: Generate migration**

Run:

```bash
npm run db:generate
```

Expected: a new SQL migration appears under `drizzle/`.

- [ ] **Step 6: Run unit test**

Run:

```bash
npm run test -- src/tests/unit/schema-shape.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit schema**

Run:

```bash
git add drizzle.config.ts drizzle src/lib/db src/lib/validation src/tests/unit/schema-shape.test.ts
git commit -m "feat: add planning database schema"
```

## Task 3: Workspace Auth and DeepSeek Key Encryption

**Files:**
- Create: `src/lib/crypto/secrets.ts`
- Create: `src/lib/auth/session.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/api/settings/deepseek-key/route.ts`
- Create: `src/tests/unit/crypto-secrets.test.ts`

- [ ] **Step 1: Write crypto tests**

Create `src/tests/unit/crypto-secrets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto/secrets";

const secret = "12345678901234567890123456789012";

describe("workspace secret encryption", () => {
  it("round-trips encrypted values", () => {
    const encrypted = encryptSecret("sk-test-abcdef", secret);
    expect(encrypted).not.toContain("sk-test-abcdef");
    expect(decryptSecret(encrypted, secret)).toBe("sk-test-abcdef");
  });

  it("masks secrets for display", () => {
    expect(maskSecret("sk-1234567890")).toBe("sk-...7890");
  });
});
```

- [ ] **Step 2: Implement secret encryption**

Create `src/lib/crypto/secrets.ts`:

```ts
import crypto from "node:crypto";

const algorithm = "aes-256-gcm";

function normalizeKey(secret: string) {
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string, secret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, normalizeKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string, secret: string) {
  const [ivRaw, tagRaw, encryptedRaw] = payload.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid encrypted secret payload");
  }
  const decipher = crypto.createDecipheriv(algorithm, normalizeKey(secret), Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function maskSecret(value: string) {
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 3)}...${value.slice(-4)}`;
}
```

- [ ] **Step 3: Run crypto test**

Run:

```bash
npm run test -- src/tests/unit/crypto-secrets.test.ts
```

Expected: PASS.

- [ ] **Step 4: Implement session helpers**

Create `src/lib/auth/session.ts`:

```ts
import { cookies } from "next/headers";

const cookieName = "daily_progress_workspace";

export async function setWorkspaceSession(workspaceId: string) {
  const store = await cookies();
  store.set(cookieName, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function clearWorkspaceSession() {
  const store = await cookies();
  store.delete(cookieName);
}

export async function getWorkspaceIdFromSession() {
  const store = await cookies();
  return store.get(cookieName)?.value ?? null;
}
```

- [ ] **Step 5: Implement auth routes**

Create `src/app/api/auth/login/route.ts`:

```ts
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { setWorkspaceSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";

const loginSchema = z.object({
  workspaceName: z.string().min(1),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  const body = loginSchema.parse(await request.json());
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.name, body.workspaceName)).limit(1);

  if (!workspace) {
    const passwordHash = await bcrypt.hash(body.password, 12);
    const [created] = await db.insert(workspaces).values({ name: body.workspaceName, passwordHash }).returning();
    await setWorkspaceSession(created.id);
    return NextResponse.json({ workspaceId: created.id, created: true });
  }

  const ok = await bcrypt.compare(body.password, workspace.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Invalid workspace password" }, { status: 401 });
  }

  await setWorkspaceSession(workspace.id);
  return NextResponse.json({ workspaceId: workspace.id, created: false });
}
```

Create `src/app/api/auth/logout/route.ts`:

```ts
import { NextResponse } from "next/server";
import { clearWorkspaceSession } from "@/lib/auth/session";

export async function POST() {
  await clearWorkspaceSession();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Implement DeepSeek key settings route**

Create `src/app/api/settings/deepseek-key/route.ts`:

```ts
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { encryptSecret, maskSecret } from "@/lib/crypto/secrets";
import { db } from "@/lib/db/client";
import { workspaceSecrets } from "@/lib/db/schema";

const keySchema = z.object({
  apiKey: z.string().min(10),
});

function encryptionSecret() {
  if (!process.env.KEY_ENCRYPTION_SECRET) {
    throw new Error("KEY_ENCRYPTION_SECRET is required");
  }
  return process.env.KEY_ENCRYPTION_SECRET;
}

export async function GET() {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [secret] = await db.select().from(workspaceSecrets).where(eq(workspaceSecrets.workspaceId, workspaceId)).limit(1);
  return NextResponse.json({ configured: Boolean(secret) });
}

export async function PUT(request: Request) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = keySchema.parse(await request.json());
  const encrypted = encryptSecret(body.apiKey, encryptionSecret());

  await db
    .insert(workspaceSecrets)
    .values({ workspaceId, deepseekApiKeyEncrypted: encrypted })
    .onConflictDoUpdate({
      target: workspaceSecrets.workspaceId,
      set: { deepseekApiKeyEncrypted: encrypted, updatedAt: new Date() },
    });

  return NextResponse.json({ configured: true, masked: maskSecret(body.apiKey) });
}
```

- [ ] **Step 7: Run tests and build**

Run:

```bash
npm run test
npm run build
```

Expected: both exit with code 0.

- [ ] **Step 8: Commit auth**

Run:

```bash
git add src/lib/crypto src/lib/auth src/app/api/auth src/app/api/settings src/tests/unit/crypto-secrets.test.ts
git commit -m "feat: add workspace auth and BYOK settings"
```

## Task 4: Planning Domain Logic Without AI

**Files:**
- Create: `src/lib/planning/capacity.ts`
- Create: `src/lib/planning/track-balance.ts`
- Create: `src/lib/planning/warnings.ts`
- Create: `src/tests/unit/capacity.test.ts`
- Create: `src/tests/unit/track-balance.test.ts`
- Create: `src/tests/unit/warnings.test.ts`

- [ ] **Step 1: Write capacity tests**

Create `src/tests/unit/capacity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calculateRemainingCapacity } from "@/lib/planning/capacity";

describe("capacity", () => {
  it("subtracts tasks, routines, and recovery from segment capacity", () => {
    const result = calculateRemainingCapacity({
      base: { morning: 180, afternoon: 240, evening: 120 },
      tasks: [{ segment: "morning", minutes: 60 }],
      blocks: [
        { segment: "morning", minutes: 30, kind: "routine" },
        { segment: "evening", minutes: 90, kind: "recovery" },
      ],
    });

    expect(result).toEqual({ morning: 90, afternoon: 240, evening: 30 });
  });
});
```

- [ ] **Step 2: Implement capacity**

Create `src/lib/planning/capacity.ts`:

```ts
type Segment = "morning" | "afternoon" | "evening";

type CapacityInput = {
  base: Record<Segment, number>;
  tasks: Array<{ segment: Segment; minutes: number }>;
  blocks: Array<{ segment: Segment; minutes: number; kind: "routine" | "recovery" | "course" | "meeting" | "unavailable" }>;
};

export function calculateRemainingCapacity(input: CapacityInput) {
  const remaining = { ...input.base };

  for (const task of input.tasks) {
    remaining[task.segment] -= task.minutes;
  }

  for (const block of input.blocks) {
    remaining[block.segment] -= block.minutes;
  }

  return {
    morning: Math.max(0, remaining.morning),
    afternoon: Math.max(0, remaining.afternoon),
    evening: Math.max(0, remaining.evening),
  };
}
```

- [ ] **Step 3: Write track balance tests**

Create `src/tests/unit/track-balance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calculateTrackBalance } from "@/lib/planning/track-balance";

describe("track balance", () => {
  it("calculates percent by track", () => {
    const result = calculateTrackBalance([
      { trackId: "main", minutes: 120 },
      { trackId: "work", minutes: 60 },
      { trackId: "main", minutes: 60 },
    ]);

    expect(result).toEqual([
      { trackId: "main", minutes: 180, percent: 75 },
      { trackId: "work", minutes: 60, percent: 25 },
    ]);
  });
});
```

- [ ] **Step 4: Implement track balance**

Create `src/lib/planning/track-balance.ts`:

```ts
export function calculateTrackBalance(items: Array<{ trackId: string; minutes: number }>) {
  const total = items.reduce((sum, item) => sum + item.minutes, 0);
  const byTrack = new Map<string, number>();

  for (const item of items) {
    byTrack.set(item.trackId, (byTrack.get(item.trackId) ?? 0) + item.minutes);
  }

  return Array.from(byTrack.entries()).map(([trackId, minutes]) => ({
    trackId,
    minutes,
    percent: total === 0 ? 0 : Math.round((minutes / total) * 100),
  }));
}
```

- [ ] **Step 5: Write warning tests**

Create `src/tests/unit/warnings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildWarnings } from "@/lib/planning/warnings";

describe("warnings", () => {
  it("warns on inbox pileup, missing checkin, and low recovery", () => {
    const warnings = buildWarnings({
      inboxCount: 11,
      hadYesterdayCheckin: false,
      recoveryMinutesThisWeek: 60,
      recoveryTargetMinutes: 180,
    });

    expect(warnings.map((warning) => warning.code)).toEqual([
      "inbox_pileup",
      "missing_checkin",
      "low_recovery",
    ]);
  });
});
```

- [ ] **Step 6: Implement warnings**

Create `src/lib/planning/warnings.ts`:

```ts
type WarningInput = {
  inboxCount: number;
  hadYesterdayCheckin: boolean;
  recoveryMinutesThisWeek: number;
  recoveryTargetMinutes: number;
};

export function buildWarnings(input: WarningInput) {
  const warnings: Array<{ code: string; message: string }> = [];

  if (input.inboxCount > 10) {
    warnings.push({ code: "inbox_pileup", message: `Inbox 堆了 ${input.inboxCount} 条，先清一下。` });
  }

  if (!input.hadYesterdayCheckin) {
    warnings.push({ code: "missing_checkin", message: "昨天没复盘，今天先看 must-win 优先级。" });
  }

  if (input.recoveryMinutesThisWeek < input.recoveryTargetMinutes) {
    warnings.push({ code: "low_recovery", message: "本周 recovery 不足，不能继续挤掉恢复时间。" });
  }

  return warnings;
}
```

- [ ] **Step 7: Run planning tests**

Run:

```bash
npm run test -- src/tests/unit/capacity.test.ts src/tests/unit/track-balance.test.ts src/tests/unit/warnings.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit planning logic**

Run:

```bash
git add src/lib/planning src/tests/unit/capacity.test.ts src/tests/unit/track-balance.test.ts src/tests/unit/warnings.test.ts
git commit -m "feat: add planning capacity and warning logic"
```

## Task 5: Non-AI Product Screens and API Routes

**Files:**
- Create: `src/components/quick-capture.tsx`
- Create: `src/components/today-view.tsx`
- Create: `src/components/week-view.tsx`
- Create: `src/components/inbox-view.tsx`
- Create: `src/components/settings-view.tsx`
- Create: `src/app/api/inbox/route.ts`
- Create: `src/app/api/tasks/route.ts`
- Create: `src/app/api/checkins/route.ts`
- Modify: route pages under `src/app/(app)/`

- [ ] **Step 1: Create Quick Capture component**

Create `src/components/quick-capture.tsx`:

```tsx
"use client";

import { useState } from "react";

export function QuickCapture() {
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setPending(true);
    await fetch("/api/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setTitle("");
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="+ Quick Capture"
        className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
      />
      <button disabled={pending} className="rounded bg-zinc-950 px-3 py-2 text-sm text-white disabled:opacity-50">
        Add
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create Inbox API**

Create `src/app/api/inbox/route.ts`:

```ts
import { eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { inboxItems } from "@/lib/db/schema";

const inboxSchema = z.object({
  title: z.string().min(1).max(240),
});

export async function GET() {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await db
    .select()
    .from(inboxItems)
    .where(eq(inboxItems.workspaceId, workspaceId));
  return NextResponse.json({ items: items.filter((item) => item.processedAt === null) });
}

export async function POST(request: Request) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = inboxSchema.parse(await request.json());
  const [item] = await db.insert(inboxItems).values({ workspaceId, title: body.title }).returning();
  return NextResponse.json({ item });
}
```

- [ ] **Step 3: Create low-style views for Claude Design handoff**

Create `src/components/today-view.tsx`:

```tsx
import { QuickCapture } from "./quick-capture";

export function TodayView() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <QuickCapture />
      <section>
        <h1 className="text-xl font-semibold">Today</h1>
        <p className="text-sm text-zinc-500">Tasks, warnings, routines, recovery, and check-in live here.</p>
      </section>
      <section className="rounded border border-zinc-200 bg-white p-4">
        <h2 className="font-medium">Tasks</h2>
      </section>
      <section className="rounded border border-zinc-200 bg-white p-4">
        <h2 className="font-medium">Routines</h2>
      </section>
    </div>
  );
}
```

Create `src/components/week-view.tsx`:

```tsx
export function WeekView() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section>
        <h1 className="text-xl font-semibold">Week</h1>
        <p className="text-sm text-zinc-500">Week timeline, capacity, recovery target, and track balance.</p>
      </section>
      <section className="rounded border border-zinc-200 bg-white p-4">
        <h2 className="font-medium">Track Balance</h2>
      </section>
      <section className="rounded border border-zinc-200 bg-white p-4">
        <h2 className="font-medium">Recovery</h2>
      </section>
    </div>
  );
}
```

Create `src/components/month-view.tsx`:

```tsx
export function MonthView() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section>
        <h1 className="text-xl font-semibold">Month</h1>
        <p className="text-sm text-zinc-500">Month-level plan distribution and baseline/current comparison.</p>
      </section>
    </div>
  );
}
```

Create `src/components/inbox-view.tsx`:

```tsx
export function InboxView() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section>
        <h1 className="text-xl font-semibold">Inbox</h1>
        <p className="text-sm text-zinc-500">Capture buffer for items that are not yet tasks.</p>
      </section>
      <section className="rounded border border-zinc-200 bg-white p-4">
        <h2 className="font-medium">Unprocessed Items</h2>
      </section>
    </div>
  );
}
```

Create `src/components/settings-view.tsx`:

```tsx
export function SettingsView() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-zinc-500">Workspace, DeepSeek key, routines, recovery target, segment energy, and track thresholds.</p>
      </section>
    </div>
  );
}
```

Create `src/components/import-view.tsx`:

```tsx
export function ImportView() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section>
        <h1 className="text-xl font-semibold">Import</h1>
        <p className="text-sm text-zinc-500">Import plan.md and timetable.csv, then preview before saving.</p>
      </section>
    </div>
  );
}
```

Create `src/components/reschedule-preview.tsx`:

```tsx
export function ReschedulePreview() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section>
        <h1 className="text-xl font-semibold">Reschedule Preview</h1>
        <p className="text-sm text-zinc-500">Review AI patch operations before applying changes.</p>
      </section>
      <section className="rounded border border-zinc-200 bg-white p-4">
        <h2 className="font-medium">Patch Groups</h2>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Wire Today route**

Modify `src/app/(app)/today/page.tsx`:

```tsx
import { TodayView } from "@/components/today-view";

export default function TodayPage() {
  return <TodayView />;
}
```

Modify `src/app/(app)/week/page.tsx`:

```tsx
import { WeekView } from "@/components/week-view";

export default function WeekPage() {
  return <WeekView />;
}
```

Modify `src/app/(app)/month/page.tsx`:

```tsx
import { MonthView } from "@/components/month-view";

export default function MonthPage() {
  return <MonthView />;
}
```

Modify `src/app/(app)/inbox/page.tsx`:

```tsx
import { InboxView } from "@/components/inbox-view";

export default function InboxPage() {
  return <InboxView />;
}
```

Modify `src/app/(app)/import/page.tsx`:

```tsx
import { ImportView } from "@/components/import-view";

export default function ImportPage() {
  return <ImportView />;
}
```

Modify `src/app/(app)/settings/page.tsx`:

```tsx
import { SettingsView } from "@/components/settings-view";

export default function SettingsPage() {
  return <SettingsView />;
}
```

Modify `src/app/(app)/reschedule/page.tsx`:

```tsx
import { ReschedulePreview } from "@/components/reschedule-preview";

export default function ReschedulePage() {
  return <ReschedulePreview />;
}
```

- [ ] **Step 5: Browser smoke test**

Create `src/tests/e2e/app-smoke.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("renders Today on desktop and mobile", async ({ page }) => {
  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByPlaceholder("+ Quick Capture")).toBeVisible();
});
```

- [ ] **Step 6: Run build and e2e**

Run:

```bash
npm run build
npm run test:e2e
```

Expected: both exit with code 0.

- [ ] **Step 7: Claude Design handoff**

Create `docs/design/claude-design-brief-v0.1.md`:

```markdown
# Claude Design Brief v0.1

Design a responsive Web/PWA interface for an operational AI planning app.

Do not add new product scope. Use these screens:

- Today
- Week
- Month
- Inbox
- Import
- Settings
- Reschedule Preview

Design constraints:

- Schedule-first, not project-manager-first.
- Dense but calm operational UI.
- Today and Week are primary.
- Project, course, tag, and track are filters.
- Routine and recovery are visually separate from tasks.
- AI reschedule appears as preview patches requiring confirmation.
- No landing page.
- No decorative hero.
- Mobile PWA must be first-class.

Deliver:

- Desktop and mobile layout for each screen.
- Component states for empty, loading, warning, error, and populated.
- Visual treatment for AI patch groups: moved, split, defer, backlog, priority change, rejected.
```

- [ ] **Step 8: Commit non-AI screens**

Run:

```bash
git add src/components src/app src/tests/e2e docs/design
git commit -m "feat: add planning app screens and design handoff"
```

## Task 6: Import Parsers and Preview APIs

**Files:**
- Create: `src/lib/imports/plan-markdown.ts`
- Create: `src/lib/imports/timetable-csv.ts`
- Create: `src/app/api/imports/plan/route.ts`
- Create: `src/app/api/imports/timetable/route.ts`
- Create: `src/tests/unit/plan-markdown.test.ts`
- Create: `src/tests/unit/timetable-csv.test.ts`

- [ ] **Step 1: Write Markdown parser test**

Create `src/tests/unit/plan-markdown.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parsePlanMarkdown } from "@/lib/imports/plan-markdown";

describe("plan markdown parser", () => {
  it("extracts goals, projects, and deadlines", () => {
    const result = parsePlanMarkdown(`# June Plan

Goal: finish AI planning MVP

## Projects
- Daily Progress: ship v0.1 by 2026-06-30

## Constraints
- protect morning deep work
`);

    expect(result.goal).toBe("finish AI planning MVP");
    expect(result.projects[0]).toEqual({ name: "Daily Progress", deadline: "2026-06-30" });
    expect(result.constraints).toContain("protect morning deep work");
  });
});
```

- [ ] **Step 2: Implement Markdown parser**

Create `src/lib/imports/plan-markdown.ts`:

```ts
export function parsePlanMarkdown(markdown: string) {
  const lines = markdown.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const goalLine = lines.find((line) => line.toLowerCase().startsWith("goal:"));
  const projects: Array<{ name: string; deadline: string | null }> = [];
  const constraints: string[] = [];

  for (const line of lines) {
    if (line.startsWith("- ") && line.includes(": ship")) {
      const [namePart, rest] = line.slice(2).split(":");
      const deadline = rest?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
      projects.push({ name: namePart.trim(), deadline });
    }
    if (line.startsWith("- ") && line.toLowerCase().includes("protect")) {
      constraints.push(line.slice(2));
    }
  }

  return {
    goal: goalLine ? goalLine.slice("Goal:".length).trim() : null,
    projects,
    constraints,
  };
}
```

- [ ] **Step 3: Write timetable parser test**

Create `src/tests/unit/timetable-csv.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseTimetableCsv } from "@/lib/imports/timetable-csv";

describe("timetable csv parser", () => {
  it("extracts fixed weekly blocks", () => {
    const result = parseTimetableCsv(`title,kind,day_of_week,start_time,end_time,starts_on,ends_on,course,recurrence,notes
Deep Learning Lecture,course,Monday,09:00,11:00,2026-09-01,2026-12-20,Deep Learning,weekly,
`);

    expect(result[0]).toMatchObject({
      title: "Deep Learning Lecture",
      kind: "course",
      dayOfWeek: "Monday",
      startTime: "09:00",
      endTime: "11:00",
    });
  });
});
```

- [ ] **Step 4: Implement timetable parser**

Create `src/lib/imports/timetable-csv.ts`:

```ts
import Papa from "papaparse";
import { z } from "zod";

const rowSchema = z.object({
  title: z.string().min(1),
  kind: z.enum(["course", "meeting", "unavailable", "routine", "recovery"]),
  day_of_week: z.string().min(1),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  starts_on: z.string().min(1),
  ends_on: z.string().min(1),
  course: z.string().optional(),
  recurrence: z.string().optional(),
  notes: z.string().optional(),
});

export function parseTimetableCsv(csv: string) {
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0].message);
  }

  return parsed.data.map((raw) => {
    const row = rowSchema.parse(raw);
    return {
      title: row.title,
      kind: row.kind,
      dayOfWeek: row.day_of_week,
      startTime: row.start_time,
      endTime: row.end_time,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      course: row.course || null,
      recurrence: row.recurrence || null,
      notes: row.notes || null,
    };
  });
}
```

- [ ] **Step 5: Implement import APIs**

Create `src/app/api/imports/plan/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { parsePlanMarkdown } from "@/lib/imports/plan-markdown";

const bodySchema = z.object({ markdown: z.string().min(1) });

export async function POST(request: Request) {
  const body = bodySchema.parse(await request.json());
  return NextResponse.json({ preview: parsePlanMarkdown(body.markdown) });
}
```

Create `src/app/api/imports/timetable/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseTimetableCsv } from "@/lib/imports/timetable-csv";

const bodySchema = z.object({ csv: z.string().min(1) });

export async function POST(request: Request) {
  const body = bodySchema.parse(await request.json());
  return NextResponse.json({ preview: parseTimetableCsv(body.csv) });
}
```

- [ ] **Step 6: Run import tests**

Run:

```bash
npm run test -- src/tests/unit/plan-markdown.test.ts src/tests/unit/timetable-csv.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit import preview**

Run:

```bash
git add src/lib/imports src/app/api/imports src/tests/unit/plan-markdown.test.ts src/tests/unit/timetable-csv.test.ts
git commit -m "feat: add plan and timetable import previews"
```

## Task 7: AI Patch Schema, DeepSeek Client, and Patch Validation

**Files:**
- Create: `src/lib/ai/patch-schema.ts`
- Create: `src/lib/ai/deepseek.ts`
- Create: `src/lib/ai/prompts.ts`
- Create: `src/app/api/ai/reschedule/route.ts`
- Create: `src/app/api/ai/apply-patch/route.ts`
- Create: `src/tests/unit/patch-schema.test.ts`

- [ ] **Step 1: Write patch schema tests**

Create `src/tests/unit/patch-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aiPatchSchema, validatePatchAgainstProtectedBlocks } from "@/lib/ai/patch-schema";

describe("AI patch schema", () => {
  it("accepts move_task patches", () => {
    const parsed = aiPatchSchema.parse({
      operations: [
        {
          type: "move_task",
          task_id: "task-1",
          from_date: "2026-06-03",
          from_day_segment: "morning",
          to_date: "2026-06-04",
          to_day_segment: "afternoon",
          reason: "Morning capacity is full.",
        },
      ],
    });

    expect(parsed.operations).toHaveLength(1);
  });

  it("rejects patches that touch protected blocks", () => {
    expect(() =>
      validatePatchAgainstProtectedBlocks(
        {
          operations: [
            {
              type: "move_protected_block",
              block_id: "recovery-1",
              reason: "Make room for tasks.",
            },
          ],
        },
        ["recovery-1"],
      ),
    ).toThrow("AI patch cannot modify routine or recovery blocks");
  });
});
```

- [ ] **Step 2: Implement patch schema**

Create `src/lib/ai/patch-schema.ts`:

```ts
import { z } from "zod";

const segment = z.enum(["morning", "afternoon", "evening"]);

const moveTask = z.object({
  type: z.literal("move_task"),
  task_id: z.string(),
  from_date: z.string(),
  from_day_segment: segment,
  to_date: z.string(),
  to_day_segment: segment,
  reason: z.string(),
});

const splitTask = z.object({
  type: z.literal("split_task"),
  task_id: z.string(),
  new_tasks: z.array(z.object({
    title: z.string(),
    estimated_minutes: z.number().int().positive(),
    day_segment: segment,
  })),
  reason: z.string(),
});

const deferTask = z.object({
  type: z.literal("defer_task"),
  task_id: z.string(),
  target_week_or_date: z.string(),
  reason: z.string(),
});

const moveToBacklog = z.object({
  type: z.literal("move_to_backlog"),
  task_id: z.string(),
  reason: z.string(),
});

const changePriority = z.object({
  type: z.literal("change_priority"),
  task_id: z.string(),
  from_priority: z.enum(["low", "normal", "high", "urgent"]),
  to_priority: z.enum(["low", "normal", "high", "urgent"]),
  reason: z.string(),
});

const suggestMilestoneChange = z.object({
  type: z.literal("suggest_milestone_change"),
  milestone_id: z.string(),
  proposed_text: z.string(),
  reason: z.string(),
});

const unsupportedProtectedMove = z.object({
  type: z.literal("move_protected_block"),
  block_id: z.string(),
  reason: z.string(),
});

export const aiPatchSchema = z.object({
  operations: z.array(z.union([
    moveTask,
    splitTask,
    deferTask,
    moveToBacklog,
    changePriority,
    suggestMilestoneChange,
  ])),
});

export type AiPatch = z.infer<typeof aiPatchSchema>;

export function validatePatchAgainstProtectedBlocks(
  rawPatch: unknown,
  protectedBlockIds: string[],
) {
  const raw = z.object({ operations: z.array(z.any()) }).parse(rawPatch);
  for (const operation of raw.operations) {
    const parsed = unsupportedProtectedMove.safeParse(operation);
    if (parsed.success && protectedBlockIds.includes(parsed.data.block_id)) {
      throw new Error("AI patch cannot modify routine or recovery blocks");
    }
  }
  return aiPatchSchema.parse(rawPatch);
}
```

- [ ] **Step 3: Implement DeepSeek client wrapper**

Create `src/lib/ai/deepseek.ts`:

```ts
type DeepSeekRequest = {
  apiKey: string;
  model: string;
  system: string;
  user: string;
};

export async function callDeepSeekJson(request: DeepSeekRequest) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${request.apiKey}`,
    },
    body: JSON.stringify({
      model: request.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek request failed with status ${response.status}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("DeepSeek response missing content");
  }
  return JSON.parse(content);
}
```

- [ ] **Step 4: Implement prompt builders**

Create `src/lib/ai/prompts.ts`:

```ts
export function buildRescheduleSystemPrompt() {
  return [
    "You are a planning assistant.",
    "Return JSON only.",
    "You propose patch operations, never prose.",
    "Never move routine blocks.",
    "Never move or shrink recovery blocks.",
    "Never place tasks inside routine or recovery time.",
    "Default scope is the selected scope only.",
  ].join("\\n");
}

export function buildRescheduleUserPrompt(context: unknown) {
  return JSON.stringify(context, null, 2);
}
```

- [ ] **Step 5: Implement reschedule contract API**

Create `src/app/api/ai/reschedule/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { aiPatchSchema } from "@/lib/ai/patch-schema";

const bodySchema = z.object({
  mode: z.enum(["today", "week"]),
});

export async function POST(request: Request) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = bodySchema.parse(await request.json());
  const draftPatch = aiPatchSchema.parse({ operations: [] });

  return NextResponse.json({
    workspaceId,
    mode: body.mode,
    patch: draftPatch,
  });
}
```

- [ ] **Step 6: Run patch tests**

Run:

```bash
npm run test -- src/tests/unit/patch-schema.test.ts
npm run build
```

Expected: both exit with code 0.

- [ ] **Step 7: Commit AI patch foundation**

Run:

```bash
git add src/lib/ai src/app/api/ai src/tests/unit/patch-schema.test.ts
git commit -m "feat: add AI patch validation foundation"
```

## Task 8: Final Foundation Smoke Verification

**Files:**
- Modify: `README.md`
- Create: `.env.example`

- [ ] **Step 1: Create `.env.example`**

Create `.env.example`:

```bash
DATABASE_URL=postgres://user:password@host:5432/daily_progress
APP_SECRET=replace-with-32-byte-random-secret
KEY_ENCRYPTION_SECRET=replace-with-32-byte-random-secret
NEXT_PUBLIC_APP_NAME=Daily Progress
```

- [ ] **Step 2: Update README with v0.1 runbook**

Append to `README.md`:

```markdown
## Environment

Copy `.env.example` to `.env.local` and set values for:

- `DATABASE_URL`
- `APP_SECRET`
- `KEY_ENCRYPTION_SECRET`

## Verification

```bash
npm run test
npm run build
npm run test:e2e
```

## Product Boundary

This stage creates the Next.js + Postgres foundation. Hosted Lite public onboarding, template gallery, OAuth, billing, team workspaces, public sharing, full DeepSeek generation persistence, and full patch transaction application are not part of this stage.
```

- [ ] **Step 3: Full verification**

Run:

```bash
npm run test
npm run build
npm run test:e2e
```

Expected: all exit with code 0.

- [ ] **Step 4: Browser verification**

Run the dev server:

```bash
npm run dev
```

Open:

```txt
http://127.0.0.1:3000/today
```

Verify:

- Today page renders.
- Quick Capture input is visible.
- Sidebar links render.
- Mobile viewport still shows Today content without horizontal overflow.

- [ ] **Step 5: Commit verification docs**

Run:

```bash
git add README.md .env.example
git commit -m "docs: add v0.1 development runbook"
```

## Implementation Notes

- Use a separate branch or worktree for execution, for example `codex/ai-planning-v0-1`.
- Keep commits small and matching the task boundaries above.
- Do not implement hosted public onboarding in v0.1.
- Do not ask Claude Design to change data model or route scope.
- Do not add calendar sync or native iOS.
- Do not extend the legacy static `index.html`; it is archived as reference only.

## Plan Self-Review

Spec coverage:

- Web/PWA covered by Task 1.
- Workspace auth and BYOK covered by Task 3.
- Database schema, track, routine, recovery, inbox covered by Task 2.
- Non-AI screens and Claude Design handoff covered by Task 5.
- Import preview covered by Task 6.
- AI patch schema and reschedule API foundation covered by Task 7.
- Final verification covered by Task 8.

Known implementation boundary:

- Task 7 creates the AI patch foundation and API contract. The first execution pass should validate the contracts and screens before wiring full DeepSeek persistence and transaction application. Full AI generation and apply-patch persistence should be the next implementation plan after this foundation is verified.
