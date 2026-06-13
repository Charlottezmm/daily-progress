# PawPlan Small Beta Sharing Guide

PawPlan v1.0 remains invite-gated. Do not switch to open signup until PawPlan has email verification, password recovery, quotas, and basic abuse controls.

## Create Invite Codes

Use one code per person by default:

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

The command prints the raw invite code once. The database stores only `code_hash`.

## Message To Send

```text
PawPlan beta:
https://pawplan.charlottezmm.info

Create a new workspace with this invite code:
<invite-code>

After signup, go to Settings and connect Claude with:
https://pawplan.charlottezmm.info/api/mcp

If Claude asks for OAuth Client ID:
pawplan_claude_custom_connector
```

## What To Ask Beta Users To Verify

1. Create a workspace with the invite code.
2. Import a plan.
3. Import a timetable or fixed schedule.
4. Connect Claude/Cowork.
5. Ask Claude to read PawPlan and generate a Review draft only.
6. Accept or reject changes from PawPlan Review.

## Boundaries To Tell Users

- PawPlan is invite-only beta.
- There is no password reset yet.
- AI suggestions do not apply automatically.
- Calendar sync, billing, and team collaboration are not included.
