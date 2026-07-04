# JobFlow

JobFlow is a local-first desktop copilot for job applications.

The app helps a user maintain a local profile, inspect job application forms,
draft a safe fill plan from user-approved facts, fill high-confidence fields,
pause for review when information is sensitive or uncertain, and save a
structured application record after the user manually submits the application.

## Current Status

This repository contains the MVP scaffold:

- Tauri desktop shell under `app/desktop`.
- React + TypeScript operational UI.
- Main command-center workspace plus a floating assistant rail for live
  application execution.
- FastAPI local backend under `app/backend`.
- SQLite-backed profile, preferences, and application record storage.
- Playwright-backed browser controller with a persistent local browser profile.
- Generic form extraction, source-backed fill-plan services, and safe fill execution.
- Tool-backed open-answer drafting with source-reference validation and
  deterministic fallback.
- Local document vault import that copies selected files into app-managed storage.
- Profile UI for identity, links, answer bank entries, and user-provided fact
  categories.
- Safety rules that prevent unsupported factual claims and final auto-submit.

## Product Boundary

JobFlow does not bypass CAPTCHA, MFA, bot checks, or access controls.

Final application submission is manual. AI-generated open-ended answers must be
grounded in user-provided profile facts, project facts, resume facts, or answer
bank entries, and must keep source references.

## Local Development

See `.agents/development.md` for local-only development commands and workflow
notes.
