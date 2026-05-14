# Frontend — Savismartboard

React + TypeScript + Vite + Tailwind + Konva.

## Getting started

```powershell
cd frontend
npm install
npm run dev
```

The dev server proxies `/api/*` to the backend (default `https://localhost:7001`). Adjust in [vite.config.ts](vite.config.ts) if needed.

## Folder ownership

- `src/pages/TeacherDashboardPage.tsx` — Manohar
- `src/pages/TopicTeachingPage.tsx` — Parivesh
- `src/pages/SmartboardSessionPage.tsx` — Parivesh
- `src/components/whiteboard/*`, `src/components/ai/*` — Parivesh
- `src/components/context/*` — Manohar
- `src/components/kbot/*`, `src/components/questions/*` — Mukesh
- `src/services/savischoolsContextService.ts` — Manohar
- `src/services/kbotContentService.ts`, `kbotQuestionService.ts` — Mukesh
- `src/services/smartboardSessionService.ts`, `aiService.ts` — Parivesh
- `src/types/*` — co-owned (Parivesh leads)
