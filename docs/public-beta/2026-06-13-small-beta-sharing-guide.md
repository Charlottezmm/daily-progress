# PawPlan v1 Formal Invite Sharing Guide

PawPlan v1 formal remains an invite-only controlled beta. Do not switch to open signup until PawPlan has email verification, password recovery, quotas, and basic abuse controls.

## Create Invite Links

If you are an owner workspace, open PawPlan `More -> 邀请管理` to create and monitor invite links from the app.

Use one link per person by default:

```bash
npm run beta:invite -- --label="Friend name" --max-redemptions=1 --expires-in-days=30
```

For a small class or cohort:

```bash
npm run beta:invite -- --label="June beta cohort" --max-redemptions=10 --expires-in-days=14
```

For production, run with the production environment loaded. Do not print or commit `DATABASE_URL`.

```bash
tmp_env=$(mktemp /tmp/pawplan-prod-env.XXXXXX)
npm_config_cache=/tmp/pawplan-npm-cache-envpull npx vercel env pull "$tmp_env" --environment=production --scope charlottes-projects-f7255399 --yes
set -a
. "$tmp_env"
set +a
npm run beta:invite -- --label="Friend name" --max-redemptions=1 --expires-in-days=30
rm -f "$tmp_env"
```

The command prints an `inviteUrl` once. The URL contains a raw invite token; the database stores only `code_hash`.

## View Invited Workspaces

In the app, the owner-only invite admin shows the same workspace table. For terminal readback, use this read-only command with the production environment loaded:

```bash
npm run beta:workspaces
```

It lists workspace id, workspace name, creation time, invite label, redemption count, expiration, and disabled state. It does not print raw invite tokens or passwords.

## Owner Admin Access

Set `PAWPLAN_ADMIN_WORKSPACE_IDS` in production to a comma-separated list of owner workspace ids. Only those workspaces can open `/admin/invites` or call `/api/admin/invites`.

Do not expose invite creation in regular Settings. Invited users should not automatically be allowed to invite more users.

## Message To Send

```text
PawPlan v1 formal invite:
<invite-url>

After signup, go to Settings and connect Claude with:
https://pawplan.charlottezmm.info/api/mcp

If Claude asks for OAuth Client ID:
pawplan_claude_custom_connector
```

## What To Ask Beta Users To Verify

1. Open the invite link and create a workspace.
2. Import a plan.
3. Import a timetable or fixed schedule.
4. Connect Claude/Cowork.
5. Ask Claude to read PawPlan and generate a Review draft only.
6. Accept or reject changes from PawPlan Review.

## Boundaries To Tell Users

- PawPlan v1 formal is invite-only controlled beta.
- Each one-person invite link can create only one workspace.
- There is no password reset yet.
- AI suggestions do not apply automatically.
- Calendar sync, billing, and team collaboration are not included.
