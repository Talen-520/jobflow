from __future__ import annotations


DEMO_APPLICATION_HTML = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Frontend Engineer - JobFlow Demo Co</title>
    <style>
      body {
        margin: 0;
        background: #f7f7f8;
        color: #18181b;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        margin: 0 auto;
        max-width: 760px;
        padding: 40px 20px;
      }
      form {
        display: grid;
        gap: 18px;
        border: 1px solid #d4d4d8;
        border-radius: 10px;
        background: white;
        padding: 24px;
      }
      label {
        display: grid;
        gap: 7px;
        font-size: 14px;
        font-weight: 600;
      }
      input,
      select,
      textarea {
        min-height: 38px;
        border: 1px solid #d4d4d8;
        border-radius: 7px;
        padding: 8px 10px;
        font: inherit;
      }
      textarea {
        min-height: 110px;
      }
      button {
        width: fit-content;
        border: 0;
        border-radius: 7px;
        background: #18181b;
        color: white;
        cursor: pointer;
        font: inherit;
        font-weight: 700;
        padding: 10px 14px;
      }
      .hint {
        color: #71717a;
        font-size: 13px;
        font-weight: 400;
      }
    </style>
  </head>
  <body>
    <main>
      <p class="hint">Local JobFlow demo page. Use this page for manual QA only.</p>
      <h1>Frontend Engineer</h1>
      <p>JobFlow Demo Co is hiring a frontend engineer for local AI workflow tools.</p>
      <form
        action="/demo/submitted"
        data-jobflow-demo="application"
        enctype="multipart/form-data"
        method="post"
      >
        <label for="first_name">
          First name
          <input id="first_name" name="first_name" autocomplete="given-name" required />
        </label>
        <label for="last_name">
          Last name
          <input id="last_name" name="last_name" autocomplete="family-name" required />
        </label>
        <label for="email">
          Email
          <input id="email" name="email" type="email" autocomplete="email" required />
        </label>
        <label for="phone">
          Phone number
          <input id="phone" name="phone" type="tel" autocomplete="tel" />
        </label>
        <label for="linkedin">
          LinkedIn profile
          <input id="linkedin" name="linkedin" type="url" />
        </label>
        <label for="resume">
          Resume
          <input id="resume" name="resume" type="file" required />
        </label>
        <label for="motivation">
          Why are you interested in this role?
          <textarea id="motivation" name="motivation" required></textarea>
          <span class="hint">This should come from answer bank or profile facts.</span>
        </label>
        <label for="sponsorship">
          Will you now or in the future require sponsorship?
          <select id="sponsorship" name="sponsorship" required>
            <option>Select</option>
            <option>No</option>
            <option>Yes</option>
          </select>
        </label>
        <label for="authorized">
          Are you authorized to work in the United States?
          <select id="authorized" name="authorized" required>
            <option>Select</option>
            <option>Yes</option>
            <option>No</option>
          </select>
        </label>
        <label for="salary">
          Desired salary
          <input id="salary" name="salary" />
          <span class="hint">This should pause unless the salary policy allows it.</span>
        </label>
        <button type="submit">Submit application manually</button>
      </form>
    </main>
  </body>
</html>
"""


DEMO_SUBMITTED_HTML = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Application Submitted - JobFlow Demo Co</title>
    <style>
      body {
        margin: 0;
        background: #f7f7f8;
        color: #18181b;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        margin: 0 auto;
        max-width: 720px;
        padding: 56px 20px;
      }
      section {
        border: 1px solid #d4d4d8;
        border-radius: 10px;
        background: white;
        padding: 24px;
      }
      .signal {
        color: #166534;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main>
      <section data-jobflow-demo="submitted">
        <p class="signal">Application submitted</p>
        <h1>Frontend Engineer</h1>
        <p>Thank you for applying. We received your application.</p>
        <p>You can now return to JobFlow and click Detect Success.</p>
      </section>
    </main>
  </body>
</html>
"""
