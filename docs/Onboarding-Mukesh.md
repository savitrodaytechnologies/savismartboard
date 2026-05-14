# Onboarding — Mukesh (KBot Integration)

> Read this end-to-end once before writing any code. Then keep it open while you work.

You own the bridge between **KBot** (existing content/question system) and the **Smartboard API**. KBot supplies the *what to teach* (content cards, questions, solved cards). Smartboard renders, annotates, and replays it.

Lead developer / reviewer: **Parivesh**. Every PR is auto-routed to him via [.github/CODEOWNERS](.github/CODEOWNERS).

---

## 0. Deployment context (read first)

- **KBot** runs on **Linux EC2** in **AWS Account C** (your current box).
- **Smartboard core** will run on **Linux EC2 too**. To start, it will be **co-hosted on your KBot EC2** (same instance) to save cost while we bootstrap. Later it moves to its own EC2 / account.
- **Savischools** is on **Windows EC2 + MS SQL** in **AWS Account A** (separate account).

**What this means for you (Mukesh):**

1. **Capacity on the shared EC2** — confirm the instance has headroom for one more process (`dotnet Smartboard.Api.dll` + nginx). Bare minimum **t3.small / t4g.small** (2 vCPU, 2 GB). If KBot is already on something smaller, plan to bump it to `t3.medium` / `t4g.medium`. Parivesh will own the deploy scripts; you only need to confirm the box can take the load and share SSH access.
2. **Process isolation, not OS isolation** — Smartboard runs as its own `systemd` service on a different port (`5000`), reverse-proxied by nginx. KBot stays on its current port. They share CPU/RAM/disk but nothing else.
3. **Localhost shortcut** — because both processes live on the same box initially, Smartboard can call KBot at `http://localhost:<kbot-port>` (or `http://127.0.0.1:<kbot-port>`). Set `KBot:BaseUrl` accordingly in `appsettings.Production.json`. **No public internet, no auth headache for the dev/staging phase.** Still send the API key header so prod (when it moves off-box) is identical.
4. **When Smartboard moves to its own EC2** (later), KBot will need to either:
   - Expose its ALB to the Smartboard NAT EIP (with API key + WAF), **or**
   - Set up **AWS PrivateLink** — KBot exposes its ALB as a VPC Endpoint Service; Smartboard’s account creates an interface endpoint to consume it. Cross-account, no peering, no public internet.
   Plan for this from day one in your API contracts (don’t hard-code localhost in code; only in config).
5. **No cross-account IAM roles needed** for HTTP API calls. Only matters if Smartboard ever reads KBot’s S3 directly.

---

## 1. One-time machine setup

```powershell
# 1. Install prerequisites
#    - .NET 8 SDK         https://dot.net
#    - Node.js 20+        https://nodejs.org
#    - SQL Server (Dev/Express) + sqlcmd
#    - Git

# 2. Clone
git clone https://github.com/savitrodaytechnologies/savismartboard.git
cd savismartboard

# 3. One-shot setup (NuGet restore + npm install + DB create + migrations)
.\scripts\setup.ps1

# 4. Run both sides (two terminals)
cd backend\Smartboard.Api ; dotnet run        # https://localhost:7001  (/swagger)
cd frontend ; npm run dev                     # http://localhost:5173
```

Verify: Swagger lists `/api/smartboard/kbot/...` endpoints. They return placeholder data — **that’s yours to fill in.**

---

## 2. Branch + PR flow

- Branch from `main`: `feat/kbot/<short-desc>` (e.g. `feat/kbot/render-card`).
- Small, frequent PRs. Each PR triggers CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)).
- Use the PR template, tick **KBot integration (Mukesh)**.
- Parivesh reviews every PR.

---

## 3. Files you own

**Backend** (`backend/Smartboard.Api/`)
- [HttpClients/KBotClient.cs](backend/Smartboard.Api/HttpClients/KBotClient.cs) — typed HttpClient. One method per KBot endpoint.
- [Services/KBotContentService.cs](backend/Smartboard.Api/Services/KBotContentService.cs) — content cards (list / versions / render).
- [Services/KBotQuestionService.cs](backend/Smartboard.Api/Services/KBotQuestionService.cs) — questions (list / detail / explanation / solved).
- [Controllers/SmartboardKBotContentController.cs](backend/Smartboard.Api/Controllers/SmartboardKBotContentController.cs) — content endpoints.
- [Controllers/SmartboardQuestionController.cs](backend/Smartboard.Api/Controllers/SmartboardQuestionController.cs) — question endpoints.
- [Models/Dto/KBotContentDtos.cs](backend/Smartboard.Api/Models/Dto/KBotContentDtos.cs)
- [Models/Dto/KBotQuestionDtos.cs](backend/Smartboard.Api/Models/Dto/KBotQuestionDtos.cs)
- [Infrastructure/Options.cs](backend/Smartboard.Api/Infrastructure/Options.cs) → `KBotOptions { BaseUrl }`.
- [appsettings.json](backend/Smartboard.Api/appsettings.json) → `KBot:BaseUrl`.

