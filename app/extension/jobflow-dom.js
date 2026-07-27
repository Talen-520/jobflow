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

  function labelFor(control, container, documentObject) {
    const aria = clean(control.getAttribute("aria-label"));
    if (aria) return aria;
    const labelledBy = clean(control.getAttribute("aria-labelledby"));
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => clean(documentObject.getElementById(id)?.textContent))
        .filter(Boolean)
        .join(" ");
      if (text) return text;
    }
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

  function selectorFor(control, config, fieldId) {
    for (const attribute of config.identity || []) {
      const value = clean(control.getAttribute(attribute));
      if (value) return `[${attribute}="${escapeAttribute(value)}"]`;
    }
    return `[data-jobflow-field="${escapeAttribute(fieldId)}"]`;
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
    return /(gender|race|ethnicity|veteran|disability|sponsorship|visa|authoriz|salary|compensation|relocation|birth|ssn)/i.test(
      text,
    );
  }

  function recordHints(documentObject, ats, url) {
    const pageTitle = clean(documentObject.title);
    const heading = clean(documentObject.querySelector("h1, h2")?.textContent);
    let company = "";
    let jobTitle = heading;
    const applicationMatch = pageTitle.match(/job application for\s+(.+?)\s+at\s+(.+)/i);
    if (applicationMatch) {
      jobTitle ||= clean(applicationMatch[1]);
      company = clean(applicationMatch[2]);
    } else if (pageTitle.includes(" - ")) {
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
    const controls = Array.from(
      root.querySelectorAll(
        "input, textarea, select, [role='combobox'], " +
          "button[aria-haspopup='listbox'], [role='button'][aria-haspopup='listbox']",
      ),
    );
    controls.forEach((control, index) => {
      if (ignoredNativeControlType(control)) return;
      if (control.disabled || /captcha|honeypot|beecatcher/i.test(`${control.id} ${control.name}`)) return;
      const type = fieldType(control);
      const radioGroup =
        ats === "ashby" && type === "radio"
          ? ashbyRadioGroup(control, documentObject)
          : null;
      const container = radioGroup?.container || control.closest(config.container);
      const rawId =
        radioGroup?.fieldId ||
        (config.identity || []).map((attr) => clean(control.getAttribute(attr))).find(Boolean) ||
        `field_${index}`;
      const fieldId = (config.aliases && config.aliases[rawId]) || rawId;
      const label = radioGroup?.label || labelFor(control, container, documentObject);
      if (!label || fieldId.startsWith("field_")) return;
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
          Boolean(control.required) || control.getAttribute("aria-required") === "true",
        options,
        placeholder: clean(control.getAttribute("placeholder")),
        helper_text: clean(control.getAttribute("title")),
        selector: radioGroup?.selector || selectorFor(control, config, fieldId),
        sensitive: sensitiveField(`${fieldId} ${label}`),
      };
      byId.set(fieldId, field);
      fields.push(field);
    });
    const hints = recordHints(documentObject, ats, url);
    return {
      url,
      ats,
      company_name_hint: hints.company,
      job_title_hint: hints.jobTitle,
      fields,
    };
  }

  function dispatchInput(element, blur = true) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
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
    dispatchInput(element, blur);
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

  async function uploadFile(element, sourceUrl) {
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
    dispatchInput(element);
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
    const actual = clean(actualValue).toLowerCase();
    const expected = clean(expectedValue).toLowerCase();
    if (actual === expected) return true;
    if (!expected || !actual.startsWith(expected)) return false;
    return /^\s*[\(\[\{,;:/-]/.test(actual.slice(expected.length));
  }

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
    const stateName = US_STATE_NAMES[clean(value).toUpperCase()];
    if (stateName) return [normalized, stateName.toLowerCase()];
    return [normalized];
  }

  function waitForChoiceState(documentObject, delay = 80) {
    const schedule = documentObject?.defaultView?.setTimeout || setTimeout;
    return new Promise((resolve) => schedule(resolve, delay));
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
    const optionSelector = '[role="option"], [id*="-option-"], .select__option';
    const candidates = roots.length
      ? roots.flatMap((root) => Array.from(root.querySelectorAll(optionSelector)))
      : Array.from(documentObject.querySelectorAll(optionSelector));
    return candidates.filter((candidate) => {
      const view = candidate.ownerDocument?.defaultView;
      if (candidate.closest?.("[hidden], [aria-hidden='true']")) return false;
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
  ) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const options = visibleChoiceOptions(documentObject, element);
      const match = options.find((candidate) =>
        expectedValues.some((expected) =>
          choiceTextMatches(candidate.textContent, expected),
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

  async function applyItem(item, field, documentObject) {
    const selector = item.selector || field?.selector;
    if (!selector) throw new Error("Missing selector for browser write.");
    const elements = Array.from(documentObject.querySelectorAll(selector));
    if (!elements.length) throw new Error(`Field was not found: ${item.field_id}`);
    const element = elements[0];
    if (item.action === "fill") {
      const expected = item.value == null ? "" : String(item.value);
      setNativeValue(element, expected);
      return textValueMatches(element.value, expected);
    }
    if (item.action === "check") {
      element.checked = boolValue(item.value);
      dispatchInput(element);
      return element.checked === boolValue(item.value);
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
        clean(element.getAttribute("role")).toLowerCase() === "combobox";
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
      await uploadFile(element, item.value);
      return Boolean(element.files?.length);
    }
    throw new Error(`Unsupported fill action: ${item.action}`);
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
        const verified = await applyItem(item, fields.get(item.field_id), documentObject);
        if (!verified) throw new Error("Browser value did not match after writing.");
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
  };
  globalObject.JobFlowDOM = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
