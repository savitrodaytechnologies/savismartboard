# Savischools Smartboard — Detailed Design Document

> Version: 1.1  
> Date: 16 May 2026  
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
    "url": "/api/smartboard/kbot/content-cards/501/render?versionId=3"
  },
  "viewport": { "width": 1920, "height": 1080 }, // logical canvas size
  "annotations": [
    {
      "id": "ann-1",
      "type": "pen",                    // pen | highlighter | eraser-stroke | text | shape | image
      "tool": { "color": "#000000", "width": 4, "opacity": 1 },
      "points": [0.012, 0.034, 0.040, 0.071]   // normalized 0..1 coords
    }
  ],
  "createdAt": "2026-05-14T10:12:33Z",
  "modifiedAt": "2026-05-14T10:12:48Z"
}
```

**Coordinate system:** all annotation coordinates are **normalized (0..1)** against `viewport`. This makes replay device-independent and PDF export deterministic.

### 4.3 Session lifecycle

`Draft → InProgress → Paused → Completed → Archived`

- `Draft` allowed for pre-class prep.
- Auto-save every 30 s while `InProgress`.
- `Completed` is required before share/export.
- `Archived` after retention period (configurable per school).

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

- All session writes are **idempotent and diff-based** (`pageId` + `revision`).
- Page payloads are self-contained JSON.
- Background image references include both URL and (later) cached blob ID.
- A client-side sync queue interface is stubbed but disabled in v1.

---

## 9. Six Milestones (mapped to owners)

| # | Milestone | Primary owner | Supporting | Status |
|---|---|---|---|---|
| M1 | Savischools login + teacher context | **Manohar** | Parivesh (shell) | 🔴 Not started — `[AllowAnonymous]` everywhere; no SSO handoff |
| M2 | KBot content card viewer | **Mukesh** | Parivesh (canvas host) | 🟡 Backend complete; card-as-canvas-background not verified end-to-end |
| M3 | Whiteboard + annotation layer | **Parivesh** | — | ✅ Complete — pen/highlighter/shapes/text/undo/redo/pages |
| M4 | Question bank + solved card classroom mode | **Mukesh** | Parivesh (board insert) | 🟡 Backend complete; hide/reveal + insert-into-board UI not built |
| M5 | Session save / export / share | **Parivesh** | Manohar (portal share) | 🟡 Session create/load/auto-save working; export + share are stubs |
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

## 16. Implementation Status (updated 16 May 2026)

### 16.1 Infrastructure
| Item | Status | Notes |
|---|---|---|
| EC2 (ap-south-1, `13.205.70.12`) | ✅ Running | Amazon Linux 2023, systemd service `smartboard-api` |
| RDS SQL Server (`savismartboard` DB) | ✅ Running | Schema migration `001` applied |
| GitHub Actions CI/CD | ✅ Auto-deploy on push to `main` | Latest deploy: commit `52d3e0f` |
| Health endpoint `/healthz` | ✅ Returns `Healthy` | |

### 16.2 Backend services
| Service | Status | Notes |
|---|---|---|
| `KBotCurriculumService` | ✅ Implemented | boards / grades / subjects / chapters / topics / rag-snippets |
| `KBotContentService` | ✅ Implemented | topic cards (L0–L6), versions, render |
| `KBotQuestionService` | ✅ Implemented | list / detail / explanation / solved-card / submit |
| `SmartboardContextService` | 🟡 KBot proxy | Returns KBot data as placeholder; must be replaced with real Savischools data when M1 is done |
| `SmartboardSessionService` | 🟡 Partial | Create / get / recent / save-page / end working; export + share return placeholder URLs |
| `SmartboardAiService` | 🔴 Stub | All 6 methods return `[kind] {instruction}` |

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
| `TeacherDashboardPage` | ✅ Working | Class → Subject → Topic picker, recent sessions, blank board start |
| `TopicTeachingPage` | 🟡 Partial | Card list + question list + preview render; no question hide/reveal or insert-into-board from question panel |
| `SmartboardSessionPage` | 🟡 Partial | Canvas + toolbar + undo/redo + page strip working; card HTML background not rendered; no AI panel |

### 16.5 Frontend components
| Component | Status | Notes |
|---|---|---|
| `WhiteboardCanvas` | ✅ Complete | Pen, highlighter, rect/circle/arrow, text, undo, redo |
| `CanvasToolbar` | ✅ Complete | Tool picker, colour, stroke width, undo/redo/clear, end session |
| `PageStrip` | ✅ Complete | Thumbnail strip, add/delete pages |
| `OfflineIndicator` | ✅ Complete | Pending sync badge |
| `AiAssistantPanel` | 🔴 Not built | M6 |
| `ContentCardViewer` (in session) | 🔴 Not built | Card HTML as canvas background not wired |
| `QuestionViewer` / `SolvedCardViewer` | 🔴 Not built | M4 classroom mode UI |

### 16.6 Known issues to fix before production
1. Replace all `[AllowAnonymous]` with `[Authorize]` after M1 SSO is done.
2. `SmartboardContextService` — swap KBot proxy for real Savischools class/subject/topic data.
3. KBot card HTML background rendering in `SmartboardSessionPage` — wiring `cardPage()` helper to canvas background layer.
4. M4 classroom mode — question hide/reveal UI + insert solved card into board.
5. M5 export — PDF generation pipeline (server-side preferred; `pdf-lib` client fallback).
6. M5 share — signed URL delivery to Savischools student/parent portal.
7. M6 AI service — implement grounded prompt templates, RAG from KBot snippets, cost logging, per-school budget cap.

---

## Appendix A — Smartboard Database Schemas (reference)

> Same shape as the original spec, restated here for completeness. All tables include `SchoolId` for tenant isolation; all FK enforcement and indexing decisions left to migration design.

- `SmartboardSession (SessionId, SchoolId, TeacherId, ClassId, SectionId, SubjectId, TopicId, SessionTitle, SessionDate, StartedAt, EndedAt, Status, CreatedOn)`
- `SmartboardSessionPage (SessionPageId, SessionId, PageNo, PageType, SourceType, SourceId, SourceVersionId, PageJson, SnapshotUrl, Revision, CreatedOn, ModifiedOn)`
- `SmartboardSessionExport (ExportId, SessionId, ExportType, FileUrl, CreatedOn, CreatedByUserId)`
- `SmartboardAiRequestLog (AiRequestLogId, SchoolId, TeacherId, TopicId, SessionId, RequestType, SourceType, SourceId, PromptText, ResponseText, Provider, ModelName, TokenCount, CostMicroUsd, CreatedOn)`
- `SmartboardSchoolSetting (SettingId, SchoolId, IsSmartboardEnabled, IsAiEnabled, AllowExport, AllowStudentSharing, IsAiSharingAllowed, AiMonthlyBudgetUsd, CreatedOn, ModifiedOn)`

> Added vs. original: `Revision` on pages (for diff-based saves), `CostMicroUsd` on AI log, `IsAiSharingAllowed` and `AiMonthlyBudgetUsd` on settings.

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
