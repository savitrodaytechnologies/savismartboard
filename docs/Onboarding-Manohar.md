# Onboarding — Manohar (Savischools Integration)

> Read this end-to-end once before writing any code. Then keep it open while you work.

You own the bridge between **Savischools** (the existing ASP.NET + MS SQL system) and the **Smartboard API**. The Smartboard does not own users, classes, syllabus, or sharing — it consumes them from Savischools.

Lead developer / reviewer: **Parivesh**. Every PR is auto-routed to him via [.github/CODEOWNERS](.github/CODEOWNERS).

---

## 0. Deployment context (read first)

- **Savischools** runs on **Windows EC2 + MS SQL** in **AWS Account A**.
- **KBot** runs on **Linux EC2** in **AWS Account C**.
- **Smartboard core** will run on **Linux EC2** — initially co-hosted on the **same EC2 as KBot** (Mukesh’s box) to save cost while we bootstrap. Later it moves to its own EC2 / account.
- The three accounts are separate. Smartboard → Savischools traffic crosses **AWS account boundaries** (Account B/C → Account A).

**What this means for you (Manohar):**

1. **Savischools must be reachable from the Smartboard EC2.** For dev/staging the Smartboard EC2 will hit the Savischools public ALB over HTTPS. Coordinate with the Savischools/AWS team to allow this — ask for one of:
   - WAF / SG allowlist of the Smartboard EC2 NAT Gateway EIP, **or**
   - mTLS between the two ALBs, **or**
   - (Production) AWS **PrivateLink** — Savischools exposes its ALB as a VPC Endpoint Service; Smartboard consumes it. No public exposure, no peering, works across accounts.
2. **JWKS endpoint must be reachable** from the Smartboard EC2 — ASP.NET’s JWT middleware fetches public keys at startup. Whatever connectivity option above you pick, JWKS must work over it.
3. **No cross-account IAM roles needed** for HTTP API calls. IAM only matters if you ever read Savischools’ S3 / SQS directly (you won’t).
4. **Auth flow is unchanged regardless of hosting:** Savischools issues a JWT → browser sends it to Smartboard → Smartboard validates against Savischools JWKS → forwards it on outbound calls.

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

Verify: open https://localhost:7001/swagger and http://localhost:5173/dashboard. Dashboard will be blank — that’s **your** page to build.

---

## 2. Branch + PR flow

- Branch from `main`: `feat/savischools/<short-desc>` (e.g. `feat/savischools/context-endpoint`).
- Small, frequent PRs. Each PR triggers CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)).
- Use the PR template, tick **Savischools integration (Manohar)**.
- Parivesh reviews every PR.

---

## 3. Files you own

**Backend** (`backend/Smartboard.Api/`)
- [Auth/TeacherContextAccessor.cs](backend/Smartboard.Api/Auth/TeacherContextAccessor.cs) — reads `school_id` / `teacher_id` claims from the Savischools JWT. **Confirm with Savischools team that the claim names match. If not, change them here.**
- [HttpClients/SavischoolsClient.cs](backend/Smartboard.Api/HttpClients/SavischoolsClient.cs) — typed HttpClient. Add one method per Savischools endpoint you call.
- [Services/SmartboardContextService.cs](backend/Smartboard.Api/Services/SmartboardContextService.cs) — orchestrates calls + applies per-school feature flags from `SmartboardSchoolSetting`.
- [Controllers/SmartboardContextController.cs](backend/Smartboard.Api/Controllers/SmartboardContextController.cs) — already wired with route stubs; fill them in.
- [Models/Dto/ContextDtos.cs](backend/Smartboard.Api/Models/Dto/ContextDtos.cs) — DTOs returned to the browser.
- [Infrastructure/Options.cs](backend/Smartboard.Api/Infrastructure/Options.cs) → `SavischoolsOptions { BaseUrl, Jwt { Authority, Audience } }`.
- [appsettings.json](backend/Smartboard.Api/appsettings.json) → `Savischools:BaseUrl`, `Savischools:Jwt:Authority`, `Savischools:Jwt:Audience`.

