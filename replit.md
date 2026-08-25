# PC Remote Control Dashboard

A personal web tool that lets you monitor and control your Windows PCs from a browser — mission control for your home setup. View all connected PCs at a glance, run commands, take screenshots, and manage them without touching them.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/pc-dashboard run dev` — run the frontend dashboard
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provided by Replit)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite + Tailwind CSS v4 + shadcn/ui
- API: Express 5 + WebSocket (ws)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec in `lib/api-spec/openapi.yaml`)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/pc-dashboard/` — React frontend (dashboard UI)
- `artifacts/api-server/` — Express API + WebSocket server
- `lib/db/` — Drizzle schema + migrations (source of truth: `lib/db/src/schema/`)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contract)
- `lib/api-client-react/` — generated React Query hooks (from Orval)
- `lib/api-zod/` — generated Zod schemas (from Orval)
- `scripts/pc-agent/` — Python agent that runs on Windows PCs and connects via WebSocket

## Architecture decisions

- The frontend uses `@workspace/api-client-react` for all API calls — never relative imports.
- PC connections are maintained via WebSocket at `/ws`; the agent polls every 3s.
- The Python agent (`pc_agent.py`) connects to `wss://<app-url>/ws` and receives commands.
- DB is Replit's managed PostgreSQL — `DATABASE_URL` is injected automatically at runtime.

## Product

Users run the dashboard in a browser and connect Windows PCs by deploying `pc_agent.py` (or `launch.bat`) on each machine. Once connected, they can: view system info, take screenshots, run PowerShell commands, control volume/clipboard, manage power state, kill processes, and open files.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after any changes to `lib/api-spec/openapi.yaml` to regenerate client hooks and Zod schemas.
- Run `pnpm --filter @workspace/db run push` after schema changes to apply them to the dev database.
- The API server must be built before it starts (`pnpm run build` runs esbuild).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
