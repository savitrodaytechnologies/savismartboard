# Savischools Smartboard — Detailed Design Document

> Version: 1.5  
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
For `KBotContentCard`, `KBotQuestion`, and `KBotSolvedCard` source types, the rendered HTML is **not** embedded in `background.url` inside `PageJson`. The HTML is already stored in KBot's own database and served via `/api/v1/smartboard/kbot/content-cards/{id}/render`. Embedding it was causing 50–200 KB of redundant data per page. The frontend's `useSmartboardSession` hook now:
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

All versioned routes are under `/api/v1/smartboard/`. The browser never calls Savischools or KBot directly.

> **Versioning policy:** All Smartboard routes carry a `/v1/` prefix from v1.4 onwards. The `api/dev` endpoint is excluded from versioning (dev-only, never called by production clients). The Vite dev proxy matches `/api` (prefix), so both `/api/v1/...` and `/api/dev/...` are proxied without config changes. Android and future native clients target `/api/v1/` directly.

### 5.1 Context (Manohar)
```
GET  /api/v1/smartboard/context                       → current teacher profile + school
GET  /api/v1/smartboard/classes                       → classes assigned to teacher
GET  /api/v1/smartboard/sections?classId=             → sections for a class
GET  /api/v1/smartboard/subjects?classId=             → subjects the teacher teaches
GET  /api/v1/smartboard/topics?subjectId=&classId=    → syllabus topics
POST /api/v1/smartboard/syllabus/topics/{topicId}/mark-taught
```

### 5.2 KBot proxy (Mukesh)
```
GET  /api/v1/smartboard/kbot/topics/{topicId}/content-cards
GET  /api/v1/smartboard/kbot/content-cards/{cardId}
GET  /api/v1/smartboard/kbot/content-cards/{cardId}/versions
GET  /api/v1/smartboard/kbot/content-cards/{cardId}/render?versionId=
GET  /api/v1/smartboard/kbot/topics/{topicId}/questions?difficulty=
GET  /api/v1/smartboard/kbot/questions/{questionId}
GET  /api/v1/smartboard/kbot/questions/{questionId}/basic-explanation
GET  /api/v1/smartboard/kbot/questions/{questionId}/solved-card
```
All responses include `eTag` + `updatedAt` for caching.