**Frontend** (`frontend/src/`)
- [pages/TeacherDashboardPage.tsx](frontend/src/pages/TeacherDashboardPage.tsx) — first screen after login.
- `components/context/*` — class picker, subject picker, topic picker (create as needed).
- [services/savischoolsContextService.ts](frontend/src/services/savischoolsContextService.ts).

**Tests**
- `backend/Smartboard.Api.Tests/Savischools*.cs` — mock `HttpMessageHandler`, assert URL/headers, deserialize fixtures.

---

## 4. Integration contract — implement exactly this

> This section is prescriptive. The C# interfaces are already defined; you fill in the bodies. Do not change method signatures.

### Step A — Confirm JWT claims (Day 1, no code)

Decode a real Savischools teacher JWT at https://jwt.io and verify these claims exist:

| Claim name | Expected type | Example |
|---|---|---|
| `school_id` | integer string | `"42"` |
| `teacher_id` | integer string | `"101"` |
| `name` | string | `"Priya Sharma"` |
| `school_name` | string | `"Delhi Public School"` |
| `aud` | string | `"smartboard-api"` |
| `iss` | string | `"https://auth.savischools.savitroday.com"` |

If claim names differ (e.g. `schoolId` instead of `school_id`), update [Auth/TeacherContextAccessor.cs](backend/Smartboard.Api/Auth/TeacherContextAccessor.cs) accordingly.

Update `appsettings.json`:
```json
"Savischools": {
  "BaseUrl": "<real url here>",
  "Jwt": {
    "Authority": "<real JWKS authority here>",
    "Audience": "smartboard-api"
  }
}
```

### Step B — Implement `SavischoolsClient`

File: [HttpClients/SavischoolsClient.cs](backend/Smartboard.Api/HttpClients/SavischoolsClient.cs)

Replace the current generic `GetAsync` with typed methods — **one per Savischools endpoint you call**:

```csharp
public interface ISavischoolsClient
{
    Task<SavischoolsMeResponse>    GetMeAsync(string bearerToken, CancellationToken ct = default);
    Task<List<SavischoolsClass>>   GetClassesAsync(string bearerToken, CancellationToken ct = default);
    Task<List<SavischoolsSection>> GetSectionsAsync(string bearerToken, int classId, CancellationToken ct = default);
    Task<List<SavischoolsSubject>> GetSubjectsAsync(string bearerToken, int classId, CancellationToken ct = default);
    Task<List<SavischoolsTopic>>   GetTopicsAsync(string bearerToken, int subjectId, int classId, CancellationToken ct = default);
    Task                           MarkTopicTaughtAsync(string bearerToken, int topicId, int classId, CancellationToken ct = default);
}
```

> `bearerToken` is the raw JWT string extracted from `IHttpContextAccessor` — forward it as `Authorization: Bearer {token}`.
> Define the `SavischoolsXxx` response types as private record/class inside `SavischoolsClient.cs` — they are **not** exposed to the rest of the app (only the DTOs in `ContextDtos.cs` are).

### Step C — Implement `SmartboardContextService`

File: [Services/SmartboardContextService.cs](backend/Smartboard.Api/Services/SmartboardContextService.cs)

Map each Savischools response to the Smartboard DTO — these are the exact return types the frontend expects:

