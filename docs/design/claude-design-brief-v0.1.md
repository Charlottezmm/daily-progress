# Claude Design Brief v0.1

Design a responsive Web/PWA interface for an operational MCP-native planning app.

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
- Daily Check-in is always visible at the bottom of Today with three inputs: 完成 / 卡点 / 明日接.
- Do not design PWA push notification for v0.1; only design the Today check-in card and in-app warning state.
- Agent/MCP reschedule appears as preview patches requiring confirmation.
- No landing page.
- No decorative hero.
- Mobile PWA must be first-class.

Deliver:

- Desktop and mobile layout for each screen.
- Component states for empty, loading, warning, error, and populated.
- Visual treatment for agent patch groups: moved, split, defer, backlog, priority change, rejected.