### 5.3 Sessions, export, share, AI (Parivesh)
```
POST /api/v1/smartboard/sessions/start
PUT  /api/v1/smartboard/sessions/{sessionId}/save           (idempotent, accepts page diffs)
POST /api/v1/smartboard/sessions/{sessionId}/pages          (append a page)
PUT  /api/v1/smartboard/sessions/{sessionId}/pages/{pageId} (replace page)
GET  /api/v1/smartboard/sessions/{sessionId}
GET  /api/v1/smartboard/sessions/recent
POST /api/v1/smartboard/sessions/{sessionId}/end
POST /api/v1/smartboard/sessions/{sessionId}/export         (pdf)
POST /api/v1/smartboard/sessions/{sessionId}/share          (to student/parent portal)

POST /api/v1/smartboard/ai/explain-differently
POST /api/v1/smartboard/ai/simplify
POST /api/v1/smartboard/ai/local-example
POST /api/v1/smartboard/ai/quick-quiz
POST /api/v1/smartboard/ai/summary
POST /api/v1/smartboard/ai/homework
POST /api/v1/smartboard/ai/ask-selection
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

#### Database connection — AWS RDS
| Change | Detail |
|---|---|
| **RDS `smartuser` credential** | Default `appsettings.json` pointed to `localhost` SQL Server. `appsettings.Local.json` (gitignored) overrides `ConnectionStrings.Smartboard` to target `rdsexpserver.ccmuwbvpbelg.ap-south-1.rds.amazonaws.com`, DB=`savismartboard`, User=`smartuser`. |
| **`create_app_user.sql`** | `db/scripts/create_app_user.sql` creates the `smartuser` login + DB user idempotently and grants `db_datareader` + `db_datawriter` on `savismartboard`. Run once against RDS before first deploy. |

#### Tablet / touch compatibility
| Change | Detail |
|---|---|
| **iPad Safari drawing fix** | React synthetic `onTouchMove` handlers are passive by default — `e.preventDefault()` was silently ignored, causing iOS to scroll the page instead of drawing. Fix: `useEffect` attaches non-passive native `touchstart`/`touchmove` listeners directly on the canvas container (skipping `button`/`textarea`/`input` targets). Body `overflow: hidden` + `touchAction: none` set on mount. |
| **Android scrollbar pointer capture** | Scrollbar thumb drag handlers changed from `onMouseDown` to `onPointerDown` with `(e.target as HTMLElement).setPointerCapture(e.pointerId)`. Fixes drag release on Android tablets where `mousedown` events are not fired for touch. |

#### API versioning
| Change | Detail |
|---|---|
| **`/v1/` prefix added to all routes** | All 6 non-dev controllers updated: `[Route("api/smartboard/...")]` → `[Route("api/v1/smartboard/...")]`. `DevController` keeps `api/dev` (dev-only, excluded from public API contract). |
| **Frontend `apiClient` base URL** | `baseURL: '/api'` → `'/api/v1'` in `apiClient.ts`. All 20+ service calls pick up the new prefix automatically. `devAuth.ts` uses raw `fetch('/api/dev/token')` and is unaffected. |
| **Vite proxy unchanged** | Proxy pattern is `/api` (prefix match) — covers both `/api/dev/...` and `/api/v1/...` with no config change. |

#### Production AI key injection fix
| Change | Detail |
|---|---|
| **Root cause** | `appsettings.Production.json` has provider config but no `ApiKey` values. `deploy.sh` only wrote `ConnectionStrings__Smartboard` to `/opt/smartboard/env`. Both AI providers had empty keys on the EC2 → Anthropic/DeepSeek rejected calls with 401 → frontend showed "Could not get a response." |
| **`deploy.sh`** | Updated to accept `SMARTBOARD_AI_TEXT_KEY` and `SMARTBOARD_AI_VISION_KEY` env vars and write them to `/opt/smartboard/env` as `Ai__Providers__deepseek__ApiKey` and `Ai__Providers__copilot__ApiKey` / `Ai__Providers__anthropic__ApiKey`. Keys are skipped (not written) if the env var is not set — backwards-compatible. |
| **`deploy.yml`** | Updated to read `SMARTBOARD_AI_TEXT_KEY` and `SMARTBOARD_AI_VISION_KEY` from GitHub Actions secrets and pass them through to `deploy.sh`. |
| **GitHub secrets required** | Two new secrets must be added in repo Settings → Secrets → Actions: `SMARTBOARD_AI_TEXT_KEY` (DeepSeek key) and `SMARTBOARD_AI_VISION_KEY` (Anthropic key). See §16.1 for full secrets list. |
| **Immediate EC2 fix** | Run on EC2 to apply without waiting for a deploy: `sudo tee -a /opt/smartboard/env <<'EOF'` then add the two `Ai__Providers__*__ApiKey` lines, then `sudo systemctl restart smartboard-api`. |

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

**Required GitHub Actions secrets** (repo Settings → Secrets → Actions):

| Secret | Purpose |
|---|---|
| `EC2_HOST` | EC2 public IP — `13.205.70.12` |
| `EC2_SSH_KEY` | Contents of `saviknowledgebot.pem` |
| `SMARTBOARD_DB_CONNSTR` | Full ADO.NET connection string (includes password) |
| `SMARTBOARD_AI_TEXT_KEY` | DeepSeek API key (`sk-...`) — used for all text-only AI prompts |
| `SMARTBOARD_AI_VISION_KEY` | Anthropic API key (`sk-ant-...`) — used for lasso vision + Claude text fallback |

**`/opt/smartboard/env` format on EC2** (written by `deploy.sh`, read by systemd `EnvironmentFile=`):
```
ConnectionStrings__Smartboard=Server=...;Database=savismartboard;...
Ai__Providers__deepseek__ApiKey=sk-...
Ai__Providers__copilot__ApiKey=sk-ant-...
Ai__Providers__anthropic__ApiKey=sk-ant-...
```

### 16.2 Backend services
| Service | Status | Notes |
|---|---|---|
| `KBotCurriculumService` | ✅ Implemented | boards / grades / subjects / chapters / topics / rag-snippets |
| `KBotContentService` | ✅ Implemented | topic cards (L0–L6), versions, render |
| `KBotQuestionService` | ✅ Implemented | list / detail / explanation / solved-card / submit |
| `SmartboardContextService` | 🟡 KBot proxy | Returns KBot data as placeholder; must be replaced with real Savischools data when M1 is done |
| `SmartboardSessionService` | 🟡 Partial | Create / get / recent / save-page / end / rename / delete working; S3 archival on end implemented; export + share return placeholder URLs |
| `SmartboardAiService` | ✅ Implemented | `AskSelectionAsync` (vision + text via `HybridAiClient`), all 6 text prompts (`ExplainDifferently`, `Simplify`, `LocalExample`, `QuickQuiz`, `Summary`, `Homework`) — real AI calls via DeepSeek (text) and Anthropic Claude (vision) |
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
POST /api/v1/smartboard/ai/ask-selection
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

### 17.8 Prompt Template System

> Added: 21 May 2026.

All AI prompts are stored as **plain text files** under `backend/Smartboard.Api/Prompts/`. To change what the AI says, edit the `.txt` file directly — no C# changes needed.

#### Files

| File | Purpose |
|---|---|
| `AiPromptGlobal.txt` | Global system prompt injected into **every** AI call. Sets persona (CBSE K-12 assistant), markdown formatting rules, and Unicode math notation convention. |
| `SelectionTab_solution.txt` | Task instruction for the **Solution** lasso tab |
| `SelectionTab_explain.txt` | Task instruction for the **Explain** lasso tab |
| `SelectionTab_mistakes.txt` | Task instruction for the **Mistakes** lasso tab |
| `SelectionTab_quiz.txt` | Task instruction for the **Quiz** lasso tab |

#### How it works

The `.txt` files are declared as **EmbeddedResource** in `Smartboard.Api.csproj`:

```xml
<ItemGroup>
  <EmbeddedResource Include="Prompts\*.txt" />
