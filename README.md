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
- Tauri-managed bottom-right floating assistant window with play, pause, stop,
  inspect, safe fill, chat adjustment, success detection, and save-record
  controls.
- FastAPI local backend under `app/backend`.
- SQLite-backed profile, preferences, and application record storage.
- Playwright-backed browser controller with a persistent local browser profile.
- Generic form extraction, Greenhouse/Lever/Ashby adapters, and basic
  Workday/Oracle detection with generic extraction fallback.
- Source-backed fill-plan services and safe fill execution.
- Review-required and blocked fill-plan fields can be accepted, edited with
  user-provided values, or marked blank before another safe-fill run.
- Source-backed work authorization and sponsorship mapping from saved profile
  facts, with review required by default for sensitive fields.
- Source-backed resume/cover-letter upload planning that only uses existing
  local vault files.
- Tool-backed open-answer drafting with source-reference validation and
  deterministic fallback.
- Prompt Context Preview showing the exact local sources, rules, preferences,
  and generated prompt boundary available to AI tools.
- Local document vault import that copies selected files into app-managed storage.
- Settings screen JSON export/import for local profile, rules, document
  references, and application records.
- Settings controls for salary, relocation, missing-fact, and low-confidence
  fill-plan policies.
- Live automation event stream for the assistant panel.
- Redacted automation event history so field values, chat text, HTML, file
  paths, and URL query strings are not written to local event logs.
- Local demo application and submitted pages for manual end-to-end QA through
  the controlled browser.
- Root-level smoke script for fast local verification of the demo application,
  source-backed fill plan review, safe-fill dry run, success detection, and
  application record persistence.
- Post-submit success detection with an editable structured record proposal
  before saving to application history.
- Application history with selectable details, editable status, notes, success
  signals, uploaded document IDs, answer snapshot counts, and compact
  field-level source provenance.
- Applications workspace stats, fill-plan table, and review panel are driven by
  current local app state instead of bundled sample rows.
- Profile UI for identity, links, work authorization, answer bank entries, and
  user-provided fact categories.
- Safety rules that prevent unsupported factual claims and final auto-submit.

## Quick Start

Start the local API and desktop web UI together:

```bash
npm run dev
```

Then open `http://127.0.0.1:1420`.

For the Tauri desktop shell:

```bash
npm run dev:tauri
```

Inside the desktop shell, use **Float Assistant** to open the compact
bottom-right assistant window, or **Collapse** to hide the main workspace and
keep only the assistant visible.

For local manual QA, use the default demo URL:

```text
http://127.0.0.1:8765/demo/application
```

Open it from JobFlow, inspect the form, create a fill plan, review paused
fields, safe-fill the form, manually click submit on the demo page, then run
success detection.

For a fast automated smoke check of the same backend flow:

```bash
npm run smoke
```

The smoke script starts a temporary backend on `127.0.0.1:18765` with isolated
SQLite, vault, and browser-profile paths. It does not submit a real job
application.

## Product Boundary

JobFlow does not bypass CAPTCHA, MFA, bot checks, or access controls.

Final application submission is manual. AI-generated open-ended answers must be
grounded in user-provided profile facts, project facts, resume facts, or answer
bank entries, and must keep source references.

## Local Development

See `.agents/development.md` for local-only development commands and workflow
notes.
