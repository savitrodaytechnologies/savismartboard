# Savismartboard — Product Vision Notes

> Status: **Discussion / Exploration** — nothing here is committed.  
> Ideas may conflict with each other or with the current design doc.  
> Purpose: capture all product thinking in one place so the team can review, debate, and decide.  
> Last updated: 17 May 2026

---

## How to use this file

- Add ideas freely — conflicting ideas are fine and expected at this stage.
- Each idea has a status tag: `[IDEA]` · `[DISCUSSED]` · `[REJECTED]` · `[ADOPTED]`
- Adopted ideas graduate to `Smartboard-Design.md` and are removed from here.
- Nothing in this file affects the codebase — it is purely a thinking space.

---

## 1. Dual Board System — AI Assist Panel

**Source:** GyanBot Smart Board blueprint (AI Gurukul, May 2026) + team discussion (17 May 2026)  
**Status:** `[ADOPTED]` — **implemented in v1 as a 70/30 split with teacher-triggered capture**

### Confirmed interaction model (17 May 2026)
The "private right screen" requirement was dropped — on a physical classroom smartboard the entire screen is visible to students anyway.  
Instead, both sides are visible and the right panel is the **AI Assist Panel**:

```
┌─────────────────────────────────┬──────────────────┐
│                                 │  AI Assist Panel  │
│   Active Board (70%)            │  ┌─────────────┐  │
│   Teacher writes here freely    │  │ Solution    │  │
│                                 │  │ Explain     │  │
│                                 │  │ Mistakes    │  │
│                                 │  │ Quiz        │  │
│                                 │  └─────────────┘  │
└─────────────────────────────────┴──────────────────┘
```

### How it works
1. Teacher writes on the left canvas
2. Teacher selects the **Lasso** tool (⭕) and circles the relevant area
3. A dashed selection box appears; an **"Ask AI ✨"** button appears near the selection
4. Teacher taps "Ask AI ✨" → the circled region is captured as an image
5. Right panel activates: 4 tabs load in the background (Solution, Explain, Mistakes, Quiz)
6. Teacher browses tabs while the class is looking at the board

### Right panel tabs

| Tab | What it shows |
|---|---|
| Solution | Step-by-step worked answer for the circled content |
| Explain | Alternative explanation / simplification |
| Mistakes | Most common student errors for this topic |
| Quiz | A quick question the teacher can pose to the class |

### What was simplified vs. the original GyanBot vision
- No private screen requirement → simpler hardware (any single display)
- Teacher triggers AI explicitly (circle + tap) rather than AI monitoring passively
- Right panel always visible (not revealed on demand) — students can see it too
- Split is 70/30 (not 50/50) — writing board stays dominant

### Still valid design principles from the original
1. Teacher controls what goes on the board — AI never writes on the board automatically
2. Writing is teaching — the canvas is the primary surface
3. Teaching aid, not surveillance tool
4. Explicit teacher gesture required before AI activates

---

## 2. Proactive AI Content Loading

**Status:** `[DISCUSSED]`

### Concept
Instead of the teacher searching for KBot cards, the AI reads the active board continuously and **pushes the 3 most relevant cards to the pilot board automatically** — no search, no menu, no button press.

### How it would work
- The active board canvas is monitored for text/formula changes
- When a formula (`F = ma`), concept heading, or chapter keyword is detected, a call is made to KBot to fetch the top 3 matching content cards
- Those 3 cards appear on the pilot board, ready to drag
- The teacher can ignore them or drag any of them to the active board

### Formula → content mapping examples
| Teacher writes | Pilot loads |
|---|---|
| `F = ma` | Force diagram + context visual + class prompt question |
| `V = IR` | V-I-R triangle + circuit visual + Ohm's Law question |
| `Photosynthesis` | Leaf cross-section card + equation card + class prompt |
| `Quadratic` | Parabola card + factorisation steps + error card |
| Chapter heading | Concept summary + past paper questions + key points |

### Questions to resolve
- What is the detection mechanism — OCR on the canvas? Text element detection? Voice?
- What is the latency requirement? GyanBot claims < 3 seconds.
- Does KBot's data model support "content cards ranked by relevance to a formula/keyword"?
- Fallback when AI has no match — what does the pilot board show?

---

## 3. Structured 7-Board Lesson Format

**Status:** `[DISCUSSED]`

### Concept
Instead of free-form pages, each session follows a structured 7-board lesson arc with a defined pedagogical purpose per board.

