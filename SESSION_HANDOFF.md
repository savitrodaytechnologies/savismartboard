# Savismartboard — Session Handoff

> Last updated: 24 May 2026. Latest commit: `a3fe00b` (main, origin/main).  
> Working tree: **clean**. All work pushed.

---

## 1. What Was Done This Session

| # | What | Commit |
|---|------|--------|
| 1 | Fixed sign-in (DevController route was `api/dev`, needed `api/v1/dev`; Vite proxy pointed to wrong port) | `794a76d` |
| 2 | Fixed teach.svais.net 502 — Kestrel was binding to `localhost` instead of `0.0.0.0`; fixed on EC2 via SSM + updated systemd service file | `c43dd0a` |
| 3 | Fixed whiteboard text tool: cloning on every click, focus timing, auto-revert to Select after placing text | `80fa23d`, `6783569` |
| 4 | Fixed AI Assist: AI was writing "x squared" in words instead of x² — updated system prompt + added per-tab explicit Unicode math instructions | `6271448`, `ff99c46` |
| 5 | Added `react-markdown` + `remark-gfm` rendering to all 4 AI Assist tabs; added `@tailwindcss/typography` | `6271448` |
| 6 | Moved all AI prompts out of C# strings into **plain-text `.txt` files** (`Prompts/` folder, embedded resources); `AiPromptTemplates.cs` loads them at startup | `a3fe00b` |
| 7 | Updated design doc §17.8 (Prompt Template System), §18.8, §18.9 | across commits |

---

## 2. Repo & Environment

| Item | Value |
|---|---|
| Repo | `https://github.com/savitrodaytechnologies/savismartboard.git` |
| Local path | `C:\savitroday\ppdevelopment\Savismartboard` |
| Backend | ASP.NET Core 8, port **5105** (dev). Run: `cd backend/Smartboard.Api && dotnet run` |
| Frontend | React 18 + Vite + TypeScript + Tailwind, port **5173** (dev). Run: `cd frontend && npm run dev` |
| Vite proxy | `/api` → `http://localhost:5105` |
| EC2 prod | `13.205.70.12`, ap-south-1, `i-0d678aebfb32f889e` |
| Prod URL | `https://teach.svais.net` |
| SSM access | `C:\savitroday\ppdevelopment\saviknowledgebot\scripts\Invoke-Ssm.ps1`, profile `saviknowledgebot` |
| DB | Azure SQL (see `appsettings.Local.json` — not in git) |

### Local config files (not in git)
- `backend/Smartboard.Api/appsettings.Local.json` — DB connection string, AI keys, Savischools/KBot URLs
- Required env vars / appsettings keys:
  - `SMARTBOARD_AI_KEY` — DeepSeek API key
  - `SMARTBOARD_AI_VISION_KEY` — Anthropic Claude API key
  - `ConnectionStrings:Smartboard` — SQL Server connection string

---

## 3. Current Architecture

```
Browser (React + Konva)
    └── /api proxy (Vite dev) or nginx (prod)
            └── Smartboard API (ASP.NET Core 8)
                    ├── Savischools API  (teacher auth, class/subject/topic context)
                    ├── KBot API         (content cards, questions, curriculum)
                    ├── DeepSeek         (text AI via IAiClient)
                    └── Anthropic Claude (vision AI — lasso selection)
```

### Key backend files

| File | Purpose |
|---|---|
| `Controllers/SmartboardAiController.cs` | AI endpoints (`/api/v1/smartboard/ai/*`) |
| `Controllers/SmartboardKBotContentController.cs` | KBot content card endpoints |
| `Controllers/SmartboardKBotCurriculumController.cs` | KBot curriculum/topic endpoints |
| `Controllers/SmartboardQuestionController.cs` | KBot question endpoints |
| `Controllers/SmartboardSessionController.cs` | Session CRUD + page sync |
| `Services/SmartboardAiService.cs` | All AI logic; uses `AiPromptTemplates` |
| `Prompts/AiPromptGlobal.txt` | Global system prompt (edit to change AI persona) |
| `Prompts/SelectionTab_*.txt` | Per-tab lasso prompts (solution / explain / mistakes / quiz) |
| `Prompts/AiPromptTemplates.cs` | Loader — reads `.txt` files from embedded resources |
| `HttpClients/AiClient.cs` | DeepSeek text client |
| `HttpClients/KBotClient.cs` | KBot API client |
| `HttpClients/SavischoolsClient.cs` | Savischools auth/context client |
| `Auth/TeacherContextAccessor.cs` | Extracts teacher/school from JWT |

### Key frontend files

