(function initializeJobFlowDOM(globalObject) {
  const CAPTCHA_SELECTORS = [
    'iframe[src*="captcha" i]',
    'iframe[title*="captcha" i]',
    '[class*="captcha" i]',
    '[id*="captcha" i]',
    '[data-sitekey]',
  ];

  const US_STATE_NAMES = {
    AL: "Alabama",
    AK: "Alaska",
    AZ: "Arizona",
    AR: "Arkansas",
    CA: "California",
    CO: "Colorado",
    CT: "Connecticut",
    DE: "Delaware",
    FL: "Florida",
    GA: "Georgia",
    HI: "Hawaii",
    ID: "Idaho",
    IL: "Illinois",
    IN: "Indiana",
    IA: "Iowa",
    KS: "Kansas",
    KY: "Kentucky",
    LA: "Louisiana",
    ME: "Maine",
    MD: "Maryland",
    MA: "Massachusetts",
    MI: "Michigan",
    MN: "Minnesota",
    MS: "Mississippi",
    MO: "Missouri",
    MT: "Montana",
    NE: "Nebraska",
    NV: "Nevada",
    NH: "New Hampshire",
    NJ: "New Jersey",
    NM: "New Mexico",
    NY: "New York",
    NC: "North Carolina",
    ND: "North Dakota",
    OH: "Ohio",
    OK: "Oklahoma",
    OR: "Oregon",
    PA: "Pennsylvania",
    RI: "Rhode Island",
    SC: "South Carolina",
    SD: "South Dakota",
    TN: "Tennessee",
    TX: "Texas",
    UT: "Utah",
    VT: "Vermont",
    VA: "Virginia",
    WA: "Washington",
    WV: "West Virginia",
    WI: "Wisconsin",
    WY: "Wyoming",
    DC: "District of Columbia",
  };

  const ATS_CONFIGS = {
    greenhouse: {
      hosts: ["greenhouse.io"],
      root: ["#application_form", "form", "main"],
      container: "fieldset, [data-field], [class*='field']",
      identity: ["name", "id"],
    },
    ashby: {
      hosts: ["ashbyhq.com"],
      root: [".ashby-application-form", "form", "[role='tabpanel']"],
      container: ".ashby-application-form-field-entry, [data-field-path]",
      identity: ["data-field-path", "name", "id"],
      aliases: {
        _systemfield_name: "name",
        _systemfield_email: "email",
        _systemfield_resume: "resume",
      },
    },
    oracle: {
      hosts: ["oraclecloud.com", "taleo.net"],
      root: ["quick-email-verification-form", "[data-page]", "main", "form"],
      container: ".input-row, [data-automation-id^='formField'], form",
      identity: ["data-automation-id", "name", "id"],
      aliases: { "primary-email": "email", "primary-email-0": "email" },
    },
    workday: {
      hosts: ["myworkdayjobs.com", "workdayjobs.com"],
      root: [
        "[data-automation-id='applyFlowPage']",
        "[data-automation-id='jobApplicationPage']",
        "main",
        "form",
      ],
      container: "[data-automation-id^='formField'], form",
      identity: ["data-automation-id", "name", "id"],
    },
    lever: {
      hosts: ["lever.co"],
      root: ["form", "main"],
      container: ".application-question, .application-field, fieldset, form",
      identity: ["name", "id"],
    },
    rippling: {
      hosts: ["ats.rippling.com"],
      root: ["form", "main", "body"],
      container: "fieldset, [class*='field'], form, main",
      identity: ["data-testid", "name", "id"],
    },
  };

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function escapeAttribute(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function captchaPresent(documentObject) {
    if (CAPTCHA_SELECTORS.some((selector) => documentObject.querySelector(selector))) {
      return true;
    }
    return /verify you are human|security verification|complete the captcha/i.test(
      clean(documentObject.body && documentObject.body.textContent),
    );
  }

  function eligiblePlanItems(plan, captchaDetected = false) {
    return (plan && plan.items ? plan.items : []).filter(
      (item) =>
        item.action !== "skip" &&
        !item.needs_review &&
        Number(item.confidence) >= 0.85 &&
        Array.isArray(item.source_refs) &&
        item.source_refs.length > 0,
    );
  }

  function detectAts(url, documentObject) {
    const haystack = `${url || ""} ${documentObject.documentElement?.innerHTML || ""}`.toLowerCase();
    for (const [name, config] of Object.entries(ATS_CONFIGS)) {
      if (config.hosts.some((host) => haystack.includes(host))) return name;
    }
    return "generic";
  }

  function firstMatch(documentObject, selectors) {
    for (const selector of selectors || []) {
      const element = documentObject.querySelector(selector);
      if (element) return element;
    }
    return documentObject;
  }

  function fieldType(control) {
    const tag = control.tagName.toLowerCase();
    const type = clean(control.getAttribute("type")).toLowerCase();
    const role = clean(control.getAttribute("role")).toLowerCase();
    const popup = clean(control.getAttribute("aria-haspopup")).toLowerCase();
    if (role === "combobox" || popup === "listbox" || tag === "select") {
      return "select";
    }
    if (tag === "textarea") return "textarea";
    if (type === "url") return "text";
    if (["email", "tel", "radio", "checkbox", "file", "text"].includes(type)) {
      return type;
    }
    return type ? "unknown" : "text";
  }

  function ignoredNativeControlType(control) {
    const type = clean(control.getAttribute("type")).toLowerCase();
    const role = clean(control.getAttribute("role")).toLowerCase();
    const popup = clean(control.getAttribute("aria-haspopup")).toLowerCase();
    if (["hidden", "submit", "reset", "search"].includes(type)) return true;
    return type === "button" && role !== "combobox" && popup !== "listbox";
  }

  function labelledByText(control, documentObject) {
    const labelledBy = clean(control.getAttribute("aria-labelledby"));
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => clean(documentObject.getElementById(id)?.textContent))
        .filter(Boolean)
        .join(" ");
      if (text) return text;
    }
    return "";
  }

  function labelFor(control, container, documentObject) {
    const aria = clean(control.getAttribute("aria-label"));
    if (aria) return aria;
    const labelledBy = labelledByText(control, documentObject);
    if (labelledBy) return labelledBy;
    if (control.id) {
      const explicit = Array.from(documentObject.querySelectorAll("label")).find(
        (label) => label.htmlFor === control.id,
      );
      if (explicit) return clean(explicit.textContent);
    }
    const nearby = container?.querySelector(
      "legend, label, [data-automation-id^='formLabel'], [class*='label'], [class*='question-title']",
    );
    return (
      clean(nearby?.textContent) ||
      clean(control.getAttribute("placeholder")) ||
      clean(control.getAttribute("name")) ||
      clean(control.id)
    );
  }

  function ripplingLabelFor(control, container, documentObject) {
    const labelledBy = labelledByText(control, documentObject);
    if (labelledBy) return labelledBy;
    const testId = clean(control.getAttribute("data-testid")).toLowerCase();
    const labels = {
      "input-resume": "Resume",
      "input-first_name": "First name",
      "input-last_name": "Last name",
      "input-email": "Email",
      "input-current_company": "Current company",
      "input-phone_number": "Phone number",
      "input-cover_letter": "Cover letter",
    };
    return labels[testId] || labelFor(control, container, documentObject);
  }

  function workdayQuestionContext(control) {
    let candidate = control.parentElement;
    for (let depth = 0; candidate && depth < 7; depth += 1) {
      const listboxButtons = Array.from(
        candidate.querySelectorAll?.(
          "button[aria-haspopup='listbox'], [role='button'][aria-haspopup='listbox']",
        ) || [],
      );
      if (listboxButtons.length === 1 && listboxButtons[0] === control) {
        const question = Array.from(
          candidate.querySelectorAll?.(
            "p, label, legend, [data-automation-id^='formLabel'], [class*='question']",
          ) || [],
        )
          .filter(
            (node) =>
              !control.contains?.(node) &&
              !node.closest?.("button[aria-haspopup='listbox']"),
          )
          .map((node) => clean(node.textContent))
          .find(
            (text) =>
              text &&
              !/^(?:select one|required|\*)$/i.test(text) &&
              !/^error\b/i.test(text),
          );
        if (question) {
          return {
            container: candidate,
            label: question.replace(/\s*\*+\s*$/, ""),
            required:
              /\*\s*$/.test(question) ||
              /\brequired\b/i.test(clean(control.getAttribute("aria-label"))) ||
              control.getAttribute("aria-required") === "true" ||
              Boolean(
                candidate.querySelector?.(
                  "[required], [aria-required='true']",
                ),
              ),
          };
        }
      }
      candidate = candidate.parentElement;
    }
    return null;
  }

  function selectorFor(control, config, fieldId) {
    for (const attribute of config.identity || []) {
      const value = clean(control.getAttribute(attribute));
      if (value) return `[${attribute}="${escapeAttribute(value)}"]`;
    }
    return `[data-jobflow-field="${escapeAttribute(fieldId)}"]`;
  }

  function ripplingFieldId(control, label, fallback) {
    const testId = clean(control.getAttribute("data-testid")).toLowerCase();
    const normalizedLabel = clean(label).toLowerCase();
    const testIdAliases = {
      "input-resume": "resume",
      "input-first_name": "first_name",
      "input-last_name": "last_name",
      "input-email": "email",
      "input-current_company": "company",
      "input-phone_number": "phone",
      "input-cover_letter": "cover_letter",
      "radio-sms_opt_in": "sms_opt_in",
    };
    if (testIdAliases[testId]) return testIdAliases[testId];
    if (/^pronouns?\b/.test(normalizedLabel)) return "pronouns";
    if (/\brace\b/.test(normalizedLabel)) return "race";
    if (/hispanic|latino/.test(normalizedLabel)) return "hispanic_latino";
    if (/\bgender\b/.test(normalizedLabel)) return "gender";
    if (/\bveteran\b/.test(normalizedLabel)) return "veteran_status";
    if (/\bdisability\b/.test(normalizedLabel)) return "disability_status";
    if (/^location\b/.test(normalizedLabel)) return "location";
    if (testId === "input-select-search-input" && normalizedLabel === "search") {
      return "";
    }
    return fallback;
  }

  function ashbyRadioGroup(control, documentObject) {
    const container = control.closest("[data-field-path]");
    if (!container) return null;
    const path = clean(container.getAttribute("data-field-path"));
    const name = clean(control.getAttribute("name"));
    const controls = name
      ? Array.from(
          documentObject.querySelectorAll(
            `input[type="radio"][name="${escapeAttribute(name)}"]`,
          ),
        )
      : [control];
    const options = controls
      .map((candidate) => labelFor(candidate, container, documentObject))
      .filter(Boolean);
    const heading = container.querySelector(
      ".ashby-application-form-question-title, legend",
    );
    return {
      container,
      fieldId: path || name || clean(control.id),
      label: clean(heading?.textContent) || labelFor(control, container, documentObject),
      options: [...new Set(options)],
      selector: path
        ? `[data-field-path="${escapeAttribute(path)}"]`
        : `input[type="radio"][name="${escapeAttribute(name)}"]`,
    };
  }

  function sensitiveField(text) {
    return /(gender|race|ethnicity|hispanic|latino|veteran|disability|sponsorship|visa|authoriz|salary|compensation|relocation|birth|ssn)/i.test(
      text,
    );
  }

  const WORKDAY_REPEATERS = [
    {
      fieldId: "jobflow-workday-work-experience",
      label: "Work Experience",
    },
    {
      fieldId: "jobflow-workday-education",
      label: "Education",
    },
    {
      fieldId: "jobflow-workday-certifications",
      label: "Certifications",
    },
    {
      fieldId: "jobflow-workday-websites",
      label: "Websites",
    },
  ];

  function workdaySectionForHeading(heading) {
    let candidate = heading?.parentElement || null;
    for (let depth = 0; candidate && depth < 7; depth += 1) {
      const hasAddButton = Array.from(candidate.querySelectorAll?.("button") || []).some(
        (button) => /^(?:add|add another)$/i.test(clean(button.textContent)),
      );
      if (hasAddButton) return candidate;
      candidate = candidate.parentElement;
    }
    return null;
  }

  function workdayRepeaterFields(root) {
    const headings = Array.from(
      root.querySelectorAll?.("h1, h2, h3, h4, h5, h6, [role='heading']") || [],
    );
    return WORKDAY_REPEATERS.flatMap((definition) => {
      const heading = headings.find(
        (candidate) =>
          clean(candidate.textContent).toLowerCase() === definition.label.toLowerCase(),
      );
      const section = workdaySectionForHeading(heading);
      if (!section) return [];
      section.setAttribute?.("data-jobflow-workday-repeater", definition.fieldId);
      return [
        {
          field_id: definition.fieldId,
          label: definition.label,
          type: "unknown",
          required: false,
          options: [],
          placeholder: "",
          helper_text: "",
          selector: `[data-jobflow-workday-repeater="${definition.fieldId}"]`,
          sensitive: false,
        },
      ];
    });
  }

  function recordHints(documentObject, ats, url) {
    const pageTitle = clean(documentObject.title);
    const heading = clean(documentObject.querySelector("h1, h2")?.textContent);
    let company = "";
    let jobTitle = heading;
    if (ats === "rippling") {
      const parts = pageTitle
        .replace(/^apply\s+-\s+/i, "")
        .split(" - ")
        .map(clean)
        .filter(Boolean);
      if (parts.length >= 2) {
        company = parts.pop() || "";
        jobTitle = parts.join(" - ");
      }
    }
    const applicationMatch = pageTitle.match(/job application for\s+(.+?)\s+at\s+(.+)/i);
    if (!company && applicationMatch) {
      jobTitle ||= clean(applicationMatch[1]);
      company = clean(applicationMatch[2]);
    } else if (!company && pageTitle.includes(" - ")) {
      const parts = pageTitle.split(" - ").map(clean).filter(Boolean);
      jobTitle ||= parts[0] || "";
      company = parts.slice(1).join(" - ");
    }
    if (!company && ats === "oracle") {
      const match = location.pathname.match(/\/sites\/([^/]+)/i);
      if (match) company = decodeURIComponent(match[1]).replace(/[-_]+/g, " ");
    }
    if (!company && ats === "ashby") {
      try {
        const parsed = new URL(url);
        const segment = parsed.pathname.split("/").filter(Boolean)[0];
        if (segment && segment.toLowerCase() !== "application") {
          company = decodeURIComponent(segment)
            .replace(/[-_]+/g, " ")
            .replace(/\b\w/g, (letter) => letter.toUpperCase());
        }
      } catch {
        // Keep the company hint empty when the active frame URL is malformed.
      }
    }
    if (ats === "workday") {
      if (!jobTitle || /^careers?\s+at\b/i.test(jobTitle)) {
        jobTitle = pageTitle;
      }
      if (!company) {
        try {
          const parsed = new URL(url);
          const segments = parsed.pathname.split("/").filter(Boolean);
          const localeIndex = segments.findIndex((segment) =>
            /^[a-z]{2}-[a-z]{2}$/i.test(segment),
          );
          const tenant = segments[localeIndex + 1] || "";
          if (tenant && tenant.toLowerCase() !== "job") {
            company = decodeURIComponent(tenant).replace(/[-_]+/g, " ");
          }
        } catch {
          // Keep hints empty when a Workday tenant URL is malformed.
        }
      }
    }
    return { company, jobTitle };
  }

  function extractForm(documentObject = document, url = location.href) {
    const ats = detectAts(url, documentObject);
    const config = ATS_CONFIGS[ats] || {
      root: ["form", "main", "body"],
      container: "fieldset, [class*='field'], form",
      identity: ["name", "id"],
      aliases: {},
    };
    const root = firstMatch(documentObject, config.root);
    const fields = [];
    const byId = new Map();
    if (ats === "ashby") {
      for (const container of root.querySelectorAll("[data-field-path]")) {
        const path = clean(container.getAttribute("data-field-path"));
        const choices = Array.from(container.querySelectorAll("button"))
          .map((button) => clean(button.textContent))
          .filter((value) => ["yes", "no"].includes(value.toLowerCase()));
        if (!path || choices.length < 2) continue;
        const fieldId = config.aliases?.[path] || path;
        const label = clean(
          container.querySelector(
            ".ashby-application-form-question-title, legend, label, [class*='label']",
          )?.textContent,
        );
        const field = {
          field_id: fieldId,
          label: label || fieldId,
          type: "radio",
          required: Boolean(container.querySelector('[required], [aria-required="true"]')),
          options: [...new Set(choices)],
          placeholder: "",
          helper_text: "",
          selector: `[data-field-path="${escapeAttribute(path)}"]`,
          sensitive: sensitiveField(`${fieldId} ${label}`),
        };
        byId.set(fieldId, field);
        fields.push(field);
      }
    }
    const workdayRepeaters =
      ats === "workday" ? workdayRepeaterFields(root) : [];
    const controls = Array.from(
      root.querySelectorAll(
        "input, textarea, select, [role='combobox'], " +
          "button[aria-haspopup='listbox'], [role='button'][aria-haspopup='listbox']",
      ),
    );
    controls.forEach((control, index) => {
      if (ignoredNativeControlType(control)) return;
      if (
        ats === "workday" &&
        control.closest?.("[data-jobflow-workday-repeater]")
      ) {
        return;
      }
      if (control.disabled || /captcha|honeypot|beecatcher/i.test(`${control.id} ${control.name}`)) return;
      const type = fieldType(control);
      const radioGroup =
        ats === "ashby" && type === "radio"
          ? ashbyRadioGroup(control, documentObject)
          : null;
      const workdayQuestion =
        ats === "workday" && type === "select"
          ? workdayQuestionContext(control)
          : null;
      const container =
        radioGroup?.container ||
        workdayQuestion?.container ||
        control.closest(config.container);
      const rawId =
        radioGroup?.fieldId ||
        (config.identity || []).map((attr) => clean(control.getAttribute(attr))).find(Boolean) ||
        `field_${index}`;
      const label =
        radioGroup?.label ||
        workdayQuestion?.label ||
        (ats === "rippling"
          ? ripplingLabelFor(control, container, documentObject)
          : labelFor(control, container, documentObject)) ||
        (ats === "rippling" && rawId === "input-resume" ? "Resume" : "");
      const aliasedId = (config.aliases && config.aliases[rawId]) || rawId;
      const fieldId =
        ats === "rippling"
          ? ripplingFieldId(control, label, aliasedId)
          : aliasedId;
      if (!label || fieldId.startsWith("field_")) return;
      if (!fieldId) return;
      if (ats === "rippling") {
        control.setAttribute("data-jobflow-field", fieldId);
      }
      const options =
        radioGroup?.options ||
        (type === "select"
          ? Array.from(control.querySelectorAll("option"))
              .map((option) => clean(option.value || option.textContent))
              .filter(Boolean)
          : type === "radio"
            ? [clean(control.value || label)].filter(Boolean)
            : []);
      const existing = byId.get(fieldId);
      if (existing && type === "radio") {
        for (const option of options) {
          if (!existing.options.includes(option)) existing.options.push(option);
        }
        return;
      }
      if (existing) return;
      const field = {
        field_id: fieldId,
        label,
        type,
        required:
          Boolean(workdayQuestion?.required) ||
          Boolean(control.required) ||
          control.getAttribute("aria-required") === "true",
        options,
        placeholder: clean(control.getAttribute("placeholder")),
        helper_text: clean(control.getAttribute("title")),
        selector:
          radioGroup?.selector ||
          (ats === "rippling"
            ? `[data-jobflow-field="${escapeAttribute(fieldId)}"]`
            : selectorFor(control, config, fieldId)),
        sensitive: sensitiveField(
          ats === "workday" && clean(label).toLowerCase() === "language"
            ? label
            : `${fieldId} ${label}`,
        ),
      };
      byId.set(fieldId, field);
      fields.push(field);
    });
    if (ats === "workday") {
      for (const field of workdayRepeaters) {
        if (byId.has(field.field_id)) continue;
        byId.set(field.field_id, field);
        fields.push(field);
      }
    }
    const hints = recordHints(documentObject, ats, url);
    return {
      url,
      ats,
      company_name_hint: hints.company,
      job_title_hint: hints.jobTitle,
      fields,
    };
  }

  function dispatchInput(element, blur = true, change = blur) {
    const InputEventConstructor =
      element.ownerDocument?.defaultView?.InputEvent ||
      globalObject.InputEvent;
    const inputEvent = InputEventConstructor
      ? new InputEventConstructor("input", {
          bubbles: true,
          data: clean(element.value),
          inputType: "insertText",
        })
      : new Event("input", { bubbles: true });
    element.dispatchEvent(inputEvent);
    if (change) element.dispatchEvent(new Event("change", { bubbles: true }));
    if (blur) element.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function setNativeValue(element, value, blur = true) {
    const view = element.ownerDocument?.defaultView || globalThis;
    const Textarea = view.HTMLTextAreaElement;
    const Input = view.HTMLInputElement;
    const prototype =
      Textarea && element instanceof Textarea
        ? Textarea.prototype
        : Input && element instanceof Input
          ? Input.prototype
          : null;
    const setter = prototype
      ? Object.getOwnPropertyDescriptor(prototype, "value")?.set
      : null;
    if (setter) setter.call(element, value);
    else element.value = value;
    dispatchInput(element, blur, blur);
  }

  function textValueMatches(actualValue, expectedValue) {
    const actual = clean(actualValue).toLowerCase();
    const expected = clean(expectedValue).toLowerCase();
    if (!actual || !expected) return actual === expected;
    const actualDigits = actual.replace(/\D/g, "");
    const expectedDigits = expected.replace(/\D/g, "");
    if (
      expectedDigits.length >= 7 &&
      actualDigits.length >= expectedDigits.length &&
      actualDigits.endsWith(expectedDigits)
    ) {
      return true;
    }
    return actual === expected || (expected.length >= 3 && actual.includes(expected));
  }

  function boolValue(value) {
    return typeof value === "boolean"
      ? value
      : ["true", "yes", "1", "checked", "on"].includes(clean(value).toLowerCase());
  }

  function decodeDocumentPayload(payload) {
    if (!payload?.base64) throw new Error("Local document payload is empty.");
    const binary = atob(payload.base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return {
      bytes,
      filename: payload.filename || "resume.pdf",
      type: payload.type || "application/octet-stream",
    };
  }

  function uploadedResumePresent(element, documentObject) {
    if (element.files?.length) return true;
    const candidates = [];
    const seen = new Set();
    let current = element.parentElement;
    for (let depth = 0; current && depth < 10; depth += 1) {
      if (!seen.has(current)) {
        candidates.push(current);
        seen.add(current);
      }
      current = current.parentElement;
    }
    if (documentObject.body && !seen.has(documentObject.body)) {
      candidates.push(documentObject.body);
    }
    return candidates.some((candidate) => {
      const text = clean(candidate.innerText || candidate.textContent);
      if (
        /resume(?:\s*\/\s*cv)?/i.test(text) &&
        /successfully uploaded/i.test(text)
      ) {
        return true;
      }
      return Array.from(candidate.querySelectorAll?.("button") || []).some(
        (button) => {
          const label = clean(
            button.getAttribute?.("aria-label") ||
              button.getAttribute?.("title") ||
              button.textContent,
          );
          return (
            /\bdelete\b/i.test(label) &&
            /\.(?:pdf|docx?|rtf)\b/i.test(label)
          );
        },
      );
    });
  }

  async function uploadFile(element, sourceUrl, documentObject) {
    if (uploadedResumePresent(element, documentObject)) return true;
    const response = await chrome.runtime.sendMessage({
      type: "jobflow.fetch_document",
      url: String(sourceUrl),
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Local document read failed.");
    }
    const documentPayload = decodeDocumentPayload(response.payload);
    const file = new File([documentPayload.bytes], documentPayload.filename, {
      type: documentPayload.type,
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    element.files = transfer.files;
    const selectedFile = element.files?.[0];
    const browserAcceptedFile =
      Boolean(selectedFile) &&
      selectedFile.name === documentPayload.filename &&
      selectedFile.size === documentPayload.bytes.byteLength;
    if (!browserAcceptedFile) {
      throw new Error("Browser did not accept the local document.");
    }
    dispatchInput(element);
    return true;
  }

  function choiceButtonSelected(button) {
    const state =
      `${button.getAttribute("aria-pressed") || ""} ` +
      `${button.getAttribute("aria-checked") || ""} ` +
      `${button.getAttribute("data-state") || ""}`.toLowerCase();
    if (
      state.includes("true") ||
      state.includes("checked") ||
      state.includes("selected")
    ) {
      return true;
    }
    return String(button.className || "")
      .split(/\s+/)
      .some((token) => /(^|[_-])active([_-]|$)/i.test(token));
  }

  function choiceTextMatches(actualValue, expectedValue) {
    const normalizeContractions = (value) =>
      clean(value)
        .toLowerCase()
        .replace(/[’]/g, "'")
        .replace(/\bdon't\b/g, "do not")
        .replace(/\bdoesn't\b/g, "does not")
        .replace(/\bdidn't\b/g, "did not")
        .replace(/\bcan't\b/g, "cannot")
        .replace(/\bwon't\b/g, "will not");
    const actual = normalizeContractions(actualValue);
    const expected = normalizeContractions(expectedValue);
    if (actual === expected) return true;
    if (!expected || !actual.startsWith(expected)) return false;
    return /^\s*[\(\[\{,;:/-]/.test(actual.slice(expected.length));
  }

  function workdaySearchTextMatches(actualValue, expectedValue) {
    return Number.isFinite(
      workdaySearchMatchRank(actualValue, expectedValue),
    );
  }

  function workdaySearchMatchRank(actualValue, expectedValue) {
    const actual = clean(actualValue).toLowerCase();
    const expected = clean(expectedValue).toLowerCase();
    if (!actual || !expected) return Number.POSITIVE_INFINITY;
    if (actual === expected) return 0;
    const normalizedActual = actual.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const normalizedExpected = expected.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (normalizedActual === normalizedExpected) return 1;
    const escapedExpected = expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (
      new RegExp(
        `^[a-z0-9&.]{2,12}\\s*[-–—]\\s*${escapedExpected}$`,
        "i",
      ).test(actual)
    ) {
      return 2;
    }
    if (expected.length >= 4 && actual.endsWith(expected)) return 3;
    if (expected.length >= 4 && actual.includes(expected)) return 4;
    return Number.POSITIVE_INFINITY;
  }

  function bestWorkdaySearchOption(options, expectedValues) {
    let best = null;
    let bestRank = Number.POSITIVE_INFINITY;
    for (const option of options) {
      const actual =
        option.getAttribute?.("data-automation-label") ||
        option.textContent;
      for (const expected of expectedValues) {
        const rank = workdaySearchMatchRank(actual, expected);
        if (rank >= bestRank) continue;
        best = option;
        bestRank = rank;
      }
    }
    return best;
  }

  const DEGREE_ALIAS_GROUPS = [
    {
      values: ["associate's degree", "associates degree", "associate degree", "aa", "as"],
      options: [
        "associate's degree",
        "associates degree",
        "associate degree",
        "associate of arts",
        "associate of science",
      ],
    },
    {
      values: [
        "bachelor's degree",
        "bachelors degree",
        "bachelor degree",
        "ba",
        "bs",
        "bsc",
      ],
      options: [
        "bachelor's degree",
        "bachelors degree",
        "bachelor degree",
        "bachelor of arts",
        "bachelor of science",
      ],
    },
    {
      values: ["master's degree", "masters degree", "master degree", "ma", "ms", "msc"],
      options: [
        "master's degree",
        "masters degree",
        "master degree",
        "master of arts",
        "master of science",
      ],
    },
    {
      values: ["doctoral degree", "doctorate", "phd"],
      options: ["doctoral degree", "doctorate", "phd", "doctor of philosophy"],
    },
    {
      values: [
        "master of business administration (mba)",
        "master of business administration",
        "mba",
      ],
      options: ["master of business administration", "mba"],
    },
    {
      values: ["juris doctor (jd)", "juris doctor", "jd"],
      options: ["juris doctor", "jd"],
    },
  ];

  function choiceValueAliases(value) {
    const normalized = clean(value).toLowerCase();
    if (["true", "yes", "y", "1"].includes(normalized)) {
      return ["yes", "true"];
    }
    if (["false", "no", "n", "0"].includes(normalized)) {
      return ["no", "false"];
    }
    if (["united states", "united states of america", "usa", "us"].includes(normalized)) {
      return ["united states", "united states of america", "usa", "us"];
    }
    const degreeGroup = DEGREE_ALIAS_GROUPS.find((group) =>
      group.values.includes(normalized),
    );
    if (degreeGroup) return degreeGroup.options;
    const stateName = US_STATE_NAMES[clean(value).toUpperCase()];
    if (stateName) return [normalized, stateName.toLowerCase()];
    return [normalized];
  }

  function waitForChoiceState(documentObject, delay = 80) {
    const schedule = documentObject?.defaultView?.setTimeout || setTimeout;
    return new Promise((resolve) => schedule(resolve, delay));
  }

  async function waitForRipplingResumeProcessing(
    documentObject,
    {
      initialDelay = 2200,
      pollDelay = 250,
      stableSamples = 2,
      maxAttempts = 12,
    } = {},
  ) {
    await waitForChoiceState(documentObject, initialDelay);
    let previous = null;
    let stable = 0;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await waitForChoiceState(documentObject, pollDelay);
      const busy = /(?:uploading|processing|parsing)\s+(?:resume|résumé)/i.test(
        clean(documentObject.body?.textContent),
      );
      const signature = Array.from(
        documentObject.querySelectorAll(
          '[data-jobflow-field]:not([type="file"])',
        ),
      )
        .map((control) => clean(control.value || control.textContent))
        .join("\u001f");
      if (!busy && signature === previous) stable += 1;
      else stable = 0;
      if (stable >= stableSamples) return;
      previous = signature;
    }
  }

  function openChoiceMenu(element, documentObject) {
    element.focus?.();
    const control =
      element.closest?.(
        ".select__control, [class*='select__control'], [class*='-control']",
      ) || element;
    const MouseEventConstructor =
      documentObject?.defaultView?.MouseEvent || globalThis.MouseEvent;
    if (MouseEventConstructor && control.dispatchEvent) {
      control.dispatchEvent(
        new MouseEventConstructor("mousedown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 1,
        }),
      );
      control.dispatchEvent(
        new MouseEventConstructor("mouseup", {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
    }
    element.click();
    element.focus?.();
  }

  function choiceOptionRoots(element, documentObject) {
    const ids = [
      ...clean(element.getAttribute?.("aria-controls")).split(/\s+/),
      ...clean(element.getAttribute?.("aria-owns")).split(/\s+/),
    ].filter(Boolean);
    if (element.id) ids.push(`react-select-${element.id}-listbox`);
    const roots = ids
      .map((id) => documentObject.getElementById?.(id))
      .filter(Boolean);
    const nearbyRoot = element
      .closest?.(".select-shell, .select__container, [class*='select-container']")
      ?.querySelector?.('[role="listbox"], [id*="-listbox"], .select__menu');
    if (nearbyRoot) roots.push(nearbyRoot);
    return [...new Set(roots)];
  }

  function visibleChoiceOptions(documentObject, element) {
    const roots = choiceOptionRoots(element, documentObject);
    const optionSelector =
      '[role="option"], [id*="-option-"], .select__option, ' +
      '[data-automation-id="promptOption"]';
    let candidates = roots.length
      ? roots.flatMap((root) => Array.from(root.querySelectorAll(optionSelector)))
      : Array.from(documentObject.querySelectorAll(optionSelector));
    const multiselectId = clean(
      element.getAttribute?.("data-uxi-multiselect-id"),
    );
    if (multiselectId) {
      candidates = candidates.filter((candidate) => {
        const leaf =
          candidate.closest?.(
            '[data-automation-id="promptLeafNode"], [data-uxi-widget-type="multiselectlistitem"]',
          ) ||
          candidate.querySelector?.(
            '[data-automation-id="promptLeafNode"], [data-uxi-widget-type="multiselectlistitem"]',
          );
        return (
          leaf?.getAttribute?.("data-uxi-multiselect-id") === multiselectId
        );
      });
    }
    return candidates.filter((candidate) => {
      const view = candidate.ownerDocument?.defaultView;
      if (candidate.closest?.("[hidden], [aria-hidden='true']")) return false;
      if (candidate.closest?.('[data-automation-id="selectedItem"]')) return false;
      if (candidate.getClientRects && candidate.getClientRects().length === 0) {
        return false;
      }
      if (!view?.getComputedStyle) return true;
      const style = view.getComputedStyle(candidate);
      return style.display !== "none" && style.visibility !== "hidden";
    });
  }

  async function waitForMatchingChoice(
    documentObject,
    element,
    expectedValues,
    attempts = 20,
    matches = choiceTextMatches,
    selectMatch = null,
  ) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const options = visibleChoiceOptions(documentObject, element);
      const match = selectMatch
        ? selectMatch(options, expectedValues)
        : options.find((candidate) =>
            expectedValues.some((expected) =>
              matches(candidate.textContent, expected),
            ),
          );
      if (match) return { match, options };
      if (attempt < attempts - 1) await waitForChoiceState(documentObject, 150);
    }
    return { match: null, options: visibleChoiceOptions(documentObject, element) };
  }

  function committedChoiceText(element) {
    const direct = clean(
      element.getAttribute?.("aria-valuetext") ||
        element.getAttribute?.("data-selected-value"),
    );
    if (direct) return direct;
    const control = element.closest?.(
      ".select__control, [class*='select__control'], [class*='-control']",
    );
    return clean(
      control?.querySelector?.(
        ".select__single-value, [class*='single-value'], [class*='singleValue']",
      )?.textContent,
    );
  }

  function workdayRepeaterRows(section, label) {
    const pattern = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+\\d+$`, "i");
    const headings = Array.from(
      section.querySelectorAll?.("h1, h2, h3, h4, h5, h6, [role='heading']") || [],
    );
    return headings.flatMap((heading) => {
      if (!pattern.test(clean(heading.textContent))) return [];
      let candidate = heading.parentElement || null;
      for (let depth = 0; candidate && candidate !== section && depth < 6; depth += 1) {
        const hasDelete = Array.from(candidate.querySelectorAll?.("button") || []).some(
          (button) => /^delete$/i.test(clean(button.textContent)),
        );
        const hasFields = [
          "input",
          "textarea",
          "select",
          '[name="jobTitle"]',
          '[data-automation-id="searchBox"]',
        ].some((selector) => Boolean(candidate.querySelector?.(selector)));
        if (hasDelete && hasFields) return [candidate];
        candidate = candidate.parentElement;
      }
      return [];
    });
  }

  function workdayAddButton(section, hasRows) {
    const buttons = Array.from(section.querySelectorAll?.("button") || []);
    const preferred = hasRows ? /^add another$/i : /^add$/i;
    return (
      buttons.find((button) => preferred.test(clean(button.textContent))) ||
      buttons.find((button) => /^(?:add|add another)$/i.test(clean(button.textContent)))
    );
  }

  async function waitForWorkdayRepeaterRows(
    section,
    label,
    minimumCount,
    documentObject,
    attempts = 20,
  ) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const rows = workdayRepeaterRows(section, label);
      if (rows.length >= minimumCount) return rows;
      if (attempt < attempts - 1) {
        await waitForChoiceState(documentObject, 150);
      }
    }
    return workdayRepeaterRows(section, label);
  }

  async function ensureWorkdayRepeaterRow(section, label, index, documentObject) {
    let rows = workdayRepeaterRows(section, label);
    while (rows.length <= index) {
      const addButton = workdayAddButton(section, rows.length > 0);
      if (!addButton) throw new Error(`Workday ${label} Add button was not found.`);
      addButton.click();
      const nextRows = await waitForWorkdayRepeaterRows(
        section,
        label,
        rows.length + 1,
        documentObject,
      );
      if (nextRows.length <= rows.length) {
        throw new Error(`Workday ${label} did not add another row.`);
      }
      rows = nextRows;
    }
    return rows[index];
  }

  function setWorkdayText(control, value) {
    const expected = clean(value);
    if (!expected) return true;
    if (!control) return false;
    setNativeValue(control, expected);
    return textValueMatches(control.value, expected);
  }

  async function setWorkdaySearchValue(control, value, documentObject) {
    const expected = clean(value);
    control.focus?.();
    control.select?.();
    if (typeof globalObject.__jobflowWorkdaySearch === "function") {
      const submitted = await globalObject.__jobflowWorkdaySearch(
        control,
        expected,
      );
      if (submitted && textValueMatches(control.value, expected)) {
        return { submitted: true, written: true };
      }
      return { submitted: false, written: false };
    }
    try {
      if (
        documentObject.execCommand?.("insertText", false, expected) &&
        textValueMatches(control.value, expected)
      ) {
        return { submitted: false, written: true };
      }
    } catch {
      // Fall through to the native setter when insertText is unavailable.
    }
    setNativeValue(control, expected, false);
    return {
      submitted: false,
      written: textValueMatches(control.value, expected),
    };
  }

  function setWorkdayNumericText(control, value) {
    const expected = clean(value);
    if (!expected) return true;
    if (!control || !/^\d+$/.test(expected)) return false;
    const normalized = String(Number(expected));
    control.focus?.();
    setNativeValue(control, normalized, false);
    control.dispatchEvent(new Event("change", { bubbles: true }));
    if (typeof control.blur === "function") {
      control.blur();
    } else {
      control.dispatchEvent(new Event("blur", { bubbles: true }));
    }
    return Number(control.value) === Number(normalized);
  }

  function setWorkdayDateParts(row, startDate, endDate) {
    const months = Array.from(
      row.querySelectorAll?.('[data-automation-id="dateSectionMonth-input"]') || [],
    );
    const years = Array.from(
      row.querySelectorAll?.('[data-automation-id="dateSectionYear-input"]') || [],
    );
    const dates = [startDate, endDate];
    return dates.every((date, index) => {
      if (!clean(date)) return true;
      const [year = "", month = ""] = clean(date).split("-");
      return (
        setWorkdayNumericText(months[index], month) &&
        setWorkdayNumericText(years[index], year)
      );
    });
  }

  function setWorkdayEducationDateParts(row, startDate, endDate) {
    const months = Array.from(
      row.querySelectorAll?.('[data-automation-id="dateSectionMonth-input"]') || [],
    );
    if (months.length > 0) {
      return setWorkdayDateParts(row, startDate, endDate);
    }
    const years = Array.from(
      row.querySelectorAll?.('[data-automation-id="dateSectionYear-input"]') || [],
    );
    return [startDate, endDate].every((date, index) => {
      if (!clean(date)) return true;
      const [year = ""] = clean(date).split("-");
      return setWorkdayNumericText(years[index], year);
    });
  }

  function setWorkdayFullDateParts(row, issuedDate, expirationDate) {
    const months = Array.from(
      row.querySelectorAll?.('[data-automation-id="dateSectionMonth-input"]') || [],
    );
    const days = Array.from(
      row.querySelectorAll?.('[data-automation-id="dateSectionDay-input"]') || [],
    );
    const years = Array.from(
      row.querySelectorAll?.('[data-automation-id="dateSectionYear-input"]') || [],
    );
    return [issuedDate, expirationDate].every((date, index) => {
      if (!clean(date)) return true;
      const [year = "", month = "", day = ""] = clean(date).split("-");
      return (
        setWorkdayNumericText(months[index], month) &&
        setWorkdayNumericText(days[index], day) &&
        setWorkdayNumericText(years[index], year)
      );
    });
  }

  async function setWorkdayChoice(control, value, documentObject) {
    const expected = clean(value);
    if (!expected) return true;
    if (!control) return false;
    if (control.tagName.toLowerCase() === "select") {
      const option = Array.from(control.options || []).find(
        (candidate) =>
          choiceTextMatches(candidate.value, expected) ||
          choiceTextMatches(candidate.textContent, expected),
      );
      if (!option) return false;
      control.value = option.value;
      dispatchInput(control);
      return control.value === option.value;
    }
    openChoiceMenu(control, documentObject);
    await waitForChoiceState(documentObject);
    const { match } = await waitForMatchingChoice(
      documentObject,
      control,
      choiceValueAliases(expected),
    );
    if (!match) return false;
    match.click();
    await waitForChoiceState(documentObject);
    return true;
  }

  function workdaySearchContainer(control) {
    let current = control;
    for (let depth = 0; current && depth < 10; depth += 1) {
      const text = clean(current.innerText || current.textContent);
      if (
        /\b\d+\s+items?(?:\s+are)?\s+selected\b/i.test(text) ||
        current.querySelectorAll?.('[data-automation-id="selectedItem"]')?.length
      ) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function workdaySelectedChoiceMatches(control, expected) {
    const container = workdaySearchContainer(control);
    return Array.from(
      container?.querySelectorAll?.('[data-automation-id="selectedItem"]') || [],
    ).some((item) => {
      const rank = workdaySearchMatchRank(
        item.getAttribute?.("data-automation-label") || item.textContent,
        expected,
      );
      return rank <= 2;
    });
  }

  function workdaySearchRequiresSelectedItem(control) {
    return Boolean(
      workdaySearchContainer(control) ||
        control.getAttribute?.("data-automation-id") === "searchBox" ||
        control.getAttribute?.("data-uxi-multiselect-id") ||
        control.closest?.('[data-automation-id="multiselectInputContainer"]'),
    );
  }

  async function activateWorkdaySearchOption(
    match,
    documentObject,
    control,
  ) {
    const label = clean(
      match.getAttribute?.("data-automation-label") || match.textContent,
    );
    if (typeof globalObject.__jobflowWorkdayOption === "function") {
      return Boolean(
        await globalObject.__jobflowWorkdayOption(control, label),
      );
    }
    const option =
      match.closest?.('[role="option"]') ||
      match.parentElement?.closest?.('[role="option"]') ||
      match;
    const radio =
      option.querySelector?.(
        'input[type="radio"], [data-automation-id="radioBtn"]',
      ) ||
      match.querySelector?.(
        'input[type="radio"], [data-automation-id="radioBtn"]',
      );
    const target = option || radio || match;
    const MouseEventConstructor =
      documentObject.defaultView?.MouseEvent ||
      globalObject.MouseEvent ||
      globalObject.Event;
    if (target.dispatchEvent && MouseEventConstructor) {
      target.dispatchEvent(
        new MouseEventConstructor("mousedown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 1,
        }),
      );
    }
    target.click?.();
    if (target === radio && radio?.dispatchEvent) {
      radio.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  }

  function submitWorkdaySearch(control, documentObject) {
    const KeyboardEventConstructor =
      documentObject.defaultView?.KeyboardEvent ||
      globalObject.KeyboardEvent;
    for (const type of ["keydown", "keypress", "keyup"]) {
      const event = KeyboardEventConstructor
        ? new KeyboardEventConstructor(type, {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            which: 13,
            charCode: type === "keypress" ? 13 : 0,
            bubbles: true,
            cancelable: true,
          })
        : new Event(type, { bubbles: true, cancelable: true });
      const legacyKeyboardValues = {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        charCode: type === "keypress" ? 13 : 0,
      };
      for (const [property, value] of Object.entries(legacyKeyboardValues)) {
        if (event[property] === value) continue;
        Object.defineProperty(event, property, {
          configurable: true,
          value,
        });
      }
      control.dispatchEvent(event);
    }
    control
      .closest?.('[data-automation-id="multiselectInputContainer"]')
      ?.querySelector?.('[data-automation-id="promptSearchButton"]')
      ?.click?.();
  }

  async function setWorkdaySearchChoice(control, value, documentObject) {
    const expected = clean(value);
    if (!expected) return true;
    if (!control) return false;
    const requiresSelectedItem = workdaySearchRequiresSelectedItem(control);
    if (
      requiresSelectedItem &&
      workdaySelectedChoiceMatches(control, expected)
    ) {
      return true;
    }
    if (
      !requiresSelectedItem &&
      textValueMatches(control.value, expected)
    ) {
      return true;
    }
    const searchValue = await setWorkdaySearchValue(
      control,
      expected,
      documentObject,
    );
    if (!searchValue.written) {
      return false;
    }
    await waitForChoiceState(documentObject, 160);
    if (!searchValue.submitted) {
      submitWorkdaySearch(control, documentObject);
    }
    await waitForChoiceState(documentObject, 300);
    const { match } = await waitForMatchingChoice(
      documentObject,
      control,
      [expected.toLowerCase()],
      20,
      workdaySearchTextMatches,
      bestWorkdaySearchOption,
    );
    if (!match) return false;
    if (!(await activateWorkdaySearchOption(match, documentObject, control))) {
      return false;
    }
    await waitForChoiceState(documentObject, 300);
    if (!requiresSelectedItem) return true;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (workdaySelectedChoiceMatches(control, expected)) return true;
      await waitForChoiceState(documentObject, 100);
    }
    return false;
  }

  async function applyWorkdayRepeater(item, documentObject) {
    const definition = WORKDAY_REPEATERS.find(
      (candidate) => candidate.fieldId === item.field_id,
    );
    if (!definition) throw new Error(`Unsupported Workday repeater: ${item.field_id}`);
    const section = documentObject.querySelector(item.selector);
    if (!section) throw new Error(`Workday ${definition.label} section was not found.`);
    const entries = Array.isArray(item.value) ? item.value : [];
    if (!entries.length) return true;

    for (let index = 0; index < entries.length; index += 1) {
      const row = await ensureWorkdayRepeaterRow(
        section,
        definition.label,
        index,
        documentObject,
      );
      if (item.field_id === "jobflow-workday-websites") {
        const input =
          row.querySelector?.('input[type="url"]') || row.querySelector?.("input");
        if (!input) throw new Error("Workday Website URL field was not found.");
        setNativeValue(input, entries[index].url || "");
        if (!textValueMatches(input.value, entries[index].url || "")) return false;
      } else if (item.field_id === "jobflow-workday-work-experience") {
        const entry = entries[index];
        const current = row.querySelector?.('[name="currentlyWorkHere"]');
        const verified = [
          setWorkdayText(row.querySelector?.('[name="jobTitle"]'), entry.job_title),
          setWorkdayText(row.querySelector?.('[name="companyName"]'), entry.company),
          setWorkdayText(row.querySelector?.('[name="location"]'), entry.location),
          setWorkdayText(row.querySelector?.("textarea"), entry.description),
          setWorkdayDateParts(row, entry.start_date, entry.current ? "" : entry.end_date),
        ].every(Boolean);
        if (!verified) return false;
        if (current) {
          current.checked = boolValue(entry.current);
          dispatchInput(current);
          if (current.checked !== boolValue(entry.current)) return false;
        }
      } else if (item.field_id === "jobflow-workday-education") {
        const entry = entries[index];
        const statusControl = [
          '[name="educationStatus"]',
          '[name="status"]',
          '[data-automation-id="educationStatus"]',
        ]
          .map((selector) => row.querySelector?.(selector))
          .find(Boolean);
        const hasDateControls =
          Array.from(
            row.querySelectorAll?.(
              '[data-automation-id="dateSectionYear-input"]',
            ) || [],
          ).length > 0;
        const directSchoolControl = [
          '[name="schoolName"]',
          '[id$="--schoolName"]',
        ]
          .map((selector) => row.querySelector?.(selector))
          .find(Boolean);
        const schoolControl = directSchoolControl || [
          '[id$="--school"]',
          '[data-automation-id="searchBox"]',
        ]
          .map((selector) => row.querySelector?.(selector))
          .find(Boolean);
        const schoolVerified = directSchoolControl
          ? setWorkdayText(directSchoolControl, entry.school)
          : await setWorkdaySearchChoice(
              schoolControl,
              entry.school,
              documentObject,
            );
        const degreeVerified = await setWorkdayChoice(
          row.querySelector?.('[name="degree"]'),
          entry.degree,
          documentObject,
        );
        const fieldVerified = await setWorkdaySearchChoice(
          row.querySelector?.('[id$="--fieldOfStudy"]'),
          entry.field_of_study,
          documentObject,
        );
        const datesVerified = hasDateControls
          ? setWorkdayEducationDateParts(
              row,
              entry.start_date,
              entry.end_date,
            )
          : true;
        const statusVerified = statusControl
          ? await setWorkdayChoice(statusControl, entry.status, documentObject)
          : true;
        if (
          !schoolVerified ||
          !degreeVerified ||
          !fieldVerified ||
          !datesVerified ||
          !statusVerified
        ) {
          return false;
        }
      } else if (item.field_id === "jobflow-workday-certifications") {
        const entry = entries[index];
        const nameVerified = await setWorkdaySearchChoice(
          row.querySelector?.('[data-automation-id="searchBox"]'),
          entry.name,
          documentObject,
        );
        const verified =
          nameVerified &&
          setWorkdayText(
            row.querySelector?.('[name="certificationNumber"]'),
            entry.number,
          ) &&
          setWorkdayFullDateParts(
            row,
            entry.issued_date,
            entry.expiration_date,
          );
        if (!verified) return false;
      }
    }
    return true;
  }

  async function applyItem(item, field, documentObject) {
    if (item.action === "repeat") {
      return applyWorkdayRepeater(item, documentObject);
    }
    const selector = item.selector || field?.selector;
    if (!selector) throw new Error("Missing selector for browser write.");
    const elements = Array.from(documentObject.querySelectorAll(selector));
    if (!elements.length) throw new Error(`Field was not found: ${item.field_id}`);
    const element = elements[0];
    if (item.action === "fill") {
      const expected = item.value == null ? "" : String(item.value);
      const automationId = clean(
        element.getAttribute?.("data-automation-id"),
      );
      if (
        /^dateSection(?:Month|Day|Year)-input$/.test(automationId)
      ) {
        if (!setWorkdayNumericText(element, expected)) return false;
        await waitForChoiceState(documentObject);
        const refreshed =
          Array.from(documentObject.querySelectorAll(selector))[0] || element;
        return Number(refreshed.value) === Number(expected);
      }
      setNativeValue(element, expected);
      await waitForChoiceState(documentObject);
      const refreshed =
        Array.from(documentObject.querySelectorAll(selector))[0] || element;
      return textValueMatches(refreshed.value, expected);
    }
    if (item.action === "check") {
      const expected = boolValue(item.value);
      if (element.checked !== expected) {
        if (typeof element.click === "function") {
          element.click();
        } else {
          element.checked = expected;
          dispatchInput(element);
        }
        await waitForChoiceState(documentObject);
      }
      const refreshed =
        Array.from(documentObject.querySelectorAll(selector))[0] || element;
      return refreshed.checked === expected;
    }
    if (item.action === "select" && field?.type === "radio") {
      const expected = clean(item.value).toLowerCase();
      if (elements.length === 1 && elements[0].tagName.toLowerCase() !== "input") {
        const container = elements[0];
        const button = Array.from(container.querySelectorAll("button")).find(
          (candidate) => clean(candidate.textContent).toLowerCase() === expected,
        );
        if (button) {
          if (choiceButtonSelected(button)) return true;
          button.click();
          await waitForChoiceState(documentObject);
          const currentButton = Array.from(container.querySelectorAll("button")).find(
            (candidate) => clean(candidate.textContent).toLowerCase() === expected,
          );
          return Boolean(currentButton && choiceButtonSelected(currentButton));
        }
      }
      const radioInputs = elements.flatMap((candidate) =>
        candidate.tagName.toLowerCase() === "input"
          ? [candidate]
          : Array.from(candidate.querySelectorAll('input[type="radio"]')),
      );
      const matchingOptions = radioInputs.filter((candidate) => {
        const label = clean(
          documentObject.querySelector(`label[for="${escapeAttribute(candidate.id)}"]`)
            ?.textContent || candidate.closest("label")?.textContent,
        );
        return (
          choiceTextMatches(candidate.value, expected) ||
          choiceTextMatches(label, expected)
        );
      });
      const option = matchingOptions.length === 1 ? matchingOptions[0] : null;
      if (!option) throw new Error(`Radio option was not found: ${item.value}`);
      if (!option.checked) option.click();
      await waitForChoiceState(documentObject);
      return option.checked;
    }
    if (item.action === "select" && element.tagName.toLowerCase() === "select") {
      const expected = clean(item.value).toLowerCase();
      const option = Array.from(element.options).find(
        (candidate) =>
          clean(candidate.value).toLowerCase() === expected ||
          clean(candidate.textContent).toLowerCase() === expected,
      );
      if (!option) throw new Error(`Select option was not found: ${item.value}`);
      element.value = option.value;
      dispatchInput(element);
      return element.value === option.value;
    }
    if (item.action === "select") {
      const expectedValues = choiceValueAliases(item.value);
      const searchableCombobox =
        element.tagName.toLowerCase() === "input" &&
        (clean(element.getAttribute("role")).toLowerCase() === "combobox" ||
          clean(element.getAttribute("aria-haspopup")).toLowerCase() === "listbox");
      const currentValue = searchableCombobox
        ? committedChoiceText(element)
        : clean(element.value || element.textContent);
      if (
        expectedValues.some((expected) => choiceTextMatches(currentValue, expected))
      ) {
        return true;
      }
      openChoiceMenu(element, documentObject);
      if (searchableCombobox) {
        setNativeValue(element, String(item.value), false);
      }
      await waitForChoiceState(documentObject, searchableCombobox ? 120 : 80);
      const { match: option, options } = await waitForMatchingChoice(
        documentObject,
        element,
        expectedValues,
      );
      if (!option) {
        const available = options
          .map((candidate) => clean(candidate.textContent))
          .filter(Boolean)
          .slice(0, 6)
          .join(" | ");
        throw new Error(
          `Combobox option was not found: ${item.value}; available: ${available || "none"}`,
        );
      }
      option.click();
      await waitForChoiceState(documentObject);
      return true;
    }
    if (item.action === "upload") {
      return uploadFile(element, item.value, documentObject);
    }
    throw new Error(`Unsupported fill action: ${item.action}`);
  }

  function profileReviewReason(item) {
    if (item.field_id !== "jobflow-workday-education") return "";
    const entries = Array.isArray(item.value) ? item.value : [];
    const missing = new Set();
    for (const entry of entries) {
      if (!clean(entry.school)) missing.add("School");
      if (!clean(entry.degree)) missing.add("Degree");
    }
    if (!missing.size) return "";
    return `${[...missing].join(" and ")} is missing from Profile. Available Education values were filled; complete the missing field manually.`;
  }

  async function applyFillPlan(plan, form, documentObject = document) {
    const captchaDetected = captchaPresent(documentObject);
    const eligible = eligiblePlanItems(plan, captchaDetected);
    const result = {
      status: captchaDetected ? "blocked" : "applied",
      filled_count: 0,
      skipped_count: 0,
      review_count: 0,
      error_count: 0,
      items: [],
    };
    const eligibleIds = new Set(eligible.map((item) => item.field_id));
    const fields = new Map((form?.fields || []).map((field) => [field.field_id, field]));
    for (const item of plan?.items || []) {
      if (!eligibleIds.has(item.field_id)) {
        const review = captchaDetected || item.needs_review;
        result.items.push({
          field_id: item.field_id,
          status: review ? "needs_review" : "skipped",
          reason: captchaDetected
            ? "CAPTCHA detected; complete it manually before resuming."
            : "Not eligible for automated browser write.",
        });
        if (review) result.review_count += 1;
        else result.skipped_count += 1;
        continue;
      }
      try {
        const field = fields.get(item.field_id);
        const selector = item.selector || field?.selector;
        const resumeElement =
          form?.ats === "rippling" && item.field_id === "resume" && selector
            ? Array.from(documentObject.querySelectorAll(selector))[0]
            : null;
        const resumeAlreadyPresent = resumeElement
          ? uploadedResumePresent(resumeElement, documentObject)
          : false;
        const verified = await applyItem(item, field, documentObject);
        if (!verified) throw new Error("Browser value did not match after writing.");
        if (
          form?.ats === "rippling" &&
          item.field_id === "resume" &&
          !resumeAlreadyPresent
        ) {
          await waitForRipplingResumeProcessing(documentObject);
        }
        const reviewReason = profileReviewReason(item);
        if (reviewReason) {
          result.items.push({
            field_id: item.field_id,
            status: "needs_review",
            reason: reviewReason,
          });
          result.review_count += 1;
          continue;
        }
        result.items.push({
          field_id: item.field_id,
          status: "filled",
          reason: "Filled in the active Chrome tab and verified.",
        });
        result.filled_count += 1;
      } catch (error) {
        result.items.push({
          field_id: item.field_id,
          status: "error",
          reason: error instanceof Error ? error.message : "Browser write failed.",
        });
        result.error_count += 1;
      }
    }
    for (const blocked of plan?.blocked_items || []) {
      result.items.push({ ...blocked, status: "blocked" });
      result.review_count += 1;
    }
    if (result.error_count) result.status = "error";
    return result;
  }

  const api = {
    applyFillPlan,
    applyWorkdayRepeater,
    ashbyRadioGroup,
    captchaPresent,
    choiceButtonSelected,
    choiceTextMatches,
    choiceValueAliases,
    decodeDocumentPayload,
    detectAts,
    eligiblePlanItems,
    extractForm,
    ignoredNativeControlType,
    recordHints,
    textValueMatches,
    waitForChoiceState,
    waitForRipplingResumeProcessing,
    workdayRepeaterFields,
  };
  globalObject.JobFlowDOM = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
