# KBot × Smartboard Integration API

**Base URL:** `https://kbot.svais.net/api/v1/curriculum`  
**Version:** 1.0 (May 2026)  
**Auth:** Savischools JWT (`Authorization: Bearer <token>`). See [§0 Authentication](#0-authentication).  
**Format:** JSON (`Content-Type: application/json`)  
**Interactive docs:** `https://kbot.svais.net/docs` (Swagger UI)

---

## Table of Contents

0. [Authentication](#0-authentication)
1. [Data Model Overview](#1-data-model-overview)
2. [Curriculum Navigation](#2-curriculum-navigation)
3. [Content Cards](#3-content-cards)
4. [Questions](#4-questions)
5. [Submit AI-Generated Questions](#5-submit-ai-generated-questions)
6. [RAG Snippets (AI Grounding)](#6-rag-snippets-ai-grounding)
7. [Error Codes](#7-error-codes)
8. [Typical Smartboard Flows](#8-typical-smartboard-flows)

---

## 0. Authentication

### How it works

Teachers log in via **Savischools** (`https://auth.savischools.com`). After login, Savischools issues a signed JWT (RS256). The Smartboard must forward that JWT to **every KBot request** in the standard HTTP header:

```
Authorization: Bearer <savischools-jwt>
```

KBot validates the token signature against the Savischools JWKS endpoint:
```
https://auth.savischools.com/.well-known/jwks.json
```

No additional API keys or secrets are required.

### Expected JWT claims

| Claim | Type | Example | Notes |
|-------|------|---------|-------|
| `iss` | string | `https://auth.savischools.com` | Must match exactly |
| `aud` | string | `smartboard-api` | Must match exactly |
| `sub` | string | `"101"` | User ID |
| `school_id` | string | `"42"` | School the teacher belongs to |
| `teacher_id` | string | `"101"` | Teacher identity |
| `name` | string | `"Priya Sharma"` | Display name |
| `exp` | integer | Unix timestamp | Standard expiry |

### Current status — open during development

`SAVISCHOOLS_JWT_ISSUER` is **not yet set** on the KBot server. This means all endpoints currently work without any token — useful while Savischools auth is being integrated.

```bash
# Works right now without a token
curl https://kbot.svais.net/api/v1/curriculum/boards
curl https://kbot.svais.net/api/v1/curriculum/cards/54/render
```

Once the environment variable is set on the KBot server, every request without a valid JWT will receive:

```json
HTTP 401
{ "detail": "Authentication required. Include a valid Savischools JWT as: Authorization: Bearer <token>" }
```

### How to send the token from Smartboard

```typescript
// kbot-client.ts — forward the Savischools JWT to every KBot call
const KBOT_BASE = 'https://kbot.svais.net/api/v1/curriculum';

function kbotHeaders(jwtToken: string): HeadersInit {
  return {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json',
  };
}

export async function kbotGet(path: string, jwtToken: string) {
  const res = await fetch(`${KBOT_BASE}${path}`, {
    headers: kbotHeaders(jwtToken),
  });
  if (res.status === 401) throw new Error('Session expired — please log in again');
  if (!res.ok) throw new Error(`KBot ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function kbotPost(path: string, body: unknown, jwtToken: string) {
  const res = await fetch(`${KBOT_BASE}${path}`, {
    method: 'POST',
    headers: kbotHeaders(jwtToken),
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new Error('Session expired — please log in again');
  if (!res.ok) throw new Error(`KBot ${res.status}: ${await res.text()}`);
  return res.json();
}
```

The `jwtToken` is the raw access token string the Smartboard received from Savischools after the teacher logged in. Pass it through — KBot will validate it independently.

### Token expiry

KBot will return `HTTP 401` with `"Token has expired."` when the JWT expires. The Smartboard should catch this and redirect to the Savischools login page (or perform a silent refresh if Savischools supports it).

### CORS

If calling KBot directly from a browser, contact the KBot team to whitelist the Smartboard origin. For server-to-server calls (ASP.NET backend → KBot), CORS does not apply.

---

## 1. Data Model Overview

```
Board (cbse / icse / bseb / …)
  └── Chapter  (grade, subject, chapter_number)
        └── Topic  (slug — global unique ID)
              ├── Content Cards  (L0 = overview … L6 = expert)
              └── Questions  (mcq, short_answer, numerical, …)
```

**Key IDs used in API calls:**

| Identifier | Type | Example | Notes |
|------------|------|---------|-------|
| `slug` | string | `g11_units_measurement` | Stable global ID for a topic |
| `card_id` | integer | `54` | DB row id of a content card |
| `version_id` | integer | `54` | Same as `card_id` — use the row id as the version handle |
| `question_id` | integer | `893` | DB row id of a question |

---

## 2. Curriculum Navigation

These endpoints let you build cascading dropdowns to navigate to a topic.

### 2.1 List Boards

```
GET /boards
```

Returns all active curriculum boards.

**Response** `200`
```json
[
  { "code": "cbse",  "name": "CBSE India",               "country": "India"  },
  { "code": "icse",  "name": "ICSE India",               "country": "India"  },
  { "code": "bseb",  "name": "Bihar State Board",        "country": "India"  },
  { "code": "jee",   "name": "IIT-JEE",                  "country": "India"  },
  { "code": "igcse", "name": "Cambridge IGCSE",          "country": "Global" },
  { "code": "ib",    "name": "International Baccalaureate","country": "Global"}
]
```

---

### 2.2 List Grades

```
GET /grades?board={code}&subject={code}
```

Returns distinct grades that have chapters. Both query params are optional.

| Param | Type | Example |
|-------|------|---------|
| `board` | string | `cbse` |
| `subject` | string | `physics` |

**Response** `200`
```json
[
  { "grade": 9,  "label": "Grade 9"  },
  { "grade": 10, "label": "Grade 10" },
  { "grade": 11, "label": "Grade 11" },
  { "grade": 12, "label": "Grade 12" }
]
```

---

### 2.3 List Subjects

```
GET /subjects?board={code}&grade={int}
```

Returns subjects that have chapters for the given board/grade. Includes a colour hex for UI theming. Both params are optional.

| Param | Type | Example |
|-------|------|---------|
| `board` | string | `cbse` |
| `grade` | integer | `11` |

**Response** `200`
```json
[
  { "code": "biology",     "name": "Biology",     "color_hex": "#84CC16" },
  { "code": "chemistry",   "name": "Chemistry",   "color_hex": "#10B981" },
  { "code": "mathematics", "name": "Mathematics", "color_hex": "#F59E0B" },
  { "code": "physics",     "name": "Physics",     "color_hex": "#3B82F6" }
]
```

---

### 2.4 List Chapters

```
GET /chapters?board={code}&grade={int}&subject={code}
```

Returns chapters. All params optional; returns all chapters when omitted.

| Param | Type | Example |
|-------|------|---------|
| `board` | string | `cbse` |
| `grade` | integer | `11` |
| `subject` | string | `physics` |

**Response** `200`
```json
[
  {
    "id": 172,
    "chapter_number": 1,
    "title": "Units and Measurement",
    "grade": 11,
    "subject": "physics",
    "board": "cbse"
  }
]
```

---

### 2.5 List Topics

```
GET /topics?chapter_id={int}&board={code}&grade={int}&subject={code}
```

Returns topics in a chapter. Use `chapter_id` for a direct lookup, or pass `board`/`grade`/`subject` to get topics across multiple chapters.

**Response** `200`
```json
[
  {
    "id": 543,
    "slug": "g11_units_measurement",
    "title": "Units, Dimensions and Significant Figures",
    "chapter_id": 172,
    "floor_level": 4
  }
]
```

> **`floor_level`** — minimum card level (L0–L6) appropriate for this topic's student audience. Smartboard should not display cards below this level.

---

### 2.6 Get Topic Metadata

```
GET /topic/{slug}
```

Returns full topic metadata including keywords, prerequisites, and misconceptions.

**Response** `200`
```json
{
  "slug": "g11_units_measurement",
  "title": "Units, Dimensions and Significant Figures",
  "chapter_title": "Units and Measurement",
  "grade": 11,
  "subject": "physics",
  "board": "cbse",
  "floor_level": 4,
  "keywords": ["SI unit", "dimensional analysis", "significant figures"],
  "misconceptions": ["Confusing accuracy with precision"],
  "prerequisites": ["basic_arithmetic"],
  "unlocks": ["g11_motion_straight_line"]
}
```

---

## 3. Content Cards

A **content card** is the main teaching unit — a rich Markdown document covering a topic at a specific depth level.

| Level | Name | Audience |
|-------|------|----------|
| L0 | Overview / Hook | Class introduction, 2–3 min read |
| L1 | Foundation | Core concept, worked examples |
| L2 | Intermediate | Applications, problem solving |
| L3 | Advanced | Edge cases, derivations |
| L4–L6 | Expert / JEE | Competitive exam depth |

### 3.1 Get Card Status Summary

```
GET /topic/{slug}/cards
```

Returns availability and metadata for all card levels.

**Response** `200`
```json
{
  "slug": "g11_units_measurement",
  "title": "Units, Dimensions and Significant Figures",
  "cards": {
    "L0": {
      "exists": true,
      "id": 54,
      "current_version_id": 54,
      "version_count": 1,
      "is_approved": false,
      "is_published": false,
      "is_stale": true,
      "generated_by": "deepseek-chat",
      "created_at": "2026-05-12T03:44:41.606666+00:00",
      "updated_at": "2026-05-12T03:44:41.606666+00:00"
    },
    "L1": { "exists": false },
    "L2": { "exists": false }
  }
}
```

> **`current_version_id`** — pass this as `card_id` to `/cards/{card_id}/render` to display the current card.  
> **`is_stale`** — `true` if the card was generated with an older template and may need regeneration by KBot.

---

### 3.2 Get a Single Card (Markdown)

```
GET /topic/{slug}/card/{level}?locale=en__in
```

Returns the raw Markdown content. Prefer endpoint 3.4 (`/render`) for display.

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `level` | string | required | `L0` … `L6` |
| `locale` | string | `en__in` | `en__in` (English India), `hi__in_br` (Hinglish) |

**Response** `200`
```json
{
  "id": 54,
  "topic_slug": "g11_units_measurement",
  "card_level": "L0",
  "locale_key": "en__in",
  "content_md": "# Teaching Card: Units...\n\n## 1. CHAPTER PROMISE\n...",
  "is_approved": false,
  "is_published": false,
  "version": 1,
  "is_current": true,
  "is_stale": false,
  "created_at": "2026-05-12T03:44:41.606666+00:00",
  "regenerated_at": null
}
```

---

### 3.3 List Card Versions

```
GET /cards/{card_id}/versions
```

Returns all historical version rows for the same (topic, level, locale) family, newest first.

**Response** `200`
```json
[
  {
    "card_id": 54,
    "version_id": 54,
    "version": 1,
    "label": "v1",
    "updated_at": "2026-05-12T03:44:41.606666+00:00",
    "is_current": true,
    "is_published": false
  }
]
```

> Use `version_id` as the `version_id` query param in the `/render` endpoint to display a specific historical version.

---

### 3.4 Render Card as HTML ⭐

```
GET /cards/{card_id}/render?version_id={id}
```

**The primary endpoint for Smartboard display.** Converts the card's Markdown to ready-to-display HTML.

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `card_id` | integer | required | Any version row id in the family |
| `version_id` | integer | `card_id` | Select a specific version; defaults to `card_id` |

**Render pipeline applied server-side:**
1. ` ```svg ... ``` ` fences → inline `<svg>` elements
2. ` ```diagram key``` ` fences → `<div class="kbot-diagram" data-key="key"></div>`
3. `$$...$$` (display math) → MathML via `latex2mathml`
4. `$...$` (inline math) → MathML via `latex2mathml`
5. Remaining Markdown → HTML via `mistune`
6. Whole card wrapped in `<div class="kbot-card">...</div>`

**Response** `200`
```json
{
  "card_id": 54,
  "version_id": 54,
  "html": "<div class=\"kbot-card\"><h1>Teaching Card: Units...</h1>...",
  "viewport_width": 1920,
  "viewport_height": 1080,
  "etag": "\"54-3a7b2c1d4e5f6a7b\""
}
```

The `ETag` is also returned as a response header. You can use it for HTTP cache validation.

**CSS classes the Smartboard should handle:**

| Class / Element | Source | Suggested treatment |
|----------------|--------|---------------------|
| `div.kbot-card` | Wrapper | Full-width container |
| `div.kbot-diagram[data-key]` | Diagram placeholder | Load diagram image by key from your asset store |
| `<svg>` (inline) | SVG fence | Render as-is |
| `<math>` (MathML) | LaTeX math | Render natively (supported in all modern browsers) |
| `code.math` | Fallback if LaTeX fails | Monospace display |

---

## 4. Questions

### 4.1 List Questions for a Topic

```
GET /topic/{slug}/questions?difficulty={1-5}&source={src}&preview={bool}
```

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `difficulty` | integer | — | Filter by difficulty 1–5 |
| `source` | string | — | Filter: `ncert_example`, `ncert_exercise`, `llm_generated`, `teacher_added`, `smartboard_llm` |
| `preview` | boolean | `false` | `true` → lightweight shape (no full text / solutions) |

**Full shape** (`preview=false`, default):
```json
[
  {
    "id": 893,
    "question_text": "Fill in the blanks:\n(a) The volume of a cube of side 1 cm is equal to ..... m³",
    "question_type": "fill_blank",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "answer_text": "(a) 10⁻⁶ m³ ...",
    "solution_text": "Step-by-step solution...",
    "hint_text": "Think about unit conversion...",
    "difficulty": 2,
    "marks": null,
    "source": "ncert_exercise",
    "is_verified": false,
    "source_ref": null
  }
]
```

**Preview shape** (`preview=true`) — for question list UI:
```json
[
  {
    "id": 893,
    "question_type": "fill_blank",
    "difficulty": 2,
    "preview": "Fill in the blanks:\n(a) The volume of a cube of side 1 cm is equal to ..... m³",
    "source": "ncert_exercise",
    "marks": null
  }
]
```

**`question_type` values:** `mcq` | `short_answer` | `long_answer` | `numerical` | `true_false` | `fill_blank`

---

### 4.2 Get a Single Question

```
GET /questions/{question_id}
```

Returns the full question object for a single question by its integer ID.

**Response** `200`
```json
{
  "question_id": 893,
  "question_text": "Fill in the blanks:\n(a) The volume of a cube of side 1 cm...",
  "question_type": "fill_blank",
  "options": ["(a) 10⁻⁶ m³ ...", "(a) 10⁻⁴ m³ ..."],
  "answer_text": "(a) 10⁻⁶ m³; (b) 1.5×10⁴ mm²...",
  "difficulty": 2,
  "marks": null,
  "source": "ncert_exercise",
  "is_verified": false
}
```

**404** if the question does not exist or is inactive.

---

### 4.3 Get Question Explanation (Hint)

```
GET /questions/{question_id}/explanation
```

Returns the hint/explanation for a question, rendered as HTML using the same render pipeline as cards (MathML, Markdown → HTML).

**Response** `200`
```json
{
  "question_id": 893,
  "html": "<div class=\"kbot-card\"><p>Think about unit conversion...</p></div>",
  "version_id": 893
}
```

**404** if the question has no explanation (`hint_text` is null).

---

### 4.4 Get Step-by-Step Solution

```
GET /questions/{question_id}/solved-card
```

Returns the full step-by-step solution rendered as HTML.

**Response** `200`
```json
{
  "question_id": 893,
  "html": "<div class=\"kbot-card\"><h3>Solution</h3><p>Step 1: ...</p>...</div>",
  "version_id": 893
}
```

**404** if the question has no solution (`solution_text` is null).

---

## 5. Submit AI-Generated Questions

```
POST /topic/{slug}/questions/submit
Content-Type: application/json
```

Persist AI-generated questions from Smartboard into the KBot question bank. Questions are stored with `is_verified=false` and will appear in the KBot admin for review.

**Duplicate handling:** if a question with identical `question_text` already exists for the topic, it is skipped and its existing `id` is returned — no error is raised.

**Request body:**
```json
{
  "source": "smartboard_llm",
  "questions": [
    {
      "question_text": "What is the SI unit of force?",
      "question_type": "mcq",
      "difficulty": 2,
      "options": ["Newton", "Joule", "Watt", "Pascal"],
      "answer_text": "Newton",
      "solution_text": "Force = mass × acceleration. SI unit is Newton (N).",
      "hint_text": "Think F = ma",
      "marks": 1,
      "locale_key": "en__global",
      "generated_by": "smartboard-ai-v2",
      "session_ref": "session_abc123"
    }
  ]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `source` | string | No | `smartboard_llm` (default) or `teacher_added` |
| `question_text` | string | **Yes** | Full question text |
| `question_type` | string | No | Default `short_answer`. One of `mcq`, `short_answer`, `long_answer`, `numerical`, `true_false`, `fill_blank` |
| `difficulty` | integer | No | 1–5. Default `3` |
| `options` | array of strings | No | Required for `mcq`; include all 4 options |
| `answer_text` | string | No | Correct answer |
| `solution_text` | string | No | Step-by-step solution |
| `hint_text` | string | No | Brief hint |
| `marks` | integer | No | Marks allocated |
| `locale_key` | string | No | Default `en__global` |
| `generated_by` | string | No | Identifier for your AI model version |
| `session_ref` | string | No | Your session/request ID for traceability |

**Response** `200`
```json
{
  "submitted": 1,
  "question_ids": [1205]
}
```

> `submitted` is the count of **new** rows inserted. If a question was a duplicate, it still appears in `question_ids` with its existing id, but `submitted` is not incremented for it.

---

## 6. RAG Snippets (AI Grounding)

```
GET /topic/{slug}/rag-snippets?max={int}
```

Returns plain-text excerpts from the topic's published L0 card, suitable for injecting into an LLM prompt as context (Retrieval-Augmented Generation).

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `max` | integer | `5` | Maximum number of snippets to return |

**Response** `200`
```json
[
  {
    "text": "Units Dimensions and Significant Figures By the end of this card you will be able to Convert any physical quantity ...",
    "source_card_id": 54,
    "source_version_id": 54
  }
]
```

Returns `[]` if no card exists for the topic yet.

> **Recommended use:** Before generating a question or explanation for a topic, call this endpoint and include the returned `text` values in your system/user prompt as verified curriculum context.

---

## 7. Error Codes

| HTTP Status | Meaning |
|-------------|---------|
| `200` | Success |
| `201` | Created (POST that creates a resource) |
| `304` | Not Modified (ETag matched — card unchanged) |
| `404` | Resource not found or inactive |
| `422` | Validation error — check the `detail` field for the specific message |
| `500` | Server error — please report to KBot team with the request details |

All errors follow FastAPI's standard shape:
```json
{ "detail": "Human-readable error message" }
```

---

## 8. Typical Smartboard Flows

### Flow 1 — Load a topic card for classroom display

```
1. GET /boards                          → pick board
2. GET /grades?board=cbse               → pick grade
3. GET /subjects?board=cbse&grade=11    → pick subject
4. GET /chapters?board=cbse&grade=11&subject=physics  → pick chapter
5. GET /topics?chapter_id=172           → pick topic → note slug + floor_level
6. GET /topic/{slug}/cards              → check L0 exists & get current_version_id
7. GET /cards/{current_version_id}/render  → display HTML on screen
```

### Flow 2 — Show question set for a topic

```
1. GET /topic/{slug}/questions?preview=true         → show question list
2. User selects a question (note question_id)
3. GET /questions/{question_id}                     → show full question
4. Student answers → reveal:
   GET /questions/{question_id}/explanation         → show hint HTML
   GET /questions/{question_id}/solved-card         → show solution HTML
```

### Flow 3 — AI-generated question with curriculum grounding

```
1. GET /topic/{slug}/rag-snippets?max=5             → get context snippets
2. Inject snippets into LLM system prompt
3. LLM generates question(s)
4. POST /topic/{slug}/questions/submit              → save to KBot question bank
5. Use returned question_ids for session tracking
```

### Flow 4 — Check card version before display (cache-aware)

```
1. GET /topic/{slug}/cards → read current_version_id and updated_at
2. Compare updated_at to your local cache timestamp
3. If changed: GET /cards/{current_version_id}/render
4. Optionally: GET /cards/{card_id}/versions → show version history picker
```

---

## Contact

For integration issues or to request additional endpoints, contact the KBot team.  
**Interactive API docs:** https://kbot.svais.net/docs  
**OpenAPI schema:** https://kbot.svais.net/openapi.json
