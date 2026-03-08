## GitHub Copilot / Local Agent Instructions for IDX_Analyst

Purpose
- Help contributors and automated agents (Copilot-style assistants) work productively and safely in this repository.
- Follow the project's Roadmap (ROADMAP.md). Do not propose features outside the roadmap; when uncertain, proceed with the next roadmap item unless asked otherwise.

High-level rules
- Always read `ROADMAP.md` and `ROADMAP_STATUS.md` before making feature changes.
- Use the repository layout and existing code style: `apps/web` (Next.js + TypeScript), `apps/ml-engine` (Python), `apps/streamer` (Go).
- Make minimal, focused edits. Prefer patching the smallest number of files required.
- After implementing a change, run local checks (lint/tests/build) when possible and commit with a clear, conventional message.
- Do not add or commit secrets. Add `.env.example` entries only.

Workflows & commands
- Install and run frontend locally:
  - `cd apps/web && npm install && npm run dev`
- Run ML engine locally:
  - `cd apps/ml-engine && python -m pip install -r requirements.txt && python main.py`
- Run Go streamer (dev):
  - `cd apps/streamer && go run main.go`
- Run linting/tests (frontend):
  - `cd apps/web && npm run lint` (or `npm run build` / `npm test`)

Repository conventions
- Use `apps/*` layout to scope changes: frontend/ui in `apps/web`, ML in `apps/ml-engine`, streaming core in `apps/streamer`.
- Use `db/init/` for SQL migrations. If adding migrations, follow existing numbering pattern.
- Use environment variables (documented in `.env.example`) for credentials; never commit real credentials.

Agent behaviors (must-follow)
- MUST use the repository `manage_todo_list` tool to create and update a small plan for multi-step tasks.
- MUST provide a one-sentence preamble before running non-trivial file or repo commands (search, edits, commits).
- MUST commit code changes after implementing a requested task. Commit message should be concise and use conventional prefixes (feat/, fix/, chore/, docs/, ci/).
- When creating or editing files, prefer focused diffs via apply_patch and avoid reformatting unrelated files.
- When tests or type checks fail, attempt to fix only errors introduced by your changes; do not attempt wide refactors.

Security & secrets
- Document new env vars in `.env.example`. Do not add any real secrets to the repo.
- For production credentials (Supabase, Telegram bot token), request the user to set GitHub repository secrets and provide guidance — do not assume or write them into files.

Developer UX / communication
- Keep messages concise and action-oriented. When a task is complete, list changed files and the next recommended step.
- If a change might affect runtime or deployment, recommend verifying with the appropriate local command and/or CI job.

Edge cases and anti-patterns
- Do not implement features not listed in `ROADMAP.md` unless explicitly instructed.
- Avoid adding heavyweight dependencies (tensorflow, large native libs) to CI without prior agreement.

Where to look first
- `ROADMAP.md`, `README.md`, `apps/web/src`, `apps/ml-engine`, `apps/streamer`, `db/init`.

If you need clarification
- Ask one concise question with up to 1 options when decisions are required.

---
This instruction file is a lightweight bootstrap to make Copilot-style agents productive in this workspace. Update sparingly and keep preferences aligned with the project's roadmap and security rules.
