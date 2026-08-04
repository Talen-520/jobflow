# JobFlow

JobFlow is a local-first desktop copilot for job applications.

The app helps a user maintain a local profile, inspect job application forms,
draft a safe fill plan from user-approved facts, automatically fill exact saved
Profile values, leave missing information untouched, and save a
structured application record after the user manually submits the application.

## Current Status

This repository contains a local desktop MVP whose Chrome-extension transport
is implemented and undergoing release QA:

- Tauri desktop shell under `app/desktop`.
- React + TypeScript operational UI.
- Main workspace for profile, records, model settings, and Chrome connection
  status.
- Automatic supported-ATS detection that opens the extension toolbar popup
  with a manual **Start filling** action.
- FastAPI local backend under `app/backend`.
- SQLite-backed profile, preferences, and application record storage.
- Manifest V3 Chrome extension that connects automatically to the local backend,
  refreshes stale local credentials, observes supported ATS frames, and owns
  current-page fill controls.
- Compact shadcn-style extension popup that shows only the detected ATS,
  current field count, an optional **AI answers** switch, and one
  **Start filling** action.
- Extension completion feedback that reports how many detected fields still
  need manual input. A double-check completion icon appears only when every
  detected field on the current page is filled and browser-verified.
- The extension preserves the user's normal Chrome session and automatically
  reports supported Greenhouse, Ashby, Oracle, Workday, Lever, and Rippling forms. JobFlow
  does not launch a separate automation browser or reuse Chrome's profile directory.
- Simplified main navigation for Dashboard, Profile, Applications, and Settings.
- Generic and Lever form handling plus dedicated Greenhouse, Ashby, Oracle,
  Workday, and Rippling detection, extraction, locator normalization, fill behavior, and
  success-detection strategies.
- Source-backed fill-plan services and safe fill execution.
- Review-required and blocked fill-plan fields can be accepted, edited with
  user-provided values, or marked blank before another safe-fill run.
- User-edited review answers for non-sensitive open text fields can be saved as
  reusable answer-bank presets for later source-backed drafting.
- Source-backed work authorization and sponsorship mapping from exact saved
  Profile values without per-run review.
- Source-backed resume/cover-letter upload planning that only uses existing
  local vault files.
- Source-backed company, university, application-source, pronouns, gender,
  race, Hispanic/Latino, disability, and veteran mapping from exact saved
  Profile fields.
- AI use is limited to open questions such as motivation and company interest;
  answers require validated Profile or detected-form source references. A
  dedicated auto-saved **AI answer context** field lets the user provide
  additional verified facts and writing preferences.
- Profile resume file upload and removal for the app-managed local resume
  reference; uploading a new resume automatically replaces the previous resume
  record and old vault file while preserving the original display filename.
- Settings screen versioned JSON export/import for migrating local profile,
  preferences, document references, and application records.
- Settings model connection fields auto-save locally. Ollama allows manual
  model-name entry; DeepSeek, OpenAI, and Gemini use provider model dropdowns
  with base URLs and API keys stored in the app-data `.env` file.
- Settings controls for salary, relocation, missing-fact, and low-confidence
  fill-plan policies.
- Live automation event stream with recent local history and a clear-history
  control for the assistant panel.
- Main workspace refreshes local profile, detected forms, and application state
  without a manual reload.
- Redacted automation event history so field values, chat text, HTML, file
  paths, and URL query strings are not written to local event logs.
- Local demo application and submitted pages for manual end-to-end QA through
  the connected Chrome tab.
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
  Settings. Supported-form detection is silent in the desktop UI; concise
  current-page status and fill actions belong to the Chrome extension.
- Applications workspace stats, fill-plan table, and review panel are driven by
  current local app state instead of bundled sample rows or QA links.
- Profile UI for resume upload, legal and preferred names, email, precise phone
  fields, normalized country and state/province dropdowns, state-aware city
  suggestions with unrestricted city text entry and icon-triggered helper text,
  company, LinkedIn URL, GitHub URL, portfolio URL, US work authorization, visa
  sponsorship, relocation choice, non-compete status, SMS consent, university,
  opportunity source, structured pronouns, gender, race, Hispanic/Latino, disability
  status, veteran status, AI answer context, and
  structured repeatable work-experience, education, and certification records.
  Work Experience captures company, location, calendar-selected dates,
  current-role state, and description; Education captures school, degree, field
  of study, calendar-selected dates, and attending or graduated status;
  Certifications capture number and issue/expiration dates.
- Legacy month-only Profile dates are normalized to a full calendar date during
  load so an upgrade does not hide previously saved experience dates.
- Resume status shows only `Empty` or the original filename. Add and replace use
  one local upload control, and each new resume replaces the prior vault copy.
