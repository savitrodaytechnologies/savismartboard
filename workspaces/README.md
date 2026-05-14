# VS Code Workspaces — One per developer

Each developer opens their **own** `.code-workspace` file. That gives them:

- A separate VS Code window with a separate title bar.
- A separate Copilot chat session (chat is per window).
- A scoped file tree showing only the folders relevant to their work.
- Faster search (shared `bin/`, `obj/`, `node_modules/`, `dist/` excluded).

The **code** stays in one monorepo on `main` — only the *view* into it differs.

## Files

| Developer | Workspace file |
|---|---|
| Parivesh (Smartboard core) | [parivesh-smartboard-core.code-workspace](parivesh-smartboard-core.code-workspace) |
| Manohar (Savischools)      | [manohar-savischools.code-workspace](manohar-savischools.code-workspace) |
| Mukesh (KBot)              | [mukesh-kbot.code-workspace](mukesh-kbot.code-workspace) |

## How to open

1. Clone the repo (once):
   ```powershell
   git clone https://github.com/savitrodaytechnologies/savismartboard.git
   ```
2. In VS Code: **File → Open Workspace from File…** → pick your `.code-workspace`.
3. Or double-click the file in Explorer.
4. When VS Code prompts, **Install recommended extensions**.

## Why not separate folders/branches?

- Single solution (`Savismartboard.sln`) compiles together — splitting it breaks references and CI.
- Shared types (`frontend/src/types/index.ts`) are imported by all three areas.
- One DB schema, one API surface — must be reviewed together.
- Conflicts are *avoided by ownership*, not by folder isolation. Each dev edits files listed in [.github/CODEOWNERS](../.github/CODEOWNERS); merge conflicts will be rare because file ownership rarely overlaps.

## When two devs touch the same file

This happens for shared files like `Program.cs`, `Options.cs`, `frontend/src/types/index.ts`, route registration, etc. Process:

1. Pull `main` before you start.
2. Make your change on a feature branch.
3. PR — Parivesh reviews and resolves any overlap.
4. Rebase on `main` before merging.
