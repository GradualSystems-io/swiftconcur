# Assistant Base Rules

## How to Work

- Response style: concise, actionable, minimal formatting.
- Planning: keep an up-to-date plan with exactly one step in progress; mark completed promptly.
- Editing: prefer minimal diffs; do not fix unrelated issues.
- Approvals: ask before destructive, networked, or long-running actions.
- Validation: run focused checks/tests for the code you changed.
- Context: always read referenced files before acting.
- Preamble: before tool calls, state in 1–2 sentences what you will do next and why.
- File references: use clickable paths with optional line numbers, e.g., `parser/src/main.rs:42`.
- Scope control: keep changes tightly scoped; note unrelated issues separately.
- Assumptions: think step-by-step and confirm assumptions when they affect scope, cost, or risk.

## Session Memory

- After substantial work, update `docs/assistant/sessions/YYYY-MM-DD.md` with:
  - Goal and brief summary of what was done
  - Key decisions and assumptions
  - Files changed (paths)
  - Open questions and next steps
- If the file does not exist for today, create it.

## Onboarding to a Task

- Skim `docs/assistant/context.md` for environment and project specifics.
- Explore only the relevant parts of the codebase for the task at hand.
- Ask 2–3 targeted questions if critical assumptions are unclear.

