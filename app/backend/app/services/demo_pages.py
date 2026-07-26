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
        <label for="current_company">
          Current company
          <input id="current_company" name="current_company" />
        </label>
        <label for="university">
          University
          <input id="university" name="university" />
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
        <label for="source">
          Please tell us how you heard about this opportunity.
          <textarea id="source" name="source"></textarea>
        </label>
        <label for="disability">
          Disability status
          <select id="disability" name="disability">
            <option>Select one</option>
            <option>Yes, I have a disability</option>
            <option>No, I do not have a disability</option>
            <option>I do not wish to answer</option>
          </select>
        </label>
        <label for="veteran">
          Veteran status
          <select id="veteran" name="veteran">
            <option>Select one</option>
            <option>I am not a protected veteran</option>
            <option>I identify as one or more classifications of protected veteran</option>
            <option>I do not wish to answer</option>
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


DEMO_GREENHOUSE_APPLICATION_HTML = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Backend Engineer - Example Robotics</title>
  </head>
  <body data-ats="greenhouse">
    <main id="main">
      <p>Local Greenhouse-style JobFlow demo page.</p>
      <h1>Backend Engineer</h1>
      <form id="application_form" action="/demo/submitted" method="post" enctype="multipart/form-data">
        <label for="first_name">First Name</label>
        <input id="first_name" name="first_name" required />

        <label for="last_name">Last Name</label>
        <input id="last_name" name="last_name" required />

        <label for="email">Email</label>
        <input id="email" name="email" type="email" required />

        <label for="phone">Phone</label>
        <input id="phone" name="phone" type="tel" />

        <label id="authorized-label" for="authorized">Are you authorized to work in the United States?</label>
        <input id="authorized" role="combobox" aria-labelledby="authorized-label" data-options="Yes|No" required />
        <div role="listbox" aria-label="Authorization options">
          <button role="option" type="button" data-value="Yes">Yes</button>
          <button role="option" type="button" data-value="No">No</button>
        </div>

        <label for="resume">Resume/CV</label>
        <input id="resume" name="resume" type="file" required />

        <label for="question_123">Why are you interested in this role?</label>
        <textarea id="question_123" name="question_123"></textarea>

        <button type="submit">Submit application manually</button>
      </form>
      <script>
        document.querySelectorAll('[role="option"]').forEach((option) => {
          option.addEventListener('click', () => {
            document.querySelector('#authorized').value = option.dataset.value;
          });
        });
      </script>
    </main>
  </body>
</html>
"""


DEMO_ASHBY_APPLICATION_HTML = """<!doctype html>
<html lang="en">
  <head><title>Product Engineer - Ashby Demo Co</title></head>
  <body data-ashby-page="application">
    <main>
      <h1>Product Engineer</h1>
      <form class="ashby-application-form" action="/demo/ashby/submitted" method="post" enctype="multipart/form-data">
        <div class="ashby-application-form-field-entry" data-field-path="_systemfield_name">
          <label for="_systemfield_name">Name</label>
          <input id="_systemfield_name" name="_systemfield_name" required />
        </div>
        <div class="ashby-application-form-field-entry" data-field-path="_systemfield_email">
          <label for="_systemfield_email">Email</label>
          <input id="_systemfield_email" name="_systemfield_email" type="email" required />
        </div>
        <div class="ashby-application-form-field-entry" data-field-path="_systemfield_resume">
          <label for="_systemfield_resume">Resume</label>
          <input id="_systemfield_resume" type="file" />
        </div>
        <div class="ashby-application-form-field-entry" data-field-path="sponsorship">
          <label>Will you require sponsorship?</label>
          <input type="checkbox" aria-hidden="true" />
          <button type="button" data-value="Yes">Yes</button>
          <button type="button" data-value="No">No</button>
        </div>
        <div class="ashby-application-form-field-entry" data-field-path="motivation">
          <label for="motivation">Why are you interested in this role?</label>
          <textarea id="motivation" name="motivation"></textarea>
        </div>
        <button type="submit">Submit Application</button>
      </form>
      <script>
        document.querySelectorAll('[data-field-path="sponsorship"] button').forEach((button) => {
          button.addEventListener('click', () => {
            document.querySelectorAll('[data-field-path="sponsorship"] button').forEach((item) => item.setAttribute('aria-pressed', 'false'));
            button.setAttribute('aria-pressed', 'true');
          });
        });
      </script>
    </main>
  </body>