</ItemGroup>
```

`AiPromptTemplates.cs` loads them at startup via `Assembly.GetManifestResourceStream`. The resource name follows the convention `Smartboard.Api.Prompts.<filename>`.

`SmartboardAiService` references `AiPromptTemplates.AiPromptGlobal` (system prompt) and `AiPromptTemplates.SelectionTabPrompt(tab)` (per-tab task instruction). There are no hardcoded prompt strings in any service class.

#### To add a new tab

1. Create `Prompts/SelectionTab_<name>.txt` with the instruction text.
2. Add `["<name>"] = Load("SelectionTab_<name>.txt")` to the dictionary in `AiPromptTemplates.cs`.
3. Rebuild — the file is embedded automatically by the wildcard glob.

5. M5 share — signed URL delivery to Savischools student/parent portal.
6. M6 AI service — implement grounded prompt templates, RAG from KBot snippets, cost logging, per-school budget cap.
7. S3 cleanup on session delete — `DeleteSessionAsync` currently only removes SQL rows; S3 objects for deleted sessions are not yet purged.

---

## 18. Shared EC2 Infrastructure

> Added: 18 May 2026. Describes the actual production state where **KBot** and **Savismartboard** share a single EC2 instance.

### 18.1 Overview

Both apps run on **one EC2 instance** (`i-0d678aebfb32f889e`, `13.205.70.12`, `ap-south-1`).  
This was a deliberate cost-saving decision during the pilot phase. The two apps use different process managers and are isolated at the port and memory level.

| App | Domain | Process manager | Language / Runtime |
|---|---|---|---|
| KBot | `kbot.svais.net` | Docker Compose | Python (FastAPI) + Node.js (Next.js) + Qdrant |
| Savismartboard | `teach.svais.net` | systemd | ASP.NET Core 8 / .NET 8 (Kestrel) |

---

### 18.2 Port Map (verified 18 May 2026 via `ss -tlnp`)

| Port | Process | Purpose |
|---|---|---|
| `80` | docker-proxy (`saviknowledgebot-nginx-1`) | HTTP → HTTPS redirect for both domains |
| `443` | docker-proxy (`saviknowledgebot-nginx-1`) | HTTPS gateway for both domains |
| `5000` | dotnet (`smartboard-api`) | Smartboard API + SPA static files (Kestrel) |
| `3000` | docker-proxy | KBot Next.js frontend |
| `8000` | docker-proxy | KBot FastAPI backend |
| `6333-6334` | Docker internal only | Qdrant vector DB (not exposed on host) |

---

### 18.3 nginx Architecture

**There is one active nginx — the KBot Docker container `saviknowledgebot-nginx-1`.**  
It holds ports 80 and 443 and routes for *both* domains.

```
Internet
  │
  ├─ :80  ─► saviknowledgebot-nginx-1 (Docker)
  │              └─ redirect to HTTPS (both domains)
  │
  └─ :443 ─► saviknowledgebot-nginx-1 (Docker)
               ├─ server_name kbot.svais.net
               │    ├─ /api, /health, /docs  ──► backend:8000  (Docker DNS)
               │    └─ /                     ──► frontend:3000 (Docker DNS)
               │
               └─ server_name teach.svais.net
                    └─ /  (everything) ─────────► http://172.18.0.1:5000
                                                  (Docker bridge gateway → host Kestrel)