```csharp
// Maps SavischoolsMeResponse → TeacherContextDto(schoolId, teacherId, schoolName, teacherName)
public async Task<TeacherContextDto> GetContextAsync(CancellationToken ct)

// Maps SavischoolsClass[] → ClassDto(classId, name)[]
public async Task<IReadOnlyList<ClassDto>> GetClassesAsync(CancellationToken ct)

// Maps SavischoolsSection[] → SectionDto(sectionId, name)[]
public async Task<IReadOnlyList<SectionDto>> GetSectionsAsync(int classId, CancellationToken ct)

// Maps SavischoolsSubject[] → SubjectDto(subjectId, name)[]
public async Task<IReadOnlyList<SubjectDto>> GetSubjectsAsync(int classId, CancellationToken ct)

// Maps SavischoolsTopic[] → TopicDto(topicId, name, subjectId)[]
public async Task<IReadOnlyList<TopicDto>> GetTopicsAsync(int subjectId, int classId, CancellationToken ct)

// Fire-and-forget POST to Savischools
public async Task MarkTopicTaughtAsync(int topicId, CancellationToken ct)
```

### Step D — Exact JSON the frontend expects

The Smartboard frontend calls these endpoints. **Do not rename fields** — the TypeScript types match these exactly.

```
GET /api/smartboard/context
→ { "schoolId": 42, "teacherId": 101, "schoolName": "Delhi Public School", "teacherName": "Priya Sharma" }

GET /api/smartboard/classes
→ [{ "classId": 5, "name": "Class 5" }, ...]

GET /api/smartboard/sections?classId=5
→ [{ "sectionId": 1, "name": "Section A" }, ...]

GET /api/smartboard/subjects?classId=5
→ [{ "subjectId": 12, "name": "Mathematics" }, ...]

GET /api/smartboard/topics?subjectId=12&classId=5
→ [{ "topicId": 201, "name": "Fractions", "subjectId": 12 }, ...]

POST /api/smartboard/syllabus/topics/201/mark-taught
→ 204 No Content
```

### Step E — Frontend (Teacher Dashboard)

File: [frontend/src/services/savischoolsContextService.ts](frontend/src/services/savischoolsContextService.ts)

Methods already exist — just verify they work end-to-end once your backend is live. No frontend changes needed unless the dashboard shows blank data.

---

## 5. Recommended order of work

