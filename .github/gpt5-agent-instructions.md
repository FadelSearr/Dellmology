# GPT-5 mini Agent Instructions for IDX_Analyst

Purpose
- Provide a concise, actionable instruction set tailored for the GPT-5 mini coding agent that will operate on this repository.

Agent identity
- This file is written for an agent running the GPT-5 mini model. It must follow the repository `copilot-instructions.md` and the project's `ROADMAP.md`.

Summary of rules
- Read `ROADMAP.md` and `ROADMAP_STATUS.md` before making feature changes. Do not implement features outside the roadmap.
- Use `manage_todo_list` to create a short plan for any multi-step task and update it as you progress.
- Always provide a one-line preamble before making non-trivial file or repo operations (searches, edits, commits).
- Keep edits minimal and focused. Use `apply_patch` for all file changes.
- Commit all changes with a clear message using conventional prefixes (`feat/`, `fix/`, `chore/`, `docs/`, `ci/`).

Security & secrets
- Never write secrets into the repository. Add new environment variables to `.env.example` only.
- If credentials are required, request the user to add them as GitHub secrets and document which secret names are required.

Typing, tests & verification
- If you change TypeScript files, run type checks / linter locally when possible and fix only errors introduced by your changes.
- If Python code is changed, prefer adding minimal unit tests if appropriate and ensure `requirements.txt` remains accurate.

Preamble template (mandatory)
- Use this one-line preamble before tool actions: "I'm about to <short action> to <goal>." Example: "I'm about to patch the ML trainer to write metrics for CI." Keep it 8–12 words.

Edit conventions
- Small focused diffs: modify the smallest set of files needed and avoid reformatting unrelated files.
- Preserve existing code style, variable naming, and file placement.

When to ask the user
- Ask one concise question with up to 3 options when a decision affects design, security, or credentials (for example: "Enable Supabase persistence now? [Yes/No/Ask later]").

Allowed helper actions
- Create or update documentation files (`README.md`, `.env.example`, `ROADMAP_STATUS.md`).
- Add lightweight dev helpers (scripts) only if they help implement roadmap items and are documented.

Forbidden actions
- Do not add heavy CI steps that install large native dependencies (e.g., full TensorFlow) without explicit approval.
- Do not commit any credential or secret material.

Example prompts for the user (quick-start)
- "Lanjutkan berdasarkan roadmap: implementasikan Order Flow Heatmap" — agent should create TODOs, search code, and propose changes.
- "Aktifkan Supabase persistence" — agent should request Supabase credentials and show required env vars.
- "Perbaiki TS errors di Section2" — agent should run type checks, patch minimal files, and commit fixes.

Minimal response behavior
- Keep messages concise and action-oriented. After each multi-step work session, produce a short changelog listing files changed and next steps.

Contact & escalation
- If uncertain about repository-wide decisions, ask the user one focused question. For security-sensitive operations, always pause and request explicit approval.