**Frontend** (`frontend/src/`)
- `components/kbot/*` — content card list, version picker, rendered card host.
- `components/questions/*` — question list, question viewer, solved-card viewer.
- [services/kbotContentService.ts](frontend/src/services/kbotContentService.ts)
- [services/kbotQuestionService.ts](frontend/src/services/kbotQuestionService.ts)

**Tests**
- `backend/Smartboard.Api.Tests/KBot*.cs` — WireMock or `HttpMessageHandler` mocks.

---

## 4. Critical rules (non-negotiable)

1. **Pin the version**. Every render call must return a `versionId`. Smartboard stores it on the session page so a year-old session replays exactly. **Never** silently upgrade content.
2. **Sanitize HTML** before serving to the browser. Use **HtmlSanitizer** (`Ganss.Xss` NuGet) on every `RenderedCardDto.Html` — strip `<script>`, inline JS, dangerous attributes. KBot is internal but assume defense in depth.
3. **Cache aggressively**. Rendered cards are immutable per `versionId`. Use ETag/`Cache-Control: public, max-age=...` headers. Reuse `IMemoryCache` keyed `cardId:versionId`.
4. **Set viewport**. Every rendered card must declare `viewportWidth` × `viewportHeight` (logical px) so Parivesh’s canvas can scale annotations correctly.
5. **Never call KBot from the browser.** Always go via the smartboard API.

---

## 5. Recommended order of work

1. **`KBotClient` + options wiring** (½ day)
   - Confirm `KBot:BaseUrl` and auth (API key header? service-to-service JWT?). Add to `appsettings.Development.json` (do **not** commit secrets — use `dotnet user-secrets`).

2. **List content cards for a topic** (1 day)
   - `GET /api/smartboard/kbot/topics/{topicId}/content-cards` → list of `ContentCardSummaryDto`.
   - Frontend: side panel on TopicTeachingPage showing cards.

3. **Versions + render** (2 days)
   - `GET /api/smartboard/kbot/content-cards/{cardId}/versions` → `ContentCardVersionDto[]`.
   - `GET /api/smartboard/kbot/content-cards/{cardId}/render?versionId=` → `RenderedCardDto`.
   - Add HtmlSanitizer + ETag.
   - Frontend: render `html` inside an absolutely-positioned div under the Konva canvas at the declared viewport size.

4. **Questions list + detail** (1 day)
   - `GET /api/smartboard/kbot/topics/{topicId}/questions?difficulty=` → `QuestionSummaryDto[]`.
   - `GET /api/smartboard/kbot/questions/{id}` → `QuestionDto`.

5. **Basic explanation + solved card** (2 days)
   - `GET /api/smartboard/kbot/questions/{id}/basic-explanation` → `BasicExplanationDto`.
   - `GET /api/smartboard/kbot/questions/{id}/solved-card` → `SolvedCardDto` (HTML + versionId, sanitized).

6. **RAG snippets endpoint for AI** *(coordinate with Parivesh)* — small `GET /api/smartboard/kbot/topics/{id}/rag-snippets` for grounding LLM prompts. Define together.

---

## 6. APIs you need to **CONSUME** from KBot

> ⚠️ Confirm exact paths/contracts with the KBot team. Shapes below are what the smartboard needs.