| Board | Phase | Purpose |
|---|---|---|
| 1 | Opening (0–3 min) | Recall question, prior knowledge activation |
| 2 | Core Concept (3–13 min) | Formula/concept + context visual |
| 3 | Context Visual (13–20 min) | Real-world example + annotations |
| 4 | Worked Problem (20–28 min) | Step-by-step + error card side-by-side |
| 5 | **Student Attempt** (28–38 min) | **Total silence. Timer. Teacher watches the room.** |
| 6 | Error Review (38–43 min) | Correct vs wrong answer, exam flag |
| 7 | Summary + End Class (43–45 min) | Auto-generated from today's actual board content |

### Board 5 philosophy (the silence board)
- Teacher posts the problem
- A countdown timer appears (configurable, default 8 minutes)
- AI pilot shows: "WAIT. Watch who writes. Watch who stares. Do not fill in the answer yet."
- No AI suggestions shown on pilot during the attempt phase
- After timer ends, solution card becomes available to drag

### Questions to resolve
- Is the 7-board structure mandatory or a template the teacher can modify?
- Does the AI auto-advance boards at the right time, or does the teacher always control?
- How does this interact with existing free-form multi-page sessions?
- Is the lesson template created before class or is it implied by the subject/chapter chosen?

---

## 4. Mistake System

**Status:** `[DISCUSSED]`

### Concept
For every common concept, pre-tag the most frequent student errors. When the teacher is on the relevant board, the pilot shows an **error card** ready to drag — showing the wrong approach side-by-side with the correct one.

### Structure of an error card
```
WRONG:   a = F × m    ← shown in red
RIGHT:   a = F ÷ m    ← shown in green
WHY:     Division and multiplication are confused when rearranging F = ma
```

### 7 error types (from reference)
1. Sign errors (e.g. direction of force)
2. Unit omission / wrong unit
3. Formula rearrangement errors
4. Conceptual confusions (e.g. mass vs weight)
5. Wrong MCQ option chosen (each wrong option has a one-line explanation)
6. Calculation errors (substitution mistakes)
7. Incomplete answers (missing unit, missing sentence)

### Questions to resolve
- Are error cards part of KBot's content model, or does Smartboard maintain them?
- Who creates and validates error cards? Subject matter experts at KBot?
- Should the mistake system learn from what this teacher's students get wrong over time?

---

## 5. Teacher Profile-Based Localization

**Status:** `[DISCUSSED]`

### Principle
Everything curriculum/geography-specific is a **data attribute on the teacher profile**, not hardcoded in the app. The app adapts; the content layer carries the locale.

### Teacher profile fields needed
```json
{
  "country": "India | UAE | UK | ...",
  "state": "Bihar | Maharashtra | ...",
  "curriculum": "CBSE | ICSE | BSEB | IB | Cambridge | SABIS | ...",
  "language_primary": "hi | en | ar | ta | ...",
  "language_secondary": "en | null",
  "school_type": "government | private | international"
}
```

### What changes per profile
| Dimension | BSEB Bihar | CBSE Delhi | IB Dubai |
|---|---|---|---|
| Content library | BSEB past papers, Bihar examples | NCERT, CBSE papers | IB syllabus, global examples |
| Context examples | Bullock cart, Ganga | Generic India | International, neutral |
| Exam flags | "BSEB 2021 — 3 marks" | "CBSE Board 2023" | "IB May 2024" |
| UI language | Hindi / Hinglish | Hindi or English | English / Arabic |

### What does NOT change (curriculum-neutral)
- Whiteboard canvas engine (pan/zoom/annotations)
- Session lifecycle (start/save/end)
- KBot card insertion mechanism
- S3 archival
- Everything in the current codebase

### Rule
> Any string that references a specific curriculum, board, state, or language must come from the teacher's profile data or from the KBot content layer — **never hardcoded in Smartboard**.

