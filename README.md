# Daily Progress

Open-source schedule-first MCP-native planning app.

The old static May dashboard prototype is preserved at `docs/legacy/index-static-dashboard.html`.

## v0.1 Direction

- Web + PWA
- Next.js + Postgres
- Workspace password login
- MCP-native data boundary
- Agent-generated patch preview, confirmed in the app

## Development

```bash
npm install
npm run dev
```

## Environment

Copy `.env.example` to `.env.local` and set values for:

- `DATABASE_URL`
- `APP_SECRET`
- `NEXT_PUBLIC_APP_NAME`

## Verification

```bash
npm run test
npm run build
npm run test:e2e
```

## Product Boundary

This stage creates the Next.js + Postgres foundation. Hosted Lite public onboarding, template gallery, OAuth, billing, team workspaces, public sharing, full MCP server implementation, conversation sediment UI, and full patch transaction application are not part of this stage.

## License

代码 MIT，内容 CC-BY 4.0。
