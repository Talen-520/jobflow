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
- Simplified main navigation for Dashboard, Profile, Applications, and Settings.
- Generic form extraction, Greenhouse/Lever/Ashby adapters, and basic
  Workday/Oracle detection with generic extraction fallback.
- Source-backed fill-plan services and safe fill execution.
- Review-required and blocked fill-plan fields can be accepted, edited with
  user-provided values, or marked blank before another safe-fill run.
- User-edited review answers for non-sensitive open text fields can be saved as
  reusable answer-bank presets for later source-backed drafting.
- Source-backed work authorization and sponsorship mapping from saved profile
  facts, with review required by default for sensitive fields.
- Source-backed resume/cover-letter upload planning that only uses existing
  local vault files.
- Source-backed company, university, application-source, disability, and veteran
  mapping from saved profile fields, with EEO fields gated and review-required.
- Tool-backed open-answer drafting with source-reference validation and
  deterministic fallback.
- Profile resume file upload and removal for the app-managed local resume
  reference; uploading a new resume automatically replaces the previous resume
  record and old vault file.
- Settings screen JSON export/import for local profile, preferences, document
  references, and application records.
- Settings model connection fields auto-save locally. Ollama allows manual
  model-name entry; DeepSeek, OpenAI, and Gemini use provider model dropdowns
  with locally stored API keys and base URLs.
- Settings controls for salary, relocation, missing-fact, and low-confidence
  fill-plan policies.
- Live automation event stream with recent local history and a clear-history
  control for the assistant panel.
- Main workspace refreshes local profile and application state from automation
  events, so floating-assistant saves and profile updates show up without a
  manual reload.
- Redacted automation event history so field values, chat text, HTML, file
  paths, and URL query strings are not written to local event logs.
- Local demo application and submitted pages for manual end-to-end QA through
  the controlled browser.
- Root-level smoke script for fast local verification of the demo application,
  source-backed fill plan review, safe-fill dry run, success detection, and
  application record persistence.
- Post-submit success detection with an editable structured record proposal
  before saving to application history.
- Searchable application history with status filtering, selectable details,
  editable company, role, date, URL, ATS, status, notes, success signals,
  uploaded document names, answer snapshot counts, and compact field-level
  source provenance, plus confirmed local record deletion.
- Manual application record creation for cases where success detection is not
  available or the user wants to log an application directly.
- Dashboard is read-only and summarizes local readiness, profile completeness,
  resume state, saved application stats, current fill-plan state, and next best
  action.
- The left sidebar is navigation-only: Dashboard, Profile, Applications, and
  Settings. Live application execution belongs in the floating assistant or the
  Applications workspace.
- Applications workspace stats, fill-plan table, review panel, and live ATS test
  links are driven by current local app state instead of bundled sample rows.
- Profile UI for resume upload, full name, email, phone, location, company,
  LinkedIn URL, GitHub URL, portfolio URL, work authorization, sponsorship,
  university, opportunity source, disability status, and veteran status.
- Profile and Settings changes auto-save after editing; there are no page-level
  save buttons for these local preference screens.
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

ATS-specific local fixtures are also served for adapter checks:

```text
http://127.0.0.1:8765/demo/greenhouse/application
http://127.0.0.1:8765/demo/lever/application
```

Open it from JobFlow, inspect the form, create a fill plan, review paused
fields, safe-fill the form, manually click submit on the demo page, then run
success detection.

The Applications workspace also includes live manual QA shortcuts for:

```text
https://job-boards.greenhouse.io/getbuilt/jobs/4713164005
https://ibqbjb.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/Honeywell/jobs/preview/135537/apply/email?keyword=software&mode=location
https://www.ashbyhq.com/careers?ashby_jid=448baa35-cd72-468a-bcab-51dd55b7a275
```

For a fast automated smoke check of the same backend flow:

```bash
npm run smoke
```

The smoke script starts a temporary backend on `127.0.0.1:18765` with isolated
SQLite, vault, and browser-profile paths. It does not submit a real job
application.

Current remaining demo gap: the backend demo, adapter extraction, fill-plan
generation, safe-fill logic, and smoke harness exist, but the main desktop
workspace still needs a polished one-click demo path wired into the live UI. The
floating assistant remains the intended execution surface for demo/application
work.

## Product Boundary

JobFlow does not bypass CAPTCHA, MFA, bot checks, or access controls.

Final application submission is manual. AI-generated open-ended answers must be
grounded in user-provided profile facts, project facts, resume facts, or answer
bank entries, and must keep source references.

## Local Development

See `.agents/development.md` for local-only development commands and workflow
notes.
