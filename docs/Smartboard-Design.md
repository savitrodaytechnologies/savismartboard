# Savischools Smartboard — Detailed Design Document

> Version: 1.3  
> Date: 17 May 2026  
> Status: In development — see §16 for current implementation status  
> Owners: Parivesh (Smartboard Core) · Manohar (Savischools Integration) · Mukesh (KBot Integration)

---

## 1. Vision and Guiding Principles

The Smartboard App is a **classroom delivery layer**. It does not own users, syllabus, lesson content, or the question bank. It composes existing systems into a single teaching surface.

**Guiding principles**

1. **Reuse over rebuild.** Identity, syllabus, and curriculum live in Savischools and KBot. Smartboard never duplicates them.
2. **One source of truth per concern.** Auth → Savischools. Curriculum content → KBot. Classroom delivery state → Smartboard.
3. **LLM is the last resort.** Use Savischools data → KBot cards → KBot questions → KBot solved cards → only then LLM.
4. **Sessions are reproducible.** Every annotation links to a pinned `SourceVersionId`, so reopening a class shows exactly what was taught.
5. **Per-school feature flags from day one.** Smartboard, AI, export, and student-sharing can all be toggled by school.
6. **Designed online, ready for offline.** v1 is online-only, but storage and sync layers are shaped to allow IndexedDB/queue offline mode later without redesign.

**Non-goals (v1)**

- No new login system.
- No editing of original KBot content.
- No real-time multi-teacher co-editing.
- No native mobile app — responsive web optimized for large touch displays.

---

## 2. System Context

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Smartboard Web App                           │
│              React + TypeScript + Konva + Tailwind                   │
└────────────────┬───────────────────────────────┬─────────────────────┘
                 │ Auth: Savischools JWT         │
                 ▼                               ▼
        ┌─────────────────────┐        ┌────────────────────────┐
        │  Smartboard API     │◄──────►│  AI Service (gateway)  │
        │  (ASP.NET Core)     │        │  prompts + cost log    │
        └─┬──────────┬────────┘        └────────────────────────┘
          │          │
          │          └──────────────┐
          ▼                         ▼