| File | Purpose |
|---|---|
| `pages/SmartboardSessionPage.tsx` | Main session page — 70/30 split (canvas / right panel) |
| `pages/TeacherDashboardPage.tsx` | Dashboard — class/subject/topic selector |
| `components/canvas/WhiteboardCanvas.tsx` | Konva canvas — draw, text, lasso, page management |
| `components/canvas/AiAssistPanel.tsx` | Right panel — 4 AI tabs (Solution/Explain/Mistakes/Quiz) |
| `components/canvas/CanvasToolbar.tsx` | Tool palette |
| `components/canvas/PageStrip.tsx` | Page thumbnails strip at bottom |
| `services/aiService.ts` | AI API calls |
| `services/kbotContentService.ts` | KBot content card calls |
| `services/kbotQuestionService.ts` | KBot question calls |
| `services/smartboardSessionService.ts` | Session sync, page CRUD |

---

## 4. Current State of the Right Panel

The right panel is **currently only AI Assist** — 4 tabs: Solution, Explain, Mistakes, Quiz.

These tabs activate when the teacher uses the **Lasso tool** to circle content and taps "Ask AI ✨".  
The panel renders markdown (via `react-markdown` + `remark-gfm` + `@tailwindcss/typography`).  
All 4 tabs work and display equations correctly using Unicode.

**The right panel needs to grow** — see §5 below.

---

## 5. Next Feature: Expand Right Panel (Designed, Not Built)

The right panel should become a multi-purpose **Teaching Sidebar** with 4 top-level tabs:

### Proposed tab structure

```
[ 📚 Content Cards | ❓ Questions | 📝 Quiz | 🧠 AI Assist ]
```

#### Tab 1 — Content Cards
- KBot curriculum content cards for the current class / subject / topic
- Scrollable list with card title + excerpt
- "Add to board" button → pushes card onto canvas as a new page
- Data source: `SmartboardKBotContentController` → `KBotClient` (already exists)

#### Tab 2 — Questions
- Practice questions from KBot for current topic
- Difficulty filter (All / Easy / Medium / Hard)
- Checkbox to mark for Quiz tab
- "Write on board" → inserts question text as canvas text object
- Data source: `SmartboardQuestionController` → `KBotClient` (already exists)

#### Tab 3 — Quiz
- One-question-at-a-time display using questions checked in Tab 2
- Navigation: Prev / Next
- "Show Answer" button (teacher-controlled reveal)
- State is in-memory only — no new API needed
- Future: push question to student devices

#### Tab 4 — AI Assist *(current panel, unchanged)*
- Lasso selection → 4 sub-tabs (Solution / Explain / Mistakes / Quiz)
- Auto-switches to this tab when teacher taps "Ask AI ✨"

### Open design questions before coding
1. "Add to board" for content cards — new page, or insert inline on current page?
2. "Write on board" for questions — auto-placed at canvas centre, or teacher positions it?
3. Quiz answer — only in panel, or also pushed to canvas for class review?
4. Empty state — if no topic selected (blank board), show search box or "select topic first"?

### Existing APIs that power these tabs (no new backend needed for MVP)
| Tab | Existing frontend service | Existing controller |
|---|---|---|
| Content Cards | `kbotContentService.ts` | `SmartboardKBotContentController.cs` |
| Questions | `kbotQuestionService.ts` | `SmartboardQuestionController.cs` |
| AI Assist | `aiService.ts` | `SmartboardAiController.cs` |

---

## 6. EC2 Production Notes

- **URL:** `https://teach.svais.net` → nginx on Docker → `http://172.18.0.1:5000` (Smartboard API)
- **Kestrel** binds to `0.0.0.0:5000` (was `localhost` — caused 502, fixed 21 May 2026)
- **Systemd service:** `/etc/systemd/system/smartboard-api.service`
  - Has `Environment=ASPNETCORE_URLS=http://0.0.0.0:5000`
  - **Important:** Edit the service file, **not** the env file, for URL changes
- **Deploy:** `deploy/scripts/deploy.sh` — pulls from GitHub, rebuilds, restarts service
- **SSM:** `Invoke-Ssm.ps1 -InstanceId i-0d678aebfb32f889e -ProfileName saviknowledgebot -Command "..."`

---

## 7. Design Doc

Full design details: `docs/Smartboard-Design.md`

Key sections:
- §5 — API routes
- §17 — AI Assist Panel (lasso flow, tabs, prompt system §17.8)
- §18 — EC2 infrastructure, nginx, troubleshooting

---

## 8. Immediate Next Steps

1. **Answer the 4 open design questions** in §5 above, then start building the expanded right panel
2. Suggested implementation order:
   - Refactor `SmartboardSessionPage.tsx` to render a top-level `TeachingSidebar` component with 4 tabs
   - Move `AiAssistPanel` inside the new sidebar as the AI tab
   - Build `ContentCardsTab` component (calls `kbotContentService`)
   - Build `QuestionsTab` component (calls `kbotQuestionService`, has checkboxes)
   - Build `QuizTab` component (reads checked questions from Questions tab state)
3. After right panel: M5 share — signed URL delivery to student/parent portal via Savischools