| # | Verb | KBot endpoint (proposed) | Returns |
|---|---|---|---|
| 1 | `GET`  | `/api/topics/{topicId}/content-cards` | `[{ cardId, title, currentVersionId, versionCount, updatedAt }]` |
| 2 | `GET`  | `/api/content-cards/{cardId}/versions` | `[{ versionId, label, updatedAt, isCurrent }]` |
| 3 | `GET`  | `/api/content-cards/{cardId}/render?versionId={vid}` | `{ html, css?, viewportWidth, viewportHeight, etag }` (HTML, sanitized) |
| 4 | `GET`  | `/api/topics/{topicId}/questions?difficulty={easy|med|hard}` | `[{ questionId, difficulty, preview, currentVersionId }]` |
| 5 | `GET`  | `/api/questions/{questionId}` | `{ questionId, html, type, options?, versionId }` |
| 6 | `GET`  | `/api/questions/{questionId}/basic-explanation` | `{ html, versionId }` |
| 7 | `GET`  | `/api/questions/{questionId}/solved-card` | `{ html, versionId }` (step-by-step) |
| 8 | `GET`  | `/api/topics/{topicId}/rag-snippets?max=5` *(optional, for AI grounding)* | `[{ text, sourceCardId, sourceVersionId }]` |

**Auth**: confirm with KBot team — likely an API key header `X-KBot-Api-Key: <secret>` or service-to-service JWT.

**Failure expectations**: 5xx → Polly retries 3× exp backoff; 404 → bubble up as 404 from Smartboard; 4xx → 502 with correlation id.

---

## 7. APIs you need to **PROVIDE** on the Smartboard API

These are the routes the **frontend** calls. Stubs already exist in [SmartboardKBotContentController.cs](backend/Smartboard.Api/Controllers/SmartboardKBotContentController.cs) and [SmartboardQuestionController.cs](backend/Smartboard.Api/Controllers/SmartboardQuestionController.cs).

All routes require `[Authorize]` (Savischools JWT — Manohar wires the auth).

### Content cards
| Verb | Route | Returns | Maps to KBot |
|---|---|---|---|
| `GET` | `/api/smartboard/kbot/topics/{topicId:long}/content-cards` | `ContentCardSummaryDto[]` | #1 |
| `GET` | `/api/smartboard/kbot/content-cards/{cardId:long}/versions` | `ContentCardVersionDto[]` | #2 |
| `GET` | `/api/smartboard/kbot/content-cards/{cardId:long}/render?versionId={vid}` | `RenderedCardDto` (sanitized HTML + viewport) | #3 |

### Questions
| Verb | Route | Returns | Maps to KBot |
|---|---|---|---|
| `GET` | `/api/smartboard/kbot/topics/{topicId:long}/questions?difficulty={easy\|med\|hard}` | `QuestionSummaryDto[]` | #4 |
| `GET` | `/api/smartboard/kbot/questions/{questionId:long}` | `QuestionDto` | #5 |
| `GET` | `/api/smartboard/kbot/questions/{questionId:long}/basic-explanation` | `BasicExplanationDto` | #6 |
| `GET` | `/api/smartboard/kbot/questions/{questionId:long}/solved-card` | `SolvedCardDto` | #7 |

**Response conventions**
- JSON, camelCase.
- Set `ETag` on render endpoints. Honor `If-None-Match` → return `304`.
- Empty list → `[]`, never `null`.
- Errors → `application/problem+json`.

---

## 8. Definition of done (per endpoint)

- [ ] Implementation in `Service` + `Controller`.
- [ ] DTO defined.
- [ ] HTML output passes through HtmlSanitizer.
- [ ] `versionId` round-trips correctly (request a specific version → get exactly that version back).
- [ ] Unit test: mocked HttpClient asserts URL/headers and DTO mapping.
- [ ] Manually verified in Swagger with a real KBot dev instance.
- [ ] Frontend service method calls it.
- [ ] PR opened with the template, Parivesh review requested.

---

## 9. Open questions to clarify with the KBot team (do this Day 1)

1. Auth model — API key, mTLS, or JWT? Which header name?
2. Are `cardId`, `questionId`, `versionId` `int`, `long`, or GUID? Stable across environments?
3. Does KBot serve **HTML**, **Markdown**, or a structured JSON of blocks? (Affects sanitization + rendering.)
4. Are images inside HTML referenced by absolute URLs that the browser can reach, or do we need to proxy them?
5. What is the latency budget? (Drives caching aggressiveness.)
6. Is there a webhook when a new version is published, or do we always re-fetch?
7. Rate limits?
8. Sandbox/dev base URL + sample data.

Capture answers in `docs/Smartboard-Design.md` Appendix C.

---

## 10. When you’re stuck

- Ping Parivesh for code-level review.
- For KBot-side gaps, file a ticket with the KBot team and stub the call returning realistic fake HTML so Parivesh’s canvas work isn’t blocked.