```

**Key implementation detail:**  
`172.18.0.1` is the standard Docker bridge gateway IP — the address the Docker nginx container uses to reach services running directly on the EC2 host. The Smartboard Kestrel process listening on `0.0.0.0:5000` is reachable at that address from inside any Docker container on the default bridge network.

**Kestrel serves both the API and the React SPA:**  
`Program.cs` uses `app.UseDefaultFiles()` + `app.UseStaticFiles()` + `app.MapFallbackToFile("index.html")`.  
At build time (GitHub Actions), the React `dist/` output is embedded into the .NET publish output under `wwwroot/`, packaged in `api.tar.gz`, and deployed to `/opt/smartboard/api/wwwroot/`.  
`/opt/smartboard/www/` is a reference copy only (kept for historical reasons by `deploy.sh`).

**Host system nginx:** The system `nginx` package is installed (by `install.sh`) and there is a `smartboard.conf` in `/etc/nginx/conf.d/`, but the service is **inactive/failed** because Docker took ports 80 and 443 first. The host nginx plays no part in live traffic.

---

### 18.4 nginx Config — Where It Lives and Who Owns It

The shared nginx config file is:
```
/opt/saviknowledgebot/deploy/nginx.conf   (on EC2)
                     ↕ bind-mounted into Docker as