</html>
"""


DEMO_ORACLE_APPLICATION_HTML = """<!doctype html>
<html lang="en">
  <head><title>Cloud Engineer - Oracle Demo Co</title></head>
  <body class="oracle-recruiting">
    <main data-page="quick-email-verification">
      <h1>Cloud Engineer</h1>
      <p>Oracle Recruiting local demo.</p>
      <form action="/demo/oracle/submitted" method="post" enctype="multipart/form-data">
        <label for="primary-email-0">Email Address</label>
        <input id="primary-email-0" name="primary-email" type="email" aria-required="true" />
        <label for="linkedin">LinkedIn Profile</label>
        <input id="linkedin" name="linkedin" />
        <label for="resume">Upload Resume</label>
        <input id="resume" name="resume" type="file" />
        <label for="legal-disclaimer-checkbox">I have read the Important Privacy Information</label>
        <input id="legal-disclaimer-checkbox" type="checkbox" />
        <input id="honey-pot-1" name="honey-pot" aria-label="honeypot" />
        <textarea id="g-recaptcha-response" name="g-recaptcha-response"></textarea>
        <button type="submit">Next</button>
      </form>
    </main>
  </body>
</html>
"""


DEMO_WORKDAY_APPLICATION_HTML = """<!doctype html>
<html lang="en">
  <head><title>Software Engineer - Workday Demo Co</title></head>
  <body>
    <main data-automation-id="applyFlowPage">
      <h1 data-automation-id="jobTitleHeading">Software Engineer</h1>
      <ol data-automation-id="progressBar"><li data-automation-id="progressBarActiveStep">current step 2 of 6</li></ol>
      <form action="/demo/workday/submitted" method="post">
        <div data-automation-id="formField-name">
          <label for="workday-name">Full Legal Name</label>
          <input id="workday-name" data-automation-id="name" required />
        </div>
        <div data-automation-id="formField-email">
          <label for="workday-email">Email Address</label>
          <input id="workday-email" data-automation-id="email" type="email" required />
        </div>
        <div data-automation-id="formField-phone">
          <label for="workday-phone">Phone Number</label>
          <input id="workday-phone" data-automation-id="phone" type="tel" />
        </div>
        <div data-automation-id="formField-sponsorship">
          <label for="workday-sponsorship">Will you require sponsorship?</label>
          <select id="workday-sponsorship" data-automation-id="sponsorship">
            <option>Select one</option><option>No</option><option>Yes</option>
          </select>
        </div>
        <div data-automation-id="formField-password">
          <label for="workday-password">Password</label>
          <input id="workday-password" data-automation-id="password" type="password" required />
        </div>
        <input data-automation-id="beecatcher" name="website" />
        <button type="submit">Save and Continue</button>
      </form>
    </main>
  </body>
</html>
"""


DEMO_ATS_SUBMITTED_HTML = {
    "greenhouse": "<html><body data-ats='greenhouse'><h1>Application complete</h1><p>We've received your application.</p></body></html>",
    "ashby": "<html><body data-ashby-page='application'><h1>Application complete</h1><p>Application submitted successfully.</p></body></html>",
    "oracle": "<html><body class='oracle-recruiting'><h1>Application complete</h1><p>Your application was submitted.</p></body></html>",
    "workday": "<html><body data-automation-id='applyFlowPage'><h1>Application complete</h1><p>You've successfully submitted your application.</p></body></html>",
}


DEMO_LEVER_APPLICATION_HTML = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Frontend Engineer - Example Analytics</title>
  </head>
  <body>
    <main class="application-page">
      <p>Local Lever-style JobFlow demo page.</p>
      <h1>Frontend Engineer</h1>
      <form class="application-form" action="/demo/submitted" method="post" enctype="multipart/form-data">
        <label for="name">Full name</label>
        <input id="name" name="name" required />

        <label for="email">Email</label>
        <input id="email" name="email" type="email" required />

        <label for="phone">Phone</label>
        <input id="phone" name="phone" type="tel" />

        <fieldset>
          <legend>Are you authorized to work in the United States?</legend>
          <label for="authorized_yes">Yes</label>
          <input id="authorized_yes" name="authorized" type="radio" value="Yes" />
          <label for="authorized_no">No</label>
          <input id="authorized_no" name="authorized" type="radio" value="No" />
        </fieldset>

        <label for="urls[LinkedIn]">LinkedIn</label>
        <input id="urls[LinkedIn]" name="urls[LinkedIn]" />

        <label for="resume">Resume</label>
        <input id="resume" name="resume" type="file" required />

        <label for="comments">Additional information</label>
        <textarea id="comments" name="comments"></textarea>

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
