# Savismartboard

Classroom smartboard app that composes **Savischools** (identity, classes, syllabus) and **KBot** (content cards, questions, solved cards) into a single teaching surface. The Smartboard app does **not** own users, syllabus, or curriculum — it is a delivery layer.

> Detailed design: [docs/Smartboard-Design.md](docs/Smartboard-Design.md)

## Repository layout

```
Savismartboard/
├─ backend/                     ASP.NET Core 8 Web API + xUnit tests
│  ├─ Savismartboard.sln
│  ├─ Smartboard.Api/
│  └─ Smartboard.Api.Tests/
├─ frontend/                    React + TypeScript + Vite + Tailwind + Konva
├─ db/                          MS SQL Server migrations and seed
│  ├─ migrations/
│  └─ seed/
├─ docs/                        Design + decision records
├─ scripts/                     Local setup helpers (PowerShell)
└─ .github/                     CI, CODEOWNERS, PR template
```

## Team and ownership

| Area | Owner | Reviewer |
|---|---|---|
| Smartboard core (canvas, sessions, AI, infra, contracts) | **Parivesh** | — |
| Savischools integration (auth, classes, topics, share) | **Manohar** | Parivesh |
| KBot integration (content cards, questions, solved cards) | **Mukesh** | Parivesh |

Folder-level ownership is enforced by [`.github/CODEOWNERS`](.github/CODEOWNERS) — every PR auto-requests the right reviewer, and Parivesh is on every PR for quality oversight.

## Prerequisites

- **.NET 8 SDK** — https://dot.net
- **Node.js 20+** and **npm**
- **Microsoft SQL Server** (Developer or Express) and `sqlcmd`
- **Git** (already required)
- Optional: **Azure Data Studio** or **SSMS** for DB inspection

## One-shot setup

```powershell
# from the repo root
.\scripts\setup.ps1
```

This restores backend NuGet packages, installs frontend npm packages, creates the `Savismartboard` database (if missing), and runs migrations + dev seed.

## Run it

Two terminals:

```powershell
# Terminal 1 — API
cd backend\Smartboard.Api
dotnet run
# → https://localhost:7001  (Swagger UI at /swagger)
```

```powershell
# Terminal 2 — Web
cd frontend
npm run dev
# → http://localhost:5173
```

The frontend dev server proxies `/api/*` to the backend. Adjust the port in [frontend/vite.config.ts](frontend/vite.config.ts) if your Kestrel port differs.

## Branching and PR flow

- Default branch: `main` (protected; PR + 1 review required).
- Feature branches: `feat/<area>/<short-desc>` e.g. `feat/kbot/cards-list`.
- Bugfix branches: `fix/<area>/<short-desc>`.
- Every PR runs CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)): backend build+test, frontend build+test.
- Use the PR template; tick the owner-area checkbox.

## Local development conventions

- Never commit secrets. Use `dotnet user-secrets` for local connection strings if they differ from defaults:
  ```powershell
  cd backend\Smartboard.Api
  dotnet user-secrets init
  dotnet user-secrets set "ConnectionStrings:Smartboard" "Server=...;Database=Savismartboard;..."
  ```
- All annotation coordinates are normalized 0..1 against the page viewport — see design §4.2.
- All session writes are diff-based and idempotent; use `Revision` for concurrency.
- Frontend never calls Savischools or KBot directly — always through `/api/smartboard/*`.

## Useful commands

```powershell
# Backend
dotnet build  backend\Savismartboard.sln
dotnet test   backend\Savismartboard.sln
dotnet run --project backend\Smartboard.Api

# Frontend
npm --prefix frontend run dev
npm --prefix frontend run build
npm --prefix frontend test

# DB migration (manual)
sqlcmd -S localhost -d Savismartboard -i db\migrations\001_create_smartboard_schema.sql
```

## License

Internal — Savischools. All rights reserved.