/etc/nginx/conf.d/default.conf            (inside saviknowledgebot-nginx-1)
```

**This file is owned by the KBot project** (`saviknowledgebot` repo).  
The `teach.svais.net` server blocks were **manually added directly on the EC2** — they are **not** currently committed in the `saviknowledgebot` git repository.

The actual live `teach.svais.net` HTTPS block (as of 18 May 2026):
```nginx
server {
    listen 443 ssl;
    server_name teach.svais.net;

    ssl_certificate     /etc/letsencrypt/live/teach.svais.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/teach.svais.net/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    location / {
        proxy_pass         http://172.18.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

---

### 18.5 SSL Certificates

Both domains have separate Let's Encrypt certificates on the EC2:
```
/etc/letsencrypt/live/kbot.svais.net/
/etc/letsencrypt/live/teach.svais.net/
```

Both are bind-mounted read-only into the Docker nginx container (`/etc/letsencrypt:/etc/letsencrypt:ro`).

**Renewal:** Certbot must use **webroot mode** (not `--nginx` mode and not standalone) because:
- The KBot Docker nginx already occupies port 80/443
- There is a `/.well-known/acme-challenge/` block in the nginx config pointing to `/var/www/certbot` (which is the Docker volume `saviknowledgebot_certbot_webroot`)
- After renewal, run `docker exec saviknowledgebot-nginx-1 nginx -s reload` to pick up the new certs

---

### 18.6 Deploy Interaction Between the Two Apps

**Smartboard deploy (GitHub Actions → `deploy.sh`):**
1. Rewrites `/opt/smartboard/env` with secrets
2. Stops `smartboard-api` (systemd)
3. Extracts `api.tar.gz` to `/opt/smartboard/api/` (includes `wwwroot/` with React SPA)
4. Extracts `www.tar.gz` to `/opt/smartboard/www/` (reference copy, unused by Kestrel)
5. Starts `smartboard-api` (systemd)
6. Reloads Docker nginx: `docker exec saviknowledgebot-nginx-1 nginx -s reload`

**Dependency:** Step 6 of Smartboard's deploy depends on KBot's Docker nginx container being alive.  
If `saviknowledgebot-nginx-1` is not running, the reload silently skips (guarded by `&& … || true`).

**KBot deploy (`docker compose up --profile production -d`):**
- Recreates the nginx container from the base image — but the config is a bind-mount so changes in `/opt/saviknowledgebot/deploy/nginx.conf` are immediately picked up
- Does NOT affect the Smartboard systemd service directly
- However, during the few seconds the nginx container is recreating, both `kbot.svais.net` AND `teach.svais.net` are unreachable

---

### 18.7 Resource Isolation

| Resource | KBot | Smartboard |
|---|---|---|
| Memory | No Docker `--memory` limit set | `MemoryMax=800M` (systemd) |
| CPU | No Docker CPU limit | No cgroup CPU limit |
| Storage | `/opt/saviknowledgebot/`, Docker volumes | `/opt/smartboard/` |
| Network | Docker bridge (`saviknowledgebot_default`) | Host network (port 5000) |
| Logs | Docker log driver (JSON file) | journald + `/opt/smartboard/logs/` |

**RAM budget note:** The EC2 has ~4 GB RAM and 2 GB swap. KBot's Qdrant + FastAPI + Next.js typically uses ~1.5–2 GB. Smartboard's Kestrel is capped at 800 MB. Under peak AI usage on KBot, the system may approach memory limits and trigger swap use, degrading response times for both apps.

---

### 18.8 Known Conflicts and Risks

#### CRITICAL — KBot deploy can silently break `teach.svais.net`

The `teach.svais.net` nginx blocks were manually added to `/opt/saviknowledgebot/deploy/nginx.conf` on the EC2.  
They are **not** in the `saviknowledgebot` git repository.

**Impact:** If anyone runs `git pull` in `/opt/saviknowledgebot/` or redeploys KBot from the repo, the `nginx.conf` file will be overwritten with the version that only has `kbot.svais.net`. The Docker nginx will reload and `teach.svais.net` will return 404 or SSL mismatch errors.

**Fix:** Commit the `teach.svais.net` server blocks into the `saviknowledgebot` repo's `deploy/nginx.conf` permanently.

---

#### MEDIUM — `172.18.0.1` Docker bridge gateway IP is implicit

The `teach.svais.net` nginx block hard-codes `http://172.18.0.1:5000`. This is the standard Docker bridge gateway but:
- It changes if Docker is reinstalled and creates a different bridge subnet
- It changes if a custom Docker network with a different subnet is configured
- If the Smartboard Kestrel binds only on localhost (`127.0.0.1:5000`), the Docker container can't reach it

**Fix:** Keep Kestrel binding on `0.0.0.0:5000`. The binding is set via `Environment=ASPNETCORE_URLS=http://0.0.0.0:5000` in `/etc/systemd/system/smartboard-api.service` (not in `/opt/smartboard/env`). If EC2 is provisioned from an older version of the service file (with `localhost:5000`), patch it with:
```bash
sed -i 's|ASPNETCORE_URLS=http://localhost:5000|ASPNETCORE_URLS=http://0.0.0.0:5000|' /etc/systemd/system/smartboard-api.service
systemctl daemon-reload && systemctl restart smartboard-api
```

> **This exact failure occurred on 21 May 2026** — EC2 had been provisioned with `localhost:5000` while the repo already had `0.0.0.0:5000`. Result: 502 on all paths, fixed by the above sed command.

---

#### LOW — Host system nginx is broken

`systemctl is-active nginx` returns `failed`. The `install.sh` script installs and tries to start host nginx, but it cannot bind port 80 because Docker has it. The `install.sh` is therefore **idempotent but non-functional** for nginx on this shared EC2.

The `install.sh` nginx steps can be removed or guarded with a Docker-presence check if the script is ever re-run.

---

#### LOW — SSL cert renewal for `teach.svais.net` is not automated

KBot has a certbot renewal process for `kbot.svais.net`. The `teach.svais.net` cert was provisioned manually and must be renewed manually (or a renewal cron job must be added).

Renewal command (run on EC2):
```bash
sudo certbot certonly --webroot -w /var/lib/docker/volumes/saviknowledgebot_certbot_webroot/_data \
  -d teach.svais.net --non-interactive --agree-tos -m admin@svais.net
sudo docker exec saviknowledgebot-nginx-1 nginx -s reload
```

---

### 18.9 Troubleshooting Guide

Use AWS SSM (`.\scripts\Invoke-Ssm.ps1` from the `saviknowledgebot` project directory) to run commands without SSH.

#### `teach.svais.net` returns SSL error or "connection refused"

```bash
# Is Kestrel running?
sudo systemctl status smartboard-api

# Is Docker nginx running?
docker ps | grep nginx

# Are both server blocks in the live nginx config?
grep server_name /opt/saviknowledgebot/deploy/nginx.conf

# Is Kestrel listening on 5000?
ss -tlnp | grep 5000

# Can Docker nginx reach Kestrel? (run from inside container)
docker exec saviknowledgebot-nginx-1 wget -qO- http://172.18.0.1:5000/healthz
```

#### `teach.svais.net` returns 502 on **all** paths (including `/login`, static files)

Kestrel is running but bound to `127.0.0.1:5000` (loopback only). The Docker nginx container cannot reach a loopback-only socket via `172.18.0.1:5000`.

```bash
# Confirm: shows 127.0.0.1:5000 instead of 0.0.0.0:5000
ss -tlnp | grep 5000

# Fix
sed -i 's|ASPNETCORE_URLS=http://localhost:5000|ASPNETCORE_URLS=http://0.0.0.0:5000|' /etc/systemd/system/smartboard-api.service
systemctl daemon-reload && systemctl restart smartboard-api

# Verify
ss -tlnp | grep 5000   # should show 0.0.0.0:5000
```

---

#### `teach.svais.net` loads but API calls fail (`/api/v1/...` returns 502)

```bash
# Check Kestrel logs
journalctl -u smartboard-api -n 50 --no-pager

# Check the env file has the DB connection string
grep ConnectionStrings /opt/smartboard/env

# Direct health check bypassing nginx
curl http://localhost:5000/healthz
```

#### `kbot.svais.net` and `teach.svais.net` both unreachable

```bash
# Docker nginx is probably down — restart it
docker ps -a | grep nginx
cd /opt/saviknowledgebot && docker compose --profile production up -d nginx

# After restart, verify both domains respond
curl -k https://localhost -H "Host: teach.svais.net"
```

#### After a KBot `git pull` + redeploy, `teach.svais.net` breaks

The `teach.svais.net` nginx blocks were overwritten. Re-add them manually:
```bash
# Edit nginx conf to re-add teach.svais.net blocks
sudo nano /opt/saviknowledgebot/deploy/nginx.conf
# Paste the server blocks from §18.4 above
docker exec saviknowledgebot-nginx-1 nginx -t
docker exec saviknowledgebot-nginx-1 nginx -s reload
```

#### Smartboard deploy step 6 ("nginx reload") fails

This means `saviknowledgebot-nginx-1` is not running. The app still deploys correctly (steps 1–5 are independent). Fix by restarting the KBot Docker stack:
```bash
cd /opt/saviknowledgebot && docker compose --profile production up -d nginx
```

#### High memory / swap usage causing slow responses

```bash
free -h                        # check total / used / swap
docker stats --no-stream       # per-container memory usage
journalctl -u smartboard-api --since "10 minutes ago" -n 100 --no-pager  # any OOM events
```

---

### 18.10 Startup and Recovery Order (EC2 reboot)

On EC2 reboot, processes start in this order:
1. Docker daemon (starts automatically)
2. Docker Compose services (`saviknowledgebot-nginx-1`, `saviknowledgebot-backend-1`, etc.) via Docker's `restart: unless-stopped`
3. `smartboard-api` systemd service (starts after `docker.service` by default dependency)

**Result:** After reboot, the KBot Docker nginx holds port 80/443 before host nginx has any chance to start. Both apps should be live automatically.

If `smartboard-api` fails to start (e.g., bad env file), run:
```bash
sudo systemctl start smartboard-api
journalctl -u smartboard-api -n 30 --no-pager
```

---

### 18.11 Future Improvements

| Priority | Action |
|---|---|
| CRITICAL | Commit `teach.svais.net` nginx blocks into `saviknowledgebot` repo's `deploy/nginx.conf` |
| HIGH | Add certbot renewal cron for `teach.svais.net` using webroot mode |
| MEDIUM | Add Docker memory limit for KBot services in `docker-compose.yml` to prevent OOM impact on Smartboard |
| LOW | Remove defunct host nginx steps from `install.sh` or guard them with a Docker-presence check |
| FUTURE | Migrate to separate EC2s (or separate Docker containers) as load grows |

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
