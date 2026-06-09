# PawPlan v0.1 Handoff

Date: 2026-06-08
Repo: `/Users/charlotte/daily-progress`
Branch: `codex/mcp-planning-v0-1`
Local app: `http://localhost:3000`

## Current Product Direction

PawPlan is an agent-first planning PWA.

The app UI is not meant to be a full manual planner. The main job of the PWA is:

- show the plan Agent already prepared;
- let the user quickly check task status;
- collect a short end-of-day feedback;
- show proposed schedule changes for explicit user confirmation.

The real planning intelligence should live in Codex / Cowork scheduled automation via MCP. Postgres is the source of truth. The app reads and writes structured data; Agents read that data through MCP and write back proposed patches.

## Key Decisions So Far

- Main navigation is `Today / Plan / Review / More`.
- `Today` is the daily execution surface, not a calendar editor.
- `Plan` displays day / week / month plan output.
- `Review` is the patch confirmation layer. Agent suggestions must be reviewed before apply.
- `More` holds low-frequency setup and imports.
- Calendar, courses, routines, recovery are planning constraints, but the word `constraint layer` should not appear in the user-facing Today UI.
- `Quick Capture` should not dominate the top of Today. It belongs in Inbox / More flows.
- Scheduled automation is handled by Codex / Cowork, not by the app itself.
- MCP is the preferred Agent integration path. Direct API chat is not the primary product direction.

## Implemented UI State

The UI has been moved toward the Claude Design `PawPlan v2` reference:

- PawPlan brand name and cat icon are retained.
- Global visual system now uses Quicksand, light blue accent, soft cards, top web nav, and mobile bottom tabs.
- `public/manifest.webmanifest` uses PawPlan branding.
- `src/app/layout.tsx` sets PawPlan metadata and font preconnect.
- `src/components/cat-icon.tsx` adds reusable cat icons.
- `src/components/app-shell.tsx` now renders PawPlan top nav and mobile tab bar.

Pages currently shaped:

- `/today`
  - heading: `今日执行`
  - agent message: user only checks facts; unfinished items enter next Agent review
  - task list with `完成 / 卡住 / 跳过 / 延后`
  - no longer shows the confusing `约束层` card
  - shows `下一次自动审核`
  - includes `收工反馈`

- `/plan`
  - tabs: day / week / month
  - displays Agent-arranged plan data
  - date changes are intentionally not manual here

- `/review`
  - displays MCP / Agent patch proposals
  - user accepts or rejects before applying
  - routine / recovery protection is explained here

- `/more`
  - now grouped in Chinese:
    - `收集`: 暂存池, 导入
    - `约束`: 日历与课程, 日常事项
    - `连接`: 设置, MCP 连接

- `/inbox`
  - PawPlan-styled temporary capture inbox
  - actions remain: promote to task, convert to routine, delete

- `/import`
  - PawPlan-styled placeholder for plan document and timetable import
  - no fake upload behavior added yet

- `/settings`
  - PawPlan-styled placeholder for Workspace, MCP, recovery, routines, and energy rules
  - no fake settings behavior added yet

Compatibility redirects:

- `/week` and `/month` route into `/plan`.
- `/reschedule` routes into `/review`.

## Current Server State

Port 3000 is already running a local Next server:

```bash
http://localhost:3000
```

Unauthenticated `/today` redirects to `/login`, which is expected.

## Verification Already Run

Latest passing checks:

```bash
npm run test
npm run build
git diff --check
```

Earlier after the larger UI pass, this also passed:

```bash
npm run test:e2e
```

Note: `npm run lint` currently does not run because the project has no ESLint config and `next lint` opens an interactive setup prompt. Do not silently add ESLint config inside unrelated UI work.

## Known Dirty Worktree

There are many uncommitted changes. Do not assume all are from the last UI tweak.

Expected changed areas include:

- PRD and implementation plan docs:
  - `docs/superpowers/specs/2026-05-24-ai-planning-app-design.md`
  - `docs/superpowers/plans/2026-06-03-ai-planning-app-v0-1-implementation.md`
  - `docs/superpowers/plans/2026-06-08-agent-first-ui-mcp-automation-plan.md`
  - `docs/design/claude-design-brief-v0.1.md`
  - `docs/design/claude-design-ui-integration-v0.1.md`

- PawPlan UI:
  - `src/app/globals.css`
  - `src/app/layout.tsx`
  - `src/components/app-shell.tsx`
  - `src/components/cat-icon.tsx`
  - `src/components/today-view.tsx`
  - `src/components/daily-checkin.tsx`
  - `src/components/plan-view.tsx`
  - `src/components/reschedule-preview.tsx`
  - `src/components/more-view.tsx`
  - `src/components/inbox-view.tsx`
  - `src/components/import-view.tsx`
  - `src/components/settings-view.tsx`
  - `src/components/login-form.tsx`
  - `public/manifest.webmanifest`
  - `src/tests/e2e/app-smoke.spec.ts`

## Suggested Next Development Order

1. Finalize UI wording and page hierarchy.
   - Make sure user-facing terms are simple.
   - Avoid terms like `constraint layer` in primary UI.
   - Keep technical concepts in docs, MCP schema, or settings descriptions.

2. Implement the MCP integration contract.
   - Expose read tools for today / week / month / checkins / review patches.
   - Expose write tools for task status, checkin, inbox item, conversation summary, and proposed patch.
   - Keep `propose_patch` preview-first; user confirms in app before applying.

3. Implement real patch application.
   - Review page currently supports local accept/reject state.
   - Next step is applying accepted operations to Postgres through a server action or API route.

4. Implement import flows.
   - Plan document import: parse plan.md / html into structured projects, milestones, and candidate tasks.
   - Timetable import: parse CSV into fixed schedule blocks.
   - Both should preview before saving.

5. Add real settings for routines, recovery target, and energy segments.
   - These are data inputs for Agent planning, not daily manual operations.

6. Create or configure Codex / Cowork scheduled automation.
   - The scheduled automation should inspect current data through MCP.
   - It should write proposed patches, not directly mutate schedule dates without confirmation.

## Recommended First Task In New Window

Start with:

> Continue from `docs/handoff/2026-06-08-pawplan-v0-1-handoff.md`. First, inspect the dirty worktree, then implement the MCP server contract or patch-apply flow without changing unrelated UI.

If continuing UI polish first, start with:

> Continue from the handoff. Review `/today`, `/plan`, `/review`, `/more`, `/inbox`, `/import`, and `/settings` in browser, then make only wording/layout polish changes.

## Do Not Do Next

- Do not turn Today into a full manual calendar editor.
- Do not add fake upload or fake settings interactions just for UI appearance.
- Do not implement an in-app scheduler; scheduling belongs to Codex / Cowork automation.
- Do not rename PawPlan back to Daily Progress.
- Do not add broad refactors or ESLint setup inside the next feature unless explicitly requested.