### Where this data comes from
- Teacher profile → Savischools JWT or profile API (Manohar's milestone)
- KBot cards carry `curriculumTags: ["CBSE", "NCERT", "Class10"]`
- Smartboard passes the teacher's curriculum context when fetching KBot content

### Questions to resolve
- Does Savischools already store curriculum/country/language per teacher?
- Does KBot's card model already have curriculum tags, or does that need to be added?
- When is UI language translated — is English-only acceptable until a real language preference exists?

---

## 6. Student Projection / Classroom Mode

**Status:** `[IDEA]`

### Concept
The teacher's device shows both Active + Pilot boards. The classroom projector/display shows **only the Active board** (what students see). These are the same session, different views.

### Options for implementation
- **Option A:** Single-URL, two browser windows — teacher opens `/session/123/teacher`, projector opens `/session/123/student`. Same session, different layout.
- **Option B:** Full-screen Active board output URL that auto-follows whatever the teacher is on, without needing any teacher interaction on the student display.
- **Option C:** Dedicated classroom hardware with GyanBoard-style dual-output display.

### Questions to resolve
- What is the realistic classroom setup — laptop + projector? Smartboard with split output? Tablet + TV?
- Does the student view need to be real-time (WebSocket/polling) or is a 1-2 second delay acceptable?
- Who "presents" — does the teacher explicitly push to the student view, or is it always mirroring the active board?

---

## 7. Voice Commands

**Status:** `[IDEA]`

### Concept
Teacher controls the board without touching it during class.

### Commands (language-agnostic concept)
| Action | Example commands |
|---|---|
| Next board | "Next board" / "Agla board" |
| Start timer | "Timer 8 minutes" / "Do minute" |
| Quick quiz | "Quick quiz" / "Quiz banao" |
| Show mistake | "Show mistake" / "Galti dikhao" |
| End class | "End class" |

### Questions to resolve
- On-device processing vs cloud API? (On-device preferred for offline classrooms)
- What hardware has the microphone — teacher's device or dedicated classroom mic?
- Language model for Hindi/Hinglish recognition — Whisper? Google STT? Custom?

---

## 8. Session Recording + YouTube Export

**Status:** `[IDEA]` (already listed as M5 in design doc)

### Concept
Record the active board session (canvas changes + teacher annotations in real time) and export it as a lesson video the teacher can publish to YouTube or share with students.

### Notes
- Already referenced in design doc §16 as M5 "Share" milestone
- GyanBot describes this as "teacher's board session becomes a publishable lesson video"
- Could be a canvas replay (reconstruct from page snapshots) or a screen recording

---

## 9. Admin / Principal Dashboard

**Status:** `[IDEA]`

### Concept
School admin sees aggregated teaching data — not teacher performance, but curriculum coverage.

### What it shows (privacy-first)
- Topics taught this week across all classrooms
- Curriculum coverage % per subject per class
- Which chapters have not been started yet
- Exam readiness gaps by comparing taught topics vs exam syllabus

### What it deliberately does NOT show
- Per-teacher performance scores
- Camera feeds
- Live classroom monitoring
- Student attendance linked to teacher actions

### Questions to resolve
- Is this a Smartboard feature or a Savischools portal feature?
- Does KBot need to provide the "expected syllabus" for the exam-coverage comparison?

---

## 10. NFC / Quick Login

**Status:** `[IDEA]`

### Concept
Teacher taps an NFC card on the classroom board → their name, saved boards, and personal card library load instantly. No password.

### Notes
- Requires hardware NFC reader integrated into the display
- Not relevant for web-only deployment on existing hardware
- PIN/QR backup if card unavailable

---

## 11. Offline AI (On-Device Model)

**Status:** `[IDEA]`

### Concept
Formula recognition and basic content matching runs on-device so the pilot board still works without internet.

### Notes
- Requires a small on-device model (e.g. a distilled formula classifier + KBot content index cached locally)
- 30-day content pre-download at installation
- Ambitious — likely Phase 3 or later
- Current architecture (IndexedDB + sync queue) already supports offline-first sessions; this extends it to offline AI suggestions

---

## Conflicts and Open Questions

| # | Conflict / Question |
|---|---|
| C1 | Free-form pages (current design) vs. structured 7-board lesson (§3) — these are fundamentally different session models. Can they coexist as a choice? |
| C2 | AI pushes content proactively (§2) vs. teacher always chooses what goes on the board (Design Principle 1 of §1) — the pilot board resolves this by keeping the AI on the right side only |
| C3 | Dual-board requires either split-screen UI or two physical displays — which is the minimum hardware assumption? |
| C4 | Student projection (§6) requires either a second URL/window or real-time sync — adds infrastructure complexity |
| C5 | Voice commands (§7) and NFC (§10) are hardware-dependent features that don't apply to a pure web app on existing devices |
| C6 | Mistake system (§4) — should error cards live in KBot (owned by Mukesh) or in Smartboard? Ownership needs to be clear |
| C7 | Offline AI (§11) is very ambitious and may conflict with the "LLM is last resort" principle if it creates a dependency on a local model |