1. **Auth contract verification** (½ day)
   - Get a sample Savischools JWT from their team. Decode it (https://jwt.io). Confirm claims for `school_id`, `teacher_id`, `name`, `school_name`, audience, issuer.
   - Update [TeacherContextAccessor.cs](backend/Smartboard.Api/Auth/TeacherContextAccessor.cs) and `appsettings.json`’s `Savischools:Jwt` values.
   - Add a smoke test that hits any `[Authorize]` endpoint with a sample token and gets 200.

2. **`GET /api/smartboard/context`** — return who-am-I + school name. (1 day)
   - Implement service → call Savischools `/api/users/me` (or the actual endpoint) → map → return `TeacherContextDto`.
   - Frontend: render greeting on dashboard.

3. **Classes / Sections / Subjects / Topics endpoints** (3–4 days)
   - Implement each Smartboard endpoint by calling the matching Savischools endpoint.
   - Return only what the smartboard UI needs (don’t leak full Savischools shape).

4. **Mark-topic-taught** (1 day)
   - `POST /api/smartboard/syllabus/topics/{topicId}/mark-taught` → calls Savischools’ syllabus update endpoint with current teacher + class context.

5. **Share-to-class** *(later)* — `POST /api/smartboard/sessions/{id}/share` calls Savischools to push a notification + URL to specific class/section. Coordinate with Parivesh because the export URL comes from his code.

---

## 5. APIs you need to **CONSUME** from Savischools

> ⚠️ Confirm exact paths/contracts with the Savischools team. The shapes below are what the smartboard needs — adjust mapping if Savischools differs.

| # | Verb | Savischools endpoint (proposed) | Why we need it |
|---|---|---|---|
| 1 | `POST` | `/connect/token` (or whatever issues JWTs) | SSO from Savischools to Smartboard. Token must include `school_id`, `teacher_id`, `name`, `school_name` claims. |
| 2 | `GET`  | `/api/users/me` | Confirm teacher identity, school name. |
| 3 | `GET`  | `/api/teachers/{teacherId}/classes` | Classes the teacher teaches (today + general). |
| 4 | `GET`  | `/api/classes/{classId}/sections` | Sections under a class. |
| 5 | `GET`  | `/api/classes/{classId}/subjects?teacherId={tid}` | Subjects the teacher teaches in that class. |
| 6 | `GET`  | `/api/subjects/{subjectId}/topics?classId={cid}` | Syllabus topics for a class+subject (for KBot to render). |
| 7 | `POST` | `/api/syllabus/topics/{topicId}/mark-taught` body `{ classId, sectionId?, taughtAt }` | Update syllabus progress. |
| 8 | `POST` | `/api/notifications/class` body `{ classId, sectionId?, title, url }` | Share session/notes URL to a class. |
| 9 | `GET`  | `/api/schools/{schoolId}/policy` *(optional)* | School-level policies (e.g. AI allowed?). Falls back to local `SmartboardSchoolSetting`. |

**Headers we send on every call**: `Authorization: Bearer <savischools-jwt>` (forwarded from the incoming request) and `X-Smartboard-Caller: smartboard-api`.

**Failure expectations**: any 5xx → Polly retries 3× exp backoff; any 4xx → bubble up as 502 from Smartboard with a correlation id.

---

## 6. APIs you need to **PROVIDE** on the Smartboard API

These are the routes the **frontend** calls. Stubs already exist in [SmartboardContextController.cs](backend/Smartboard.Api/Controllers/SmartboardContextController.cs) — your job is to fill them in.

All routes require `[Authorize]` (Savischools JWT).

| Verb | Route | Returns | Maps to Savischools call |
|---|---|---|---|
| `GET`  | `/api/smartboard/context` | `TeacherContextDto { schoolId, teacherId, schoolName, teacherName }` | #2 |
| `GET`  | `/api/smartboard/classes` | `ClassDto[]` | #3 |
| `GET`  | `/api/smartboard/sections?classId={id}` | `SectionDto[]` | #4 |
| `GET`  | `/api/smartboard/subjects?classId={id}` | `SubjectDto[]` | #5 (uses teacherId from claim) |
| `GET`  | `/api/smartboard/topics?subjectId={id}&classId={id}` | `TopicDto[]` | #6 |
| `POST` | `/api/smartboard/syllabus/topics/{topicId:int}/mark-taught` body `{ classId, sectionId? }` | `204 No Content` | #7 |

**Response conventions**
- JSON, camelCase (default in ASP.NET Core 8).
- Empty list → `[]`, never `null`.
- Errors → `application/problem+json` (use `Problem(...)` helpers).

---

## 7. Definition of done (per endpoint)

- [ ] Implementation in `Service` + `Controller`.
- [ ] DTO defined; no leakage of Savischools internals.
- [ ] Unit test: mocked HttpClient asserts URL, headers, and DTO mapping.
- [ ] Manually verified with a real Savischools JWT in Swagger.
- [ ] Frontend service method calls it, page renders something.
- [ ] PR opened with the template, Parivesh review requested.

---

## 8. Open questions to clarify with the Savischools team (do this Day 1)

1. Exact JWT issuer URL (`Authority`) and `Audience` value for the smartboard.
2. Confirm claim names: `school_id`, `teacher_id`, `name`, `school_name`, `roles`.
3. Token lifetime + refresh strategy (silent refresh? full re-login?).
4. CORS: will Savischools host the smartboard inside an iframe, redirect, or open a new tab?
5. Are class/subject IDs stable integers or GUIDs across environments?
6. Rate limits per teacher / per school?

Capture answers in a comment on `docs/Smartboard-Design.md` Appendix C.

---

## 9. When you’re stuck

- Ping Parivesh for code-level review.
- For Savischools-side gaps, file a ticket with the Savischools team and stub the call returning realistic fake data so the frontend can keep moving.