┌────────────────────┐    ┌────────────────────┐
│  Savischools API   │    │      KBot API      │
│ school/teacher/    │    │ content cards /    │
│ class/syllabus     │    │ questions / solved │
└────────────────────┘    └────────────────────┘
```

**Key rule:** The browser talks **only** to the Smartboard API. Smartboard API is the gateway that calls Savischools, KBot, and the AI provider. This gives us one place to enforce auth, multi-tenant isolation, caching, and AI cost control.

---

## 3. High-Level Architecture

### 3.1 Frontend
- **Framework:** React 18 + TypeScript (Vite).
- **Canvas:** Konva.js via `react-konva` for ink + shape layer; HTML/iframe layer for KBot card background.
- **Styling:** Tailwind CSS.
- **State:** Zustand for session/board state; React Query for server data.
- **Routing:** React Router.
- **PDF export:** Server-side preferred (consistent fonts/diagrams). Client fallback via `pdf-lib` for offline.

### 3.2 Backend
- **Runtime:** ASP.NET Core 8 Web API.
- **Auth:** Validates Savischools-issued JWT (JWKS); no local user store.
- **Persistence:** SQL Server for Smartboard tables; blob storage (Azure Blob / S3) for snapshots and exported PDFs.
- **Outbound integration:** Typed HTTP clients for Savischools, KBot, AI provider (Polly retry/circuit breaker).
- **Caching:** In-memory + Redis (optional) for KBot content (TTL based on `eTag`/`updatedAt`).
- **Background jobs:** Hosted service (or Hangfire) for export rendering and cleanup.

### 3.3 Cross-cutting
- Structured logging (Serilog → file/Seq/App Insights).
- Correlation ID per request (`X-Correlation-Id`), propagated to upstream calls.
- Health endpoints `/healthz` (liveness) and `/readyz` (dependencies).
- Feature flags per school via `SmartboardSchoolSetting`.

### 3.4 Blob storage (S3)
- **Bucket:** `savismartboard-sessions` (ap-south-1, private, all public access blocked).
- **Access:** EC2 instance profile (`saviknowledgebot-ec2-role`) has inline policy `savismartboard-s3-sessions` granting `PutObject`, `GetObject`, `DeleteObject` on `sessions/*` and `ListBucket`. No static credentials needed.
- **SDK:** `AWSSDK.S3` v3.7 registered as `IAmazonS3` singleton in DI; uses EC2 IMDSv2 automatically.
- **Object layout:** `sessions/{sessionId}/page-{pageNo}.json` (gzip-compressed, `Content-Encoding: gzip`).
- **`IS3PageArchiveService`:**
  - `ArchivePageAsync(sessionId, pageNo, json)` — gzip → `PutObject` → returns S3 key.
  - `RestorePageAsync(s3Key)` — `GetObject` → gunzip → returns JSON string.
- **Write path:** `EndAsync` in `SmartboardSessionService` — mark Ended first (critical), then archive each page best-effort. Failure is logged as Warning; `PageJson` stays in DB (zero data loss on S3 failure).
- **Read path:** `GetAsync` detects pages where `PageJson IS NULL` and `PageJsonUrl IS NOT NULL`, fetches all in parallel from S3, patches into the returned DTO. Frontend is unaware — always receives populated `pageJson`.
- **Future:** Lifecycle policy on S3 to move objects to Glacier after 1 year; cleanup on session delete (not yet implemented).

---

## 4. Domain Model

### 4.1 Smartboard-only tables (only what is *not* already in Savischools/KBot)

| Table | Purpose |
|---|---|
| `SmartboardSession` | One row per teaching session (class+teacher+subject+topic, time window, status). |
| `SmartboardSessionPage` | Ordered pages of a session (source type + source id + version id + JSON page payload + optional snapshot URL). |
| `SmartboardSessionExport` | PDFs / share artifacts produced from a session. |
| `SmartboardAiRequestLog` | Every AI call: prompt, response, model, tokens, cost, school, teacher. |
| `SmartboardSchoolSetting` | Per-school feature flags (smartboard, AI, export, sharing). |

> Schemas are listed in Appendix A.

### 4.2 Page payload (`PageJson`) shape

```jsonc
{
  "pageId": "page-001",
  "sourceType": "KBotContentCard",     // KBotContentCard | KBotQuestion | KBotSolvedCard | BlankBoard | AiGeneratedContent | UploadedPdf | UploadedImage
  "sourceId": 501,
  "sourceVersionId": 3,                 // pinned at insert time
  "background": {
    "kind": "html",                     // html | image | pdf | blank
    // NOTE: 'url' is intentionally absent for KBotContentCard/Question/SolvedCard sources.
    // The full card HTML is never stored in PageJson; it is re-fetched on demand from
    // kbotContentService.render() (IndexedDB cache first, then KBot API).
    // For BlankBoard and uploaded content, 'url' may be present.
    "url": "optional — only for non-KBot backgrounds"
  },
  "viewport": { "width": 1280, "height": 720 }, // logical canvas size; matches KBot card viewport
  "annotations": [
    {
      "id": "ann-1",
      "type": "pen",                    // pen | highlighter | eraser | text | shape
      "tool": { "color": "#000000", "width": 4, "opacity": 1 },
      "points": [x1, y1, x2, y2, ...]  // absolute pixel coords in viewport space
    }
  ],
  "createdAt": "2026-05-14T10:12:33Z",
  "modifiedAt": "2026-05-14T10:12:48Z"
}
```

**KBot background HTML stripping (implemented 17 May 2026):**  
For `KBotContentCard`, `KBotQuestion`, and `KBotSolvedCard` source types, the rendered HTML is **not** embedded in `background.url` inside `PageJson`. The HTML is already stored in KBot's own database and served via `/api/smartboard/kbot/content-cards/{id}/render`. Embedding it was causing 50–200 KB of redundant data per page. The frontend's `useSmartboardSession` hook now:
1. Serialises `PageJson` **without** `background.url` for KBot sources.
2. On load, a re-hydration `useEffect` fetches the card HTML via `kbotContentService.render()` (IndexedDB `cardCache` first → KBot API fallback) and patches it into React state.
3. `WhiteboardCanvas` renders a blank background while the fetch is in-flight — graceful, no flicker for cached cards.

**S3 archival (implemented 17 May 2026):**  
When a session is ended, `PageJson` (annotations) is archived to S3. See §4.3.

### 4.3 Session lifecycle

`InProgress → Ended`

- Sessions are created immediately when the teacher clicks "Start Session".
- Auto-save: debounced 1.5 s after each stroke; `UpsertPageAsync` MERGE on `(SessionId, PageNo)`.
- `Ended` status is set by `POST /sessions/{id}/end`; after marking Ended, the backend archives each page's `PageJson` to S3 (see §3.4) and nulls out the DB column.
- Ended sessions are viewable as read-only canvas (annotations visible, no drawing allowed).
- Sessions can be renamed at any time via `PATCH /sessions/{id}/rename`.
- Sessions can be deleted (cascade-deletes pages from DB; S3 objects are not yet auto-cleaned).

### 4.4 Storage tiers (as of 17 May 2026)

| Data | Storage | Lifecycle |
|---|---|---|
| Session metadata (status, title, dates) | SQL `SmartboardSession` | Permanent |
| Page annotations — InProgress | SQL `SmartboardSessionPage.PageJson` | Hot; written on every auto-save |
| Page annotations — Ended | S3 `savismartboard-sessions` (gzip) | Cold; `PageJson` set to NULL in DB |
| KBot card HTML | Not stored — re-fetched from KBot | TTL via IndexedDB cardCache (7 days) |
| Session exports / PDFs | SQL `SmartboardSessionExport.FileUrl` + blob store | On-demand |

---

## 5. API Surface (Smartboard backend)

All routes are under `/api/smartboard/`. The browser never calls Savischools or KBot directly.

### 5.1 Context (Manohar)
```
GET  /api/smartboard/context                       → current teacher profile + school
GET  /api/smartboard/classes                       → classes assigned to teacher
GET  /api/smartboard/sections?classId=             → sections for a class
GET  /api/smartboard/subjects?classId=             → subjects the teacher teaches
GET  /api/smartboard/topics?subjectId=&classId=    → syllabus topics
POST /api/smartboard/syllabus/topics/{topicId}/mark-taught
```

### 5.2 KBot proxy (Mukesh)
```
GET  /api/smartboard/kbot/topics/{topicId}/content-cards
GET  /api/smartboard/kbot/content-cards/{cardId}
GET  /api/smartboard/kbot/content-cards/{cardId}/versions
GET  /api/smartboard/kbot/content-cards/{cardId}/render?versionId=
GET  /api/smartboard/kbot/topics/{topicId}/questions?difficulty=
GET  /api/smartboard/kbot/questions/{questionId}
GET  /api/smartboard/kbot/questions/{questionId}/basic-explanation
GET  /api/smartboard/kbot/questions/{questionId}/solved-card
```
All responses include `eTag` + `updatedAt` for caching.

### 5.3 Sessions, export, share, AI (Parivesh)
```
POST /api/smartboard/sessions/start
PUT  /api/smartboard/sessions/{sessionId}/save           (idempotent, accepts page diffs)
POST /api/smartboard/sessions/{sessionId}/pages          (append a page)
PUT  /api/smartboard/sessions/{sessionId}/pages/{pageId} (replace page)
GET  /api/smartboard/sessions/{sessionId}
GET  /api/smartboard/sessions/recent
POST /api/smartboard/sessions/{sessionId}/end
POST /api/smartboard/sessions/{sessionId}/export         (pdf)
POST /api/smartboard/sessions/{sessionId}/share          (to student/parent portal)

POST /api/smartboard/ai/explain-differently
POST /api/smartboard/ai/simplify
POST /api/smartboard/ai/local-example
POST /api/smartboard/ai/quick-quiz
POST /api/smartboard/ai/summary
POST /api/smartboard/ai/homework
```

### 5.4 Cross-cutting headers
- `Authorization: Bearer <Savischools-JWT>`
- `X-School-Id` (verified against token, not trusted from client)
- `X-Correlation-Id`
- `If-None-Match` / `ETag` for KBot-proxied responses

---

## 6. Security and Multi-Tenancy

- **Auth:** JWT issued by Savischools, validated via JWKS; no local user accounts.
- **Authorization:** Every query scoped by `SchoolId` + `TeacherId` taken from the token, never from request body. Repository layer rejects rows that don’t match.
- **Class/topic access check:** Before any KBot call, verify the teacher is assigned to the requested class+subject (Savischools).
- **Sharing:** Shared artifacts are signed URLs with expiry; redact AI-generated pages unless `IsAiSharingAllowed` is true for the school.
- **AI safety:** All prompts are templated server-side; user free-text is parameterized, not concatenated. Topic context is passed as RAG ground-truth from KBot.
- **PII:** No student PII in AI prompts.
- **Rate limits:** Per-teacher and per-school; AI endpoints additionally rate-limited and budget-capped.
- **Audit:** `SmartboardAiRequestLog` + structured logs for save/export/share.
- **OWASP:** Input validation, output encoding, signed URLs, CSRF not applicable (bearer auth), strict CORS allow-list, secrets in Key Vault.

---

## 7. Performance Budgets

| Concern | Target |
|---|---|
| Ink-to-screen latency | < 50 ms |
| KBot card open (cached) | < 300 ms |
| KBot card open (cold) | < 1.5 s |
| Auto-save round trip | < 500 ms (diff payload < 64 KB typical) |
| AI response visible to teacher | < 5 s (with “generating…” affordance) |
| Session reopen (50 pages) | < 2 s |

---

## 8. Offline-Ready Design (v2 enabler)

Even though v1 is online-only, the following choices keep offline cheap to add later:

- All session writes are **idempotent and diff-based** (`pageNo` + `revision` via MERGE).
- Page payloads are self-contained JSON (KBot HTML re-fetched separately, not embedded).
- IndexedDB `cardCache` already provides 7-day offline read for KBot card HTML.
- IndexedDB `pages` table + sync queue (`syncService`) are in place; queue is fire-and-forget online.
- `sessionStorage` exclusion list tracks locally-deleted sessions to prevent server refresh from resurrecting them.
- A `hydratingRef` Set guards against duplicate concurrent card-HTML fetches on re-hydration.

---

## 9. Six Milestones (mapped to owners)

| # | Milestone | Primary owner | Supporting | Status |
|---|---|---|---|---|
| M1 | Savischools login + teacher context | **Manohar** | Parivesh (shell) | 🔴 Not started — `[AllowAnonymous]` everywhere; no SSO handoff |
| M2 | KBot content card viewer | **Mukesh** | Parivesh (canvas host) | 🟡 Backend complete; card-as-canvas-background re-hydration implemented |
| M3 | Whiteboard + annotation layer | **Parivesh** | — | ✅ Complete — pen/highlighter/shapes/text/eraser/smart-shape/undo/redo/pages |
| M4 | Question bank + solved card classroom mode | **Mukesh** | Parivesh (board insert) | 🟡 Backend complete; hide/reveal + insert-into-board UI not built |
| M5 | Session save / export / share | **Parivesh** | Manohar (portal share) | 🟡 Session CRUD + auto-save + rename + delete + view-ended working; export + share are stubs |
| M6 | Limited AI assistant + production hardening | **Parivesh** | Manohar + Mukesh (grounding data) | 🔴 Not started — `SmartboardAiService` all stubs, no `AiAssistantPanel` |

Each milestone has its own acceptance criteria — see §11.

---

## 10. Work Distribution Across Three Developers

The split is by **bounded context**, not by layer, so each developer owns frontend + backend + tests for their area. Shared contracts (TypeScript types, OpenAPI schema, page-payload schema) are co-owned and reviewed by all three.

### 10.1 Parivesh — Smartboard Core (the product itself)

**Charter:** Owns the teaching canvas, session lifecycle, export/share, AI orchestration, app shell, infra, and shared contracts.

**Frontend**
- App shell, routing, layout, theming, error boundaries.
- `WhiteboardCanvas`, `WhiteboardToolbar`, `AnnotationLayer`, `PageNavigator`.
- `SmartboardSessionPage`, `TopicTeachingPage`.
- `AiAssistantPanel`.
- Zustand stores for board + session state.
- Client-side page-diff calculation and auto-save scheduler.
- Client PDF fallback.

**Backend**
- `SmartboardSessionController`, `SmartboardAiController`.
- `ISmartboardSessionService`, `ISmartboardAiService`.
- Repositories for `SmartboardSession`, `SmartboardSessionPage`, `SmartboardSessionExport`, `SmartboardAiRequestLog`, `SmartboardSchoolSetting`.
- AI prompt templates + RAG composition (uses card/question text fetched via Mukesh’s service).
- PDF export pipeline + blob storage.
- Background jobs (export render, retention/cleanup).

**Cross-cutting (owned)**
- OpenAPI definition (single contract file).
- Page-payload JSON schema and versioning.
- Auth middleware skeleton (token validation, school/teacher claims).
- Logging, correlation IDs, health endpoints, feature flags.
- CI/CD pipeline, environments, infra-as-code.

**Definition of Done (DoD)**
- All contracts published before dependent work starts.
- Canvas renders and annotates at < 50 ms ink latency on reference smartboard hardware.
- A session can be created, auto-saved, ended, exported as PDF, and reopened with byte-faithful annotations.

---

### 10.2 Manohar — Savischools Integration (identity + curriculum context)

**Charter:** Owns everything that comes from Savischools — auth bridge, teacher dashboard, class/subject/topic selection, syllabus progress writeback, and student/parent share delivery.

**Frontend**
- `TeacherDashboardPage` (today’s classes, recent sessions).
- `ClassSubjectTopicSelector` and sub-selectors.
- “Continue previous session” list.
- Login redirect / token handoff from Savischools.
- “Share with students” dialog (selects audience from Savischools roster).

**Backend**
- `SmartboardContextController`.
- `ISmartboardContextService` + Savischools HTTP client (typed, with retry/circuit breaker).
- JWT validation against Savischools JWKS.
- Authorization helper: “is this teacher allowed to teach this class+subject+topic?”
- `mark-topic-taught` writeback to Savischools syllabus progress (idempotent).
- Share-to-portal integration (delivery + signed URL + ACL).

**Shared data Manohar exposes to others**
- `TeacherContext { schoolId, teacherId, classes[], subjects[], topics[] }`.
- `ClassRoster` for sharing.
- Authorization helpers consumed by Mukesh’s and Parivesh’s controllers.

**DoD**
- Teacher can log in via Savischools, land on the dashboard, and reach a topic in ≤ 4 taps.
- Every Smartboard API call has a verified teacher/school identity from Savischools.
- “Mark topic taught” reflects in Savischools within one minute.
- Share to portal produces a working link viewable by the assigned students/parents only.

---

### 10.3 Mukesh — KBot Integration (content + questions)

**Charter:** Owns the bridge to KBot for content cards (multi-version), questions, basic explanations, and solved cards. Provides a clean, cacheable API for the Smartboard core to render.

**Frontend**
- `ContentCardList`, `ContentCardVersionSelector`, `ContentCardViewer`.
- `QuestionList`, `QuestionViewer`, `SolvedCardViewer`, `AnswerRevealPanel`.
- Difficulty/exam-style filters.
- “Insert into board” actions that produce a Smartboard page payload (handed to Parivesh’s session store).

**Backend**
- `SmartboardKBotContentController`, `SmartboardQuestionController`.
- `IKBotContentService`, `IKBotQuestionService` + typed KBot HTTP clients.
- Card render endpoint: returns sanitized HTML + viewport metadata, suitable for the Smartboard canvas background.
- Caching layer (in-memory + optional Redis) keyed by `(cardId, versionId)` with `eTag`/`updatedAt`.
- Version pinning helper used by Parivesh’s session writes.
- Optional: MathJax/KaTeX rendering pre-pass for math content fidelity.

**Shared data Mukesh exposes**
- `ContentCardSummary`, `ContentCardVersion`, `RenderedCard`.
- `QuestionSummary`, `Question`, `SolvedCard`.
- Stable TypeScript types (in shared package) used by Parivesh’s canvas.

**DoD**
- Topic → cards → version → render works end-to-end with caching and ETag.
- Question hide/reveal and solved-card display work in classroom mode.
- Inserted pages carry pinned `sourceVersionId` so reopened sessions are reproducible even after KBot publishes new versions.

---

### 10.4 Shared / Co-owned artifacts

| Artifact | Owner | Reviewers |
|---|---|---|
| OpenAPI spec | Parivesh | Manohar, Mukesh |
| Page-payload JSON schema | Parivesh | Manohar, Mukesh |
| Shared TS types package (`@savi/smartboard-types`) | Parivesh | Manohar, Mukesh |
| Auth middleware | Manohar | Parivesh |
| Caching conventions for upstream proxies | Mukesh | Parivesh |
| Feature-flag matrix | Parivesh | Manohar, Mukesh |
| Telemetry event catalog | Parivesh | Manohar, Mukesh |

---

## 11. Acceptance Criteria per Milestone

**M1 — Savischools login + context (Manohar)**  
Teacher logs in via Savischools, lands on dashboard, selects class → subject → topic; selection is persisted and visible across reload.

**M2 — KBot content card viewer (Mukesh)**  
For a selected topic the teacher sees all available cards and versions, can preview, and open one full-screen on the smartboard.

**M3 — Whiteboard + annotations (Parivesh)**  
Teacher can draw with pen/highlighter/eraser, add text/shapes, add blank pages, navigate pages, zoom/pan; ink latency < 50 ms.

**M4 — Question + solved card mode (Mukesh)**  
Teacher can list questions for a topic, display question only, hide/reveal answer, open solved card, insert into board, annotate.

**M5 — Session save/export/share (Parivesh)**  
Auto-save every 30 s; manual save anytime; reopen yesterday’s session; export PDF; share to Savischools student/parent portal; mark topic taught.

**M6 — Limited AI + production readiness (Parivesh)**  
“Explain differently / simplify / local example / quick quiz / summary / homework” buttons grounded on current card/question; AI usage logged and budget-capped per school; admin can toggle AI per school.

---

## 12. Sequencing and Dependencies

```
Week-line view (relative, not calendar):

Phase A  ── M1 (Manohar)  ┐
                          ├──► M3 (Parivesh)  ──► M5 (Parivesh)
Phase A  ── M2 (Mukesh)   ┘                          │
                                                     ▼
Phase B  ── M4 (Mukesh) ◄── shared canvas API ───────┤
                                                     ▼
Phase C  ── M6 (Parivesh, with M/M for grounding data)
```

- M1 and M2 can start in parallel as soon as the shared TS types and OpenAPI contracts are published by Parivesh.
- M3 needs the card render contract from M2 to host the background.
- M4 needs the canvas “insert page” API from M3.
- M5 depends on M3 (page model) and M1 (share-to-portal).
- M6 depends on M5 (session context) and on M2/M4 for grounding text.

---

## 13. Testing Strategy

- **Unit tests** per service (xUnit / Vitest).
- **Contract tests** for upstream Savischools and KBot clients (Pact or recorded HTTP fixtures).
- **Integration tests** for session save/export pipeline.
- **E2E** with Playwright on a reference “teach a class” script.
- **Performance smoke** for ink latency and auto-save payload size.
- **Security checks** in CI: dependency scan, OWASP ZAP baseline, secret scan.

Each developer owns the tests for their area; Parivesh owns the E2E suite.

---

## 14. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| KBot card HTML inconsistent across topics | Annotation misalignment | Render contract pins viewport; normalized coords |
| Savischools auth changes | Whole app blocked | Thin auth adapter, contract test, JWKS auto-refresh |
| Large ink payloads on long classes | Save latency, DB bloat | Diff-based saves, snapshot every N pages, background compaction |
| AI cost overrun | Budget pain | Per-school cap, request log, model fallback, cached prompts |
| Smartboard hardware variance | UX regressions | Reference device list, performance budgets, pilot rollout |
| Sharing leaks AI-generated content | Curriculum risk | Per-school flag, redact AI pages unless allowed, watermark |

---

## 15. Rollout

1. **Internal pilot** — 1 school, 2 teachers, 2 weeks.
2. **Limited beta** — 5 schools, AI off by default.
3. **General availability** — feature-flagged per school; AI enabled on opt-in.

Telemetry: session counts, ink latency p95, auto-save failures, AI calls/cost per school, share usage, export usage.

---

## 16. Implementation Status (updated 17 May 2026)

### 16.0 Recent changes (17 May 2026 session)

#### Canvas tools
| Change | Detail |
|---|---|
| **Smart Shape (✦)** | Freehand strokes auto-converted to geometry on mouse-up. Douglas-Peucker simplification → corner count → triangle / rectangle / circle / line. Triangle: polygon + 3 side labels (normalised, longest = 10.0) + 3 blue angle labels. Rectangle: rect + width/height labels. Falls back to pen stroke if unrecognised. |
| **Circle tool fixed** | Konva `<Circle>` replaced with `<Ellipse>` for both live preview and committed shapes (Circle only has `radius`, Ellipse has `radiusX`/`radiusY`). |
| **Arrow preview direction** | Added `previewEnd: {x,y} \| null` state tracking actual cursor position. Preview and commit now share the same endpoint — previously the preview always pointed right regardless of drag direction. |

#### Session management UI
| Change | Detail |
|---|---|
| **Delete always removes row** | `setRecentSessions` filter moved to `finally` block — previously swallowed in `catch` so the row stayed visible on API error. |
| **Deleted sessions don't reappear** | `sessionStorage` exclusion list (`sb_deleted_sessions`) applied to both server-fetch and local-DB results. Component remounts (navigate away + back) no longer resurrect deleted sessions. |
| **Ended sessions open as read-only canvas** | `readOnly = status === 'ended'`; `effectiveTool` forced to `select`; `CanvasToolbar` shows amber "View Only" badge and hides all drawing controls. |
| **Rename session** | Inline edit in dashboard row: click ✏️ → title becomes `<input>`; Enter/blur → save; Escape → cancel. Backend: `PATCH /api/smartboard/sessions/{id}/rename` with `{ title }`. Saved to server + IndexedDB + local list state. |

#### Storage optimisation
| Change | Detail |
|---|---|
| **Strip KBot HTML from PageJson** | `serialise()` omits `background.url` for `KBotContentCard`, `KBotQuestion`, `KBotSolvedCard`. Saves 50–200 KB per page. Re-hydration effect in `useSmartboardSession` fetches HTML on load (IndexedDB cache first). DB migration `002` strips existing rows. |
| **S3 archival on session end** | Bucket `savismartboard-sessions` (ap-south-1, private). On `EndAsync`: mark Ended → gzip each page's `PageJson` → `PutObject` → `UPDATE SET PageJsonUrl=key, PageJson=NULL`. `GetAsync` re-hydrates from S3 for ended sessions. EC2 IAM role granted access. DB migration `003` adds `PageJsonUrl NVARCHAR(1000) NULL` and makes `PageJson` nullable. |

---

### 16.1 Infrastructure
| Item | Status | Notes |
|---|---|---|
| EC2 (ap-south-1, `13.205.70.12`) | ✅ Running | Amazon Linux 2023, systemd service `smartboard-api` |
| RDS SQL Server (`savismartboard` DB) | ✅ Running | Migrations 001, 002, 003 applied |
| S3 bucket `savismartboard-sessions` | ✅ Created | ap-south-1, private; EC2 IAM role has PutObject/GetObject/DeleteObject |
| GitHub Actions CI/CD | ✅ Auto-deploy on push to `main` | Latest deploy: commit `f3aa90a` |
| Health endpoint `/healthz` | ✅ Returns `Healthy` | |
| `sqlcmd` on EC2 | ✅ Installed | mssql-tools18 via Microsoft RHEL9 repo; used for DB migrations |

### 16.2 Backend services
| Service | Status | Notes |
|---|---|---|
| `KBotCurriculumService` | ✅ Implemented | boards / grades / subjects / chapters / topics / rag-snippets |
| `KBotContentService` | ✅ Implemented | topic cards (L0–L6), versions, render |
| `KBotQuestionService` | ✅ Implemented | list / detail / explanation / solved-card / submit |
| `SmartboardContextService` | 🟡 KBot proxy | Returns KBot data as placeholder; must be replaced with real Savischools data when M1 is done |
| `SmartboardSessionService` | 🟡 Partial | Create / get / recent / save-page / end / rename / delete working; S3 archival on end implemented; export + share return placeholder URLs |
| `SmartboardAiService` | 🔴 Stub | All 6 methods return `[kind] {instruction}` |
| `S3PageArchiveService` | ✅ Implemented | `ArchivePageAsync` (gzip + PutObject), `RestorePageAsync` (GetObject + gunzip); registered as singleton; uses EC2 IAM role automatically |

### 16.3 Backend controllers — auth
| Controller | Auth | Notes |
|---|---|---|
| `SmartboardContextController` | `[AllowAnonymous]` | Temporary until Manohar wires SSO |
| `SmartboardKBotCurriculumController` | `[AllowAnonymous]` | Temporary |
| `SmartboardKBotContentController` | `[AllowAnonymous]` | Temporary |
| `SmartboardQuestionController` | `[AllowAnonymous]` | Temporary |
| `SmartboardSessionController` | `[AllowAnonymous]` | Temporary |
| `SmartboardAiController` | `[Authorize]` | (not yet called by frontend) |

⚠️ All `[AllowAnonymous]` annotations must be replaced with `[Authorize]` once M1 (Savischools SSO) is complete.

### 16.4 Frontend pages
| Page | Status | Notes |
|---|---|---|
| `TeacherDashboardPage` | ✅ Working | Class → Subject → Topic picker, recent sessions, blank board start, inline rename (✏️), delete with exclusion list, view ended sessions |
| `TopicTeachingPage` | 🟡 Partial | Card list + question list + preview render; no question hide/reveal or insert-into-board from question panel |
| `SmartboardSessionPage` | 🟡 Partial | Canvas + toolbar + undo/redo + page strip + KBot card background re-hydration + read-only view for ended sessions; no AI panel |

### 16.5 Frontend components
| Component | Status | Notes |
|---|---|---|
| `WhiteboardCanvas` | ✅ Complete | Pen, highlighter, rect, circle (Ellipse), arrow, text, eraser (destination-out), smart-shape auto-detect, undo, redo; KBot card HTML background rendered via `dangerouslySetInnerHTML` |
| `CanvasToolbar` | ✅ Complete | Tool picker, colour, stroke width, undo/redo/clear, end session; `readOnly` prop shows amber "View Only" badge and hides drawing controls; ✦ smart-shape button |
| `PageStrip` | ✅ Complete | Thumbnail strip, add/delete pages |
| `OfflineIndicator` | ✅ Complete | Pending sync badge |
| `shapeDetector.ts` | ✅ Complete | `tryConvertToShape()` — Douglas-Peucker simplification, corner detection, triangle/rect/circle/line classification, measurement labels |
| `AiAssistantPanel` | 🔴 Not built | M6 |
| `QuestionViewer` / `SolvedCardViewer` | 🔴 Not built | M4 classroom mode UI |

### 16.6 Known issues to fix before production
1. Replace all `[AllowAnonymous]` with `[Authorize]` after M1 SSO is done.
2. `SmartboardContextService` — swap KBot proxy for real Savischools class/subject/topic data.
3. M4 classroom mode — question hide/reveal UI + insert solved card into board.
4. M5 export — PDF generation pipeline (server-side preferred; `pdf-lib` client fallback).
5. AI Assist Panel — plug in real AI provider; `SmartboardAiService.AskSelectionAsync` currently stubs response.

---

## 17. AI Assist Panel (Dual Board Feature)

> Added: 17 May 2026. Status: frontend + API shape implemented; AI is stubbed.

### 17.1 Layout

The session page uses a **70/30 horizontal split**:

```
┌──────────────────────────────────┬─────────────────────┐
│                                  │   AI Assist Panel   │
│   WhiteboardCanvas (70%)         │   4 tabs (30%)      │
│                                  │                     │
├──────────────────────────────────┤                     │
│   PageStrip                      │                     │
├──────────────────────────────────┤                     │
│   CanvasToolbar                  │                     │
└──────────────────────────────────┴─────────────────────┘
```

### 17.2 Interaction flow

1. Teacher draws on the left canvas
2. Teacher selects the **Lasso** tool (⭕) from the toolbar
3. Teacher draws a freehand lasso around the relevant content
4. A dashed bounding-box rectangle appears over the selection
5. An **"Ask AI ✨"** floating button appears below the selection on the canvas
6. Teacher taps "Ask AI ✨"
7. The selected region is captured as a JPEG image (Konva `stage.toDataURL` with clip rect)
8. The image is sent to `POST /api/smartboard/ai/ask-selection` with an `instruction` field per tab
9. Right panel activates; tabs load lazily on first view

### 17.3 Right panel tabs

| Tab | Instruction sent to AI | Shows |
|---|---|---|
| Solution | `"solution"` | Step-by-step worked answer |
| Explain | `"explain"` | Alternative explanation / simplification |
| Mistakes | `"mistakes"` | Common student errors for this content |
| Quiz | `"quiz"` | A quick question to pose to the class |

### 17.4 API — ask-selection endpoint

```
POST /api/smartboard/ai/ask-selection
Body: { imageBase64: string, instruction: string, sessionId?: number }
Response: { result: string, tokenCount: number, costUsd: number }
```

The image is a JPEG data URL (`data:image/jpeg;base64,...`) of the circled region of the canvas. The backend strips the prefix before passing to the AI provider.

### 17.5 Frontend components

| Component | File | Purpose |
|---|---|---|
| `AiAssistPanel` | `components/canvas/AiAssistPanel.tsx` | Tabbed right panel; manages per-tab fetch lifecycle |
| Lasso tool | `WhiteboardCanvas.tsx` | Freehand selection → bbox → floating "Ask AI ✨" button → `onAiCapture(dataUrl)` |
| `aiService.askSelection` | `services/aiService.ts` | `POST /api/smartboard/ai/ask-selection` wrapper |

### 17.6 Backend

| Layer | File | Change |
|---|---|---|
| DTO | `SessionDtos.cs` | Added `AiSelectionRequest(string ImageBase64, string Instruction, long? SessionId)` |
| Interface + stub | `SmartboardAiService.cs` | Added `AskSelectionAsync`; stub returns placeholder |
| Controller | `SmartboardAiController.cs` | Added `POST ask-selection`; changed to `[AllowAnonymous]` (temporary, same as all other controllers) |

### 17.7 Limitations (current stub phase)
- AI response is a stub: `[ask-selection] {instruction}` — no real AI call made
- Image is captured from the Konva canvas only (annotations layer); KBot HTML background is a separate DOM element and is **not** included in the capture. This means if the teacher circles a KBot card background, only their annotations over it are captured.  Future: use `html2canvas` or a server-side screen capture to include the full visible area.
- Image size is not compressed before sending; very large selections (full canvas) may produce large payloads. TODO: cap at 800×600 px client-side before encoding.
5. M5 share — signed URL delivery to Savischools student/parent portal.
6. M6 AI service — implement grounded prompt templates, RAG from KBot snippets, cost logging, per-school budget cap.
7. S3 cleanup on session delete — `DeleteSessionAsync` currently only removes SQL rows; S3 objects for deleted sessions are not yet purged.

---

## Appendix A — Smartboard Database Schemas (reference)

> All tables include `SchoolId` for tenant isolation.

**Current live schema (migrations 001–003 applied):**

- `SmartboardSession (SessionId PK, SchoolId, TeacherId, ClassId, SectionId, SubjectId, TopicId, SessionTitle, SessionDate, StartedAt, EndedAt, Status, CreatedOn)`
- `SmartboardSessionPage (SessionPageId PK, SessionId FK, PageNo, PageType, SourceType, SourceId, SourceVersionId, PageJson NVARCHAR(MAX) NULL, PageJsonUrl NVARCHAR(1000) NULL, SnapshotUrl, Revision, CreatedOn, ModifiedOn)`
  - `PageJson` is NULL for ended-session pages (blob moved to S3, key in `PageJsonUrl`)
  - `PageJsonUrl` format: `sessions/{sessionId}/page-{pageNo}.json` (gzip-compressed object in `savismartboard-sessions` S3 bucket)
- `SmartboardSessionExport (ExportId, SessionId, ExportType, FileUrl, CreatedOn, CreatedByUserId)`
- `SmartboardAiRequestLog (AiRequestLogId, SchoolId, TeacherId, TopicId, SessionId, RequestType, SourceType, SourceId, PromptText, ResponseText, Provider, ModelName, TokenCount, CostMicroUsd, CreatedOn)`
- `SmartboardSchoolSetting (SettingId, SchoolId, IsSmartboardEnabled, IsAiEnabled, AllowExport, AllowStudentSharing, IsAiSharingAllowed, AiMonthlyBudgetUsd, CreatedOn, ModifiedOn)`

**DB migrations:**

| File | Applied | Description |
|---|---|---|
| `001_create_smartboard_schema.sql` | ✅ | Creates all 5 tables, PKs, indexes |
| `002_strip_kbot_background_html.sql` | ✅ | `JSON_MODIFY` removes `background.url` from existing KBot-sourced `PageJson` rows (idempotent) |
| `003_add_pagejsonurl.sql` | ✅ | Adds `PageJsonUrl NVARCHAR(1000) NULL`; makes `PageJson` nullable |

---

## Appendix B — Module Map (folder layout)

```
frontend/
  src/
    app/                      # shell, routing, providers           (Parivesh)
    pages/
      TeacherDashboardPage.tsx                                       (Manohar)
      TopicTeachingPage.tsx                                          (Parivesh)
      SmartboardSessionPage.tsx                                      (Parivesh)
    components/
      context/ClassSubjectTopicSelector.tsx                          (Manohar)
      kbot/ContentCardList.tsx                                       (Mukesh)
      kbot/ContentCardViewer.tsx                                     (Mukesh)
      kbot/ContentCardVersionSelector.tsx                            (Mukesh)
      questions/QuestionList.tsx                                     (Mukesh)
      questions/QuestionViewer.tsx                                   (Mukesh)
      questions/SolvedCardViewer.tsx                                 (Mukesh)
      questions/AnswerRevealPanel.tsx                                (Mukesh)
      whiteboard/WhiteboardCanvas.tsx                                (Parivesh)
      whiteboard/WhiteboardToolbar.tsx                               (Parivesh)
      whiteboard/AnnotationLayer.tsx                                 (Parivesh)
      whiteboard/PageNavigator.tsx                                   (Parivesh)
      ai/AiAssistantPanel.tsx                                        (Parivesh)
      sharing/ShareToPortalDialog.tsx                                (Manohar)
    services/
      savischoolsContextService.ts                                   (Manohar)
      kbotContentService.ts                                          (Mukesh)
      kbotQuestionService.ts                                         (Mukesh)
      smartboardSessionService.ts                                    (Parivesh)
      aiService.ts                                                   (Parivesh)
    types/                    # shared types (co-owned)              (Parivesh lead)

backend/
  Smartboard.Api/
    Controllers/
      SmartboardContextController.cs                                 (Manohar)
      SmartboardKBotContentController.cs                             (Mukesh)
      SmartboardQuestionController.cs                                (Mukesh)
      SmartboardSessionController.cs                                 (Parivesh)
      SmartboardAiController.cs                                      (Parivesh)
    Services/
      ISmartboardContextService.cs / Impl                            (Manohar)
      IKBotContentService.cs / Impl                                  (Mukesh)
      IKBotQuestionService.cs / Impl                                 (Mukesh)
      ISmartboardSessionService.cs / Impl                            (Parivesh)
      ISmartboardAiService.cs / Impl                                 (Parivesh)
    Repositories/
      SmartboardSessionRepository.cs                                 (Parivesh)
      SmartboardUsageLogRepository.cs                                (Parivesh)
    Auth/                                                            (Manohar)
    Infrastructure/                                                  (Parivesh)
```

---

## Appendix C — Open Questions to Resolve Before Coding

1. Exact Savischools auth flow (OIDC vs JWT handoff) and token lifetime.
2. KBot card render contract: sanitized HTML, JSON blocks, or both?
3. Student/parent portal share API: payload, ACL model, expiry policy.
4. Math/diagram rendering library standard (KaTeX vs MathJax).
5. AI provider choice and per-school monthly budget defaults.
6. Retention period for sessions, exports, AI logs.
7. Reference smartboard hardware/browser baseline for QA.
