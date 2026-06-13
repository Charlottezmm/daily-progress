# PawPlan Deployment / Domain Handoff

Date: 2026-06-11
Workspace: `/Users/charlotte/daily-progress`
Branch: `codex/mcp-planning-v0-1`

## Current State

PawPlan product development for the requested v0.1 scope is implemented and pushed on `codex/mcp-planning-v0-1`.

Completed implementation:

- Review patch apply flow writes real changes to Postgres and records changelog.
- Planning service layer exists and API write paths use it.
- MCP server contract exists for reading today/week/month/checkins/tasks and writing inbox/checkin/task status/proposed patches.
- Import preview/save exists for `plan.md` and `timetable.csv`; HTML import is intentionally not open.
- Settings page reads/writes real routines and energy rules; recovery target is read-only system default.
- Scheduled automation usage is documented: agent proposes patches only; user confirms in Review.
- Vercel project `daily-progress` has been linked locally.
- Vercel framework preset was changed from `Other` to `nextjs`.
- Vercel production env currently has:
  - `APP_SECRET`
  - `NEXT_PUBLIC_APP_NAME=PawPlan`
- `.vercel` is ignored in git.

Latest pushed setup commit:

```text
c3ad425 chore: ignore Vercel project metadata
```

Latest verified commands before domain/deploy handoff:

```bash
npm run test
npm run build
```

Both passed at the time of handoff.

## Current Blockers

PawPlan is not production-usable yet because two external setup items are incomplete.

### 1. Production Postgres

Vercel has no database resource connected yet.

Confirmed:

```bash
npx vercel integration list --format=json
```

returns:

```json
{ "resources": [] }
```

`DATABASE_URL` is missing from Vercel env. The app cannot be deployed as a usable production PWA until this exists.

Attempted Neon Marketplace creation:

```bash
npx vercel integration add neon --name pawplan-db --plan free_v3 -m region=iad1 -m auth=false -e production -e preview --no-env-pull --format=json
```

Blocked by:

```text
integration_terms_acceptance_required
```

User must accept Neon Marketplace terms in Vercel. The agent should not accept third-party legal terms on the user's behalf.

### 2. Domain

Old domain `charlottezengmm.online` should not be used for PawPlan.

WHOIS currently shows:

```text
Domain Status: serverHold
Name Server: bonnie.ns.cloudflare.com
Name Server: quinton.ns.cloudflare.com
```

Meaning:

- The Cloudflare nameservers are set correctly.
- The registrar/registry is still holding the domain.
- DNS changes in Cloudflare or Alibaba Cloud will not fix it while `serverHold` remains.
- Do not spend more time adding CNAME records to this old domain unless Alibaba Cloud first removes `serverHold`.

Vercel still has these old project domains:

```text
pawplan.charlottezengmm.online
30days.charlottezengmm.online
daily-progress-iota.vercel.app
```

But `charlottezengmm.online` should be treated as blocked.

## Recommended User Path

Use a new general-purpose root domain, then attach PawPlan as a subdomain.

Best practical option:

```text
charlottezeng.com
```

Use:

```text
pawplan.charlottezeng.com
```

Future project examples:

```text
mc.charlottezeng.com
video.charlottezeng.com
lab.charlottezeng.com
docs.charlottezeng.com
```

Recommended registrar path:

- If Alibaba Cloud purchase/payment works: buy `charlottezeng.com` there and keep Alibaba Cloud DNS.
- If Alibaba Cloud is painful: buy from Cloudflare or Namecheap, then use that registrar's DNS or Cloudflare DNS.
- Do not keep trying GoDaddy if it shows odd rules, bundles, steep renewal pricing, or unsupported TLD constraints.

For an Alibaba Cloud managed domain, add this DNS record after purchase:

```text
Record type: CNAME
Host/Name: pawplan
Value/Target: f99460aec13ea54d.vercel-dns-017.com
TTL: default
```

For Cloudflare managed DNS, add the same record with proxy disabled:

```text
Type: CNAME
Name: pawplan
Target: f99460aec13ea54d.vercel-dns-017.com
Proxy status: DNS only
TTL: Auto
```

## User Must Do

The user needs to complete these external-account actions:

1. Buy a new general domain, preferably `charlottezeng.com`.
2. Keep or configure a working DNS provider for that domain.
3. Add the `pawplan` CNAME record to Vercel.
4. Accept Neon Marketplace terms in Vercel, or provide another production Postgres connection string.

Do not ask the user to do code work.

## Agent Next Steps After User Completes External Actions

Once the user has a working domain and has accepted Neon terms:

1. Re-check git status:

```bash
git status --short --branch
```

2. Create Neon database if terms are accepted:

```bash
npm_config_cache=/tmp/pawplan-npm-cache-neon npx vercel integration add neon --name pawplan-db --plan free_v3 -m region=iad1 -m auth=false -e production -e preview --no-env-pull --format=json
```

3. Confirm env:

```bash
npm_config_cache=/tmp/pawplan-npm-cache-env npx vercel env ls
```

Expected production env should include:

```text
DATABASE_URL
APP_SECRET
NEXT_PUBLIC_APP_NAME
```

4. If the integration does not create `DATABASE_URL`, set it manually from the production Postgres connection string. Do not print or commit secrets.

5. Run production migrations against the production database.

Use the production `DATABASE_URL` only in process env, not in committed files:

```bash
DATABASE_URL='<production-postgres-url>' npm run db:migrate
```

6. Add/replace the Vercel project domain for the new domain:

```bash
npm_config_cache=/tmp/pawplan-npm-cache-domain npx vercel domains add pawplan.<new-root-domain>
```

7. Verify Vercel domain config:

```bash
npm_config_cache=/tmp/pawplan-npm-cache-domainconfig npx vercel api /v6/domains/pawplan.<new-root-domain>/config --scope charlottes-projects-f7255399 --raw
```

8. Run local verification:

```bash
npm run test
npm run build
```

9. Deploy production:

```bash
npm_config_cache=/tmp/pawplan-npm-cache-deploy npx vercel --prod
```

10. Verify the live PWA:

```bash
curl -I https://pawplan.<new-root-domain>
```

Also open it in the browser and verify:

- `/login` loads.
- Login works.
- Today page loads real workspace data.
- Review page can show/apply patches.
- Import and Settings pages do not show fake functionality.

## New Window Prompt

Copy this into a new Codex window:

```text
你在 /Users/charlotte/daily-progress 继续 PawPlan 的生产部署收尾。

先阅读：
docs/handoff/2026-06-08-pawplan-v0-1-handoff.md
docs/handoff/2026-06-11-pawplan-deploy-domain-handoff.md

然后先做：
1. git status --short --branch
2. npm_config_cache=/tmp/pawplan-handoff-env npx vercel env ls
3. npm_config_cache=/tmp/pawplan-handoff-int npx vercel integration list --format=json

当前代码开发基本完成并已推到 branch codex/mcp-planning-v0-1。不要重新实现 PawPlan 功能，重点是生产部署：
- 创建/绑定 production Postgres
- 跑 production migration
- 绑定新域名 pawplan.<root-domain>
- 验证生产 PWA

旧域名 charlottezengmm.online 不要继续修；WHOIS 显示 serverHold，DNS 改动不会生效。

我会在新窗口告诉你我新买的 root domain 是什么，并说明 Neon Marketplace terms 是否已接受。

如果 Neon terms 已接受，优先用：
npm_config_cache=/tmp/pawplan-npm-cache-neon npx vercel integration add neon --name pawplan-db --plan free_v3 -m region=iad1 -m auth=false -e production -e preview --no-env-pull --format=json

如果我提供生产 Postgres DATABASE_URL，就只把它写入 Vercel env/临时 process env，不要打印 secret，不要提交到 git。

每个可验证阶段后跑：
npm run test
npm run build
必要时跑 npm run test:e2e

完成后告诉我：
- 生产 URL
- PWA 如何安装/使用
- 数据库和域名状态
- git status
```