- Profile and Settings changes auto-save after editing; there are no page-level
  save buttons for these local preference screens.
- Safety rules that prevent unsupported factual claims and final auto-submit.

## Previous Release Milestone

The distributable, real-page validated desktop MVP milestone was completed and
verified on July 12, 2026. Its release contract is:

- Greenhouse, Ashby, Oracle Recruiting, Workday, and Rippling each own dedicated form
  extraction, stable field-location, fill, and success-detection logic. A
  dedicated adapter may reuse shared primitives, but it must not merely inherit
  the generic behavior unchanged.
- Every dedicated adapter has representative fixture coverage for identity,
  select/radio/checkbox controls, resume upload, open questions, multi-step
  behavior where applicable, and post-submit success signals.
- The provided live Greenhouse, Oracle, Ashby, and Workday links are exercised
  through a user-connected Chrome tab without final submission.
- Ollama, DeepSeek, OpenAI, and Gemini settings drive the actual source-backed
  open-answer client. Unsupported claims and invalid source references still
  force a safe fallback.
- API keys are stored in `~/Library/Application Support/com.jobflow.desktop/.env`
  on macOS, outside SQLite/JSON preference payloads, and are never returned by
  status APIs or included in logs and local-data exports.
- The FastAPI backend is packaged and launched as a Tauri sidecar so a release
  build does not require a source checkout, Python environment, or `uv` command.
- Desktop startup validates the backend protocol reported by `/health` instead
  of trusting any process listening on port `8765`. On macOS, a verified stale
  JobFlow sidecar is retired before the bundled sidecar starts.
- The extension toolbar popup performs one bounded current-page run after the
  user clicks **Start filling**. It never advances pages or submits the
  application.
- Backend, frontend, Rust, smoke, packaged desktop, and real-page QA gates pass.

Verification evidence:

- `87 passed` in the backend suite, plus desktop TypeScript/Vite and Rust checks.
- Root smoke passed across generic, Lever, Greenhouse, Ashby, Oracle, and
  Workday fixtures, including dedicated success signals and DOM fill checks.
- Live Greenhouse, Ashby, Oracle, and Workday pages were inspected without
  filling or final submission during the previous Playwright-backed milestone.
  The extension transport now owns real-page execution and must pass the Chrome
  QA checklist before the next release tag.
- The PyInstaller one-file sidecar passed isolated health/app-data smoke.
- `JobFlow.app` bundled both arm64 executables, launched the sidecar, completed
  the local demo through Review, Confirm record, and Saved, and stopped the
  sidecar on app exit.

## Current Extension Verification

- Backend suite: `98 passed`.
- Extension JavaScript syntax checks and `56` extension tests: passed.
- Desktop Education suggestion test: passed.
- Desktop TypeScript/Vite build and Rust `cargo check --locked`: passed.
- Root smoke passed through a pairing-authenticated extension protocol
  simulator across generic, Lever, Greenhouse, Ashby, Oracle, and Workday.
- A live Avoca/Ashby production check on extension `0.4.3` filled and verified
  ten source-backed fields with zero errors and no final submission. The
  relocation/in-office commitment remained blocked because no exact Profile
  fact existed.
- Live Workday checks filled the first-step contact and address fields, then
  uploaded the saved resume and filled LinkedIn on My Experience with browser
  verification. Extension `0.8.3` adds native Workday Add/Add Another handling
  for Work Experience, Education, Certifications, and Websites, including
  polling for Workday's asynchronous row insertion and excluding each section's
  nested controls from generic field mapping. Existing autocomplete selections
  are verified idempotently. A live `0.8.3` Workday check filled and
  browser-verified Work Experience, Education, and two Website rows with
  `3` filled and `0` errors. Certifications stayed collapsed because the Profile
  contains no certification data. The run did not navigate or submit.
- Extension `0.8.6` writes Workday date steppers without zero-padded numeric
  values, matches prefixed school search results, and reports a missing Profile
  Degree as review instead of a browser error. Optional fields without saved
  Profile data are left blank without inflating the manual remainder count.
- Extension `0.8.7` pairs Workday degree aliases with searchable Profile
  Education inputs. School, Degree, and Field of study preserve free text while
  offering canonical suggestions; exact abbreviations such as `BS` and `CS`
  normalize to saved standard values.
- Extension `0.8.8` commits Workday School or University suggestions through
  the site's pointer-driven autocomplete interaction. Re-running Fill also
  recognizes an already successful Resume/CV upload before reading the local
  document, so the same resume is not attached again.
- Extension `0.8.9` treats Workday School or University as a prompt-backed
  multi-select. It submits the search with Enter, selects the matching
  `promptOption` radio, and reports success only after a `selectedItem` exists;
  typed search text and `0 items selected` are never accepted as filled.
- Extension `0.8.33` adds Rippling production-host detection, stable Profile
  field ids for generated React controls, location autocomplete, resume upload,
  EEO/SMS choice mapping, semantic `aria-labelledby` extraction, and dedicated
  backend fixture coverage. It waits for Rippling's resume parser to stabilize
  before filling controlled identity fields and verifies values after rerenders.
  Profile pronouns and Hispanic/Latino use explicit dropdown choices that match
  Rippling's live options; JobFlow never infers either value.

## Quick Start

Start the local API and desktop web UI together:

```bash
npm run dev
```

Then open `http://127.0.0.1:1420`.

### Install the local Chrome extension

The development extension has no build step:

1. Open `chrome://extensions` in the user's normal Chrome profile.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select `app/extension` from this repository.
4. Start JobFlow and reload the extension once after source changes.
5. Open a supported job application in Chrome.
6. JobFlow detects the form and opens the extension toolbar popup with
   **Start filling** and an optional **AI answers** switch. If Chrome
   declines automatic popup opening, the JobFlow icon shows a `1` badge; click
   the icon to open the same controls.

Known ATS host permissions are limited to Greenhouse, Ashby, Oracle, Workday,
Lever, and Rippling. Generic forms outside those hosts are not automatically observed.
Backend connection and supported-form detection are automatic.
The extension republishes its current detection state immediately after every
WebSocket reconnect, so an already-open form does not wait for a heartbeat.

For the Tauri desktop shell:

```bash
npm run dev:tauri
```

Closing the desktop window hides it while the local detector continues running.
Opening a supported application form leaves Chrome focused and opens the
extension toolbar popup without injecting controls into the employer page.

For local manual QA, use the default demo URL:

```text
http://127.0.0.1:8765/demo/application
```

ATS-specific local fixtures are also served for adapter checks:

```text
http://127.0.0.1:8765/demo/greenhouse/application
http://127.0.0.1:8765/demo/ashby/application
http://127.0.0.1:8765/demo/oracle/application
http://127.0.0.1:8765/demo/workday/application
http://127.0.0.1:8765/demo/lever/application
```

Dedicated Greenhouse, Ashby, Oracle, and Workday fixture routes exercise their
platform-specific selectors and success signals. These fixtures remain local
and never submit data to an employer.

Open the demo URL in Chrome, wait for automatic detection, then click
**Start filling** in the extension popup. Review paused fields, manually submit
the local demo page, and run success detection from the application workflow.
Live ATS QA links belong only in development documentation and never appear in
the production UI.

For a fast automated smoke check of the same backend flow:

```bash
npm run smoke
```

The smoke script starts a temporary backend on `127.0.0.1:18765` with isolated
SQLite and vault paths, then connects an extension-protocol simulator. It does
not submit a real job application.

Build and verify the standalone FastAPI sidecar for the current Rust target:

```bash
cd app/backend
uv sync --extra test --extra build
cd ../..
npm run backend:sidecar
npm run backend:sidecar:smoke
```

`npm --workspace app/desktop run tauri build` runs the frontend build and
sidecar build before creating the desktop bundle. Release builds launch the
bundled backend automatically and store SQLite and documents in the
operating-system app-data directory. The user's Chrome profile remains owned by
Chrome and is never copied into JobFlow. No Python or `uv` installation is
required to run the resulting application.

The extension toolbar popup handles exactly one page per click: inspect,
prepare exact Profile values, optionally draft source-backed custom open
answers, fill eligible fields, and stop. Navigate to the next page manually;
JobFlow detects its new form signature and prompts the popup again.

All launch modes now default to the same operating-system data directory. On
macOS this is `~/Library/Application Support/com.jobflow.desktop`. A one-time
legacy merge preserves existing non-empty profile fields, imports missing data,
and moves the newest resume into the persistent vault. Rebuilding the app does
not replace this directory.

The directory keeps runtime data separated by responsibility:

```text
jobflow.sqlite            Profile, preferences, records, and redacted events
.env                      Provider API keys; local mode 0600
extension-pairing-token   Internal Chrome connection credential; mode 0600
vault/                    Resume and other local documents
```

SQLite remains the runtime source of truth. Settings exports a versioned JSON
snapshot for backup and migration; secrets and document binaries are excluded.

Validate the extension scripts and safety gate with:

```bash
npm run extension:check
npm run extension:test
```

## Product Boundary

JobFlow does not bypass CAPTCHA, MFA, bot checks, or access controls.

When a CAPTCHA is detected, extension writes stop and the assistant asks the
user to complete verification manually in Chrome before inspecting again.

Final application submission is manual. AI-generated open-ended answers must be
grounded in user-provided profile facts, project facts, resume facts, or answer
bank entries, and must keep source references.

## Local Development

See `.agents/development.md` for local-only development commands and workflow
notes.
