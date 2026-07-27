const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyFillPlan,
  applyWorkdayRepeater,
  captchaPresent,
  choiceButtonSelected,
  choiceTextMatches,
  choiceValueAliases,
  ashbyRadioGroup,
  decodeDocumentPayload,
  eligiblePlanItems,
  extractForm,
  ignoredNativeControlType,
  recordHints,
  textValueMatches,
  waitForChoiceState,
  workdayRepeaterFields,
} = require("../jobflow-dom.js");

test("Ashby radios use the stable question path and all option labels", () => {
  const controls = ["Male", "Female", "Decline to self-identify"].map(
    (label, index) => ({
      id: `generated-gender-radio-${index}`,
      tagName: "INPUT",
      getAttribute(name) {
        return { name: "generated__systemfield_eeoc_gender", type: "radio" }[name] || "";
      },
      closest() {
        return container;
      },
      optionLabel: label,
    }),
  );
  const labels = controls.map((control) => ({
    htmlFor: control.id,
    textContent: control.optionLabel,
  }));
  const container = {
    getAttribute(name) {
      return name === "data-field-path" ? "_systemfield_eeoc_gender" : "";
    },
    querySelector(selector) {
      return selector.includes("ashby-application-form-question-title")
        ? { textContent: "Gender" }
        : null;
    },
  };
  const documentObject = {
    querySelectorAll(selector) {
      return selector === "label" ? labels : controls;
    },
  };

  const group = ashbyRadioGroup(controls[0], documentObject);

  assert.equal(group.fieldId, "_systemfield_eeoc_gender");
  assert.equal(group.label, "Gender");
  assert.deepEqual(group.options, ["Male", "Female", "Decline to self-identify"]);
  assert.equal(group.selector, '[data-field-path="_systemfield_eeoc_gender"]');
});

test("Ashby choice buttons verify their generated active class", () => {
  const button = {
    className: "_container_pjyt6_1 _option_1svni_32 _active_1svni_57",
    getAttribute() {
      return null;
    },
  };

  assert.equal(choiceButtonSelected(button), true);
  assert.equal(
    choiceButtonSelected({
      ...button,
      className: "_container_pjyt6_1 _option_1svni_32",
    }),
    false,
  );
});

test("Ashby choice buttons are idempotent when the saved option is already active", async () => {
  let clickCount = 0;
  const button = {
    className: "_option_1svni_32 _active_1svni_57",
    tagName: "BUTTON",
    textContent: "Yes",
    getAttribute() {
      return null;
    },
    click() {
      clickCount += 1;
      this.className = "_option_1svni_32";
    },
  };
  const container = {
    tagName: "DIV",
    querySelectorAll(selector) {
      return selector === "button" ? [button] : [];
    },
  };
  const documentObject = {
    body: { textContent: "" },
    defaultView: { setTimeout },
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      return selector === '[data-field-path="authorization"]' ? [container] : [];
    },
  };
  const result = await applyFillPlan(
    {
      items: [
        {
          field_id: "authorization",
          action: "select",
          value: "Yes",
          confidence: 0.95,
          needs_review: false,
          source_refs: ["profile.work_authorization.authorized"],
        },
      ],
      blocked_items: [],
    },
    {
      fields: [
        {
          field_id: "authorization",
          type: "radio",
          selector: '[data-field-path="authorization"]',
        },
      ],
    },
    documentObject,
  );

  assert.equal(clickCount, 0);
  assert.equal(result.filled_count, 1);
  assert.equal(result.error_count, 0);
});

test("descriptive radio labels accept a unique saved-value prefix", () => {
  assert.equal(choiceTextMatches("Asian (Not Hispanic or Latino)", "Asian"), true);
  assert.equal(choiceTextMatches("New York, NY, United States", "New York"), true);
  assert.equal(choiceTextMatches("Female", "Male"), false);
  assert.equal(
    choiceTextMatches("United States Minor Outlying Islands", "United States"),
    false,
  );
});

test("custom combobox values accept boolean Yes and No aliases", () => {
  assert.deepEqual(choiceValueAliases("True"), ["yes", "true"]);
  assert.deepEqual(choiceValueAliases("false"), ["no", "false"]);
  assert.deepEqual(choiceValueAliases("LinkedIn"), ["linkedin"]);
  assert.deepEqual(choiceValueAliases("United States"), [
    "united states",
    "united states of america",
    "usa",
    "us",
  ]);
});

test("Workday listbox buttons are retained while ordinary buttons are ignored", () => {
  const control = (attributes) => ({
    getAttribute(name) {
      return attributes[name] || "";
    },
  });

  assert.equal(
    ignoredNativeControlType(
      control({ type: "button", "aria-haspopup": "listbox" }),
    ),
    false,
  );
  assert.equal(ignoredNativeControlType(control({ type: "button" })), true);
  assert.equal(ignoredNativeControlType(control({ type: "submit" })), true);
});

test("Workday state choices accept US postal abbreviations", () => {
  assert.deepEqual(choiceValueAliases("NY"), ["ny", "new york"]);
  assert.deepEqual(choiceValueAliases("VA"), ["va", "virginia"]);
});

test("Workday country selection ignores similarly prefixed territories", async () => {
  let opened = false;
  let selected = "";
  const options = [
    {
      textContent: "United States Minor Outlying Islands",
      ownerDocument: null,
      getClientRects() {
        return [{}];
      },
      closest() {
        return null;
      },
      click() {
        selected = this.textContent;
      },
    },
    {
      textContent: "United States of America",
      ownerDocument: null,
      getClientRects() {
        return [{}];
      },
      closest() {
        return null;
      },
      click() {
        selected = this.textContent;
      },
    },
  ];
  const listbox = {
    querySelectorAll() {
      return opened ? options : [];
    },
  };
  const country = {
    id: "",
    tagName: "BUTTON",
    textContent: "Select One",
    value: "",
    dispatchEvent() {},
    focus() {},
    closest() {
      return null;
    },
    getAttribute(name) {
      return name === "aria-controls" ? "country-listbox" : "";
    },
    click() {
      opened = true;
    },
  };
  const documentObject = {
    body: { textContent: "" },
    defaultView: {
      setTimeout,
      getComputedStyle() {
        return { display: "block", visibility: "visible" };
      },
    },
    getElementById(id) {
      return id === "country-listbox" ? listbox : null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "#country") return [country];
      return [];
    },
  };
  options.forEach((option) => {
    option.ownerDocument = documentObject;
  });

  const result = await applyFillPlan(
    {
      items: [
        {
          field_id: "country",
          action: "select",
          value: "United States",
          confidence: 0.95,
          needs_review: false,
          source_refs: ["profile.identity.country"],
        },
      ],
      blocked_items: [],
    },
    {
      fields: [
        {
          field_id: "country",
          type: "select",
          selector: "#country",
        },
      ],
    },
    documentObject,
  );

  assert.equal(selected, "United States of America");
  assert.equal(result.filled_count, 1);
  assert.equal(result.error_count, 0);
});

test("custom combobox waits for and selects one descriptive location option", async () => {
  let opened = false;
  let optionClicked = false;
  const option = {
    textContent: "New York, NY, United States",
    click() {
      optionClicked = true;
    },
  };
  const combobox = {
    tagName: "INPUT",
    textContent: "",
    value: "",
    dispatchEvent() {},
    getAttribute(name) {
      return name === "role" ? "combobox" : "";
    },
    click() {
      opened = true;
    },
  };
  const documentObject = {
    body: { textContent: "" },
    defaultView: { setTimeout },
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "#location") return [combobox];
      if (selector.includes('[role="option"]')) return opened ? [option] : [];
      return [];
    },
  };

  const result = await applyFillPlan(
    {
      items: [
        {
          field_id: "location",
          action: "select",
          value: "New York",
          confidence: 0.95,
          needs_review: false,
          source_refs: ["profile.identity.location"],
        },
      ],
      blocked_items: [],
    },
    {
      fields: [
        {
          field_id: "location",
          type: "select",
          selector: "#location",
        },
      ],
    },
    documentObject,
  );

  assert.equal(optionClicked, true);
  assert.equal(result.filled_count, 1);
  assert.equal(result.error_count, 0);
});

test("custom combobox polls for asynchronously loaded options", async () => {
  let optionQueries = 0;
  let optionClicked = false;
  const option = {
    textContent: "New York, NY, United States",
    click() {
      optionClicked = true;
    },
  };
  const combobox = {
    tagName: "INPUT",
    textContent: "",
    value: "",
    dispatchEvent() {},
    getAttribute(name) {
      return name === "role" ? "combobox" : "";
    },
    click() {},
  };
  const documentObject = {
    body: { textContent: "" },
    defaultView: { setTimeout },
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "#location") return [combobox];
      if (selector.includes('[role="option"]')) {
        optionQueries += 1;
        return optionQueries >= 2 ? [option] : [];
      }
      return [];
    },
  };

  const result = await applyFillPlan(
    {
      items: [
        {
          field_id: "location",
          action: "select",
          value: "New York",
          confidence: 0.95,
          needs_review: false,
          source_refs: ["profile.identity.location"],
        },
      ],
      blocked_items: [],
    },
    {
      fields: [
        {
          field_id: "location",
          type: "select",
          selector: "#location",
        },
      ],
    },
    documentObject,
  );

  assert.ok(optionQueries >= 2);
  assert.equal(optionClicked, true);
  assert.equal(result.error_count, 0);
});

test("custom combobox selects only from its associated listbox", async () => {
  let sourceClicked = false;
  let countryClicked = false;
  const countryOption = {
    textContent: "Afghanistan +93",
    click() {
      countryClicked = true;
    },
  };
  const sourceOption = {
    textContent: "LinkedIn",
    click() {
      sourceClicked = true;
    },
  };
  const sourceListbox = {
    querySelectorAll() {
      return [sourceOption];
    },
  };
  const combobox = {
    id: "source",
    tagName: "INPUT",
    textContent: "",
    value: "",
    dispatchEvent() {},
    getAttribute(name) {
      if (name === "role") return "combobox";
      if (name === "aria-controls") return "react-select-source-listbox";
      return "";
    },
    click() {},
  };
  const documentObject = {
    body: { textContent: "" },
    defaultView: { setTimeout },
    getElementById(id) {
      return id === "react-select-source-listbox" ? sourceListbox : null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "#source") return [combobox];
      if (selector.includes('[role="option"]')) return [countryOption, sourceOption];
      return [];
    },
  };

  const result = await applyFillPlan(
    {
      items: [
        {
          field_id: "source",
          action: "select",
          value: "LinkedIn",
          confidence: 0.95,
          needs_review: false,
          source_refs: ["profile.preferences.source"],
        },
      ],
      blocked_items: [],
    },
    {
      fields: [
        {
          field_id: "source",
          type: "select",
          selector: "#source",
        },
      ],
    },
    documentObject,
  );

  assert.equal(sourceClicked, true);
  assert.equal(countryClicked, false);
  assert.equal(result.error_count, 0);
});

test("custom combobox opens a React Select control through mouse down", async () => {
  let opened = false;
  let optionClicked = false;
  class FakeMouseEvent {
    constructor(type) {
      this.type = type;
    }
  }
  const option = {
    textContent: "LinkedIn",
    click() {
      optionClicked = true;
    },
  };
  const listbox = {
    querySelectorAll() {
      return [option];
    },
  };
  const control = {
    dispatchEvent(event) {
      if (event.type === "mousedown") opened = true;
    },
  };
  const combobox = {
    id: "source",
    tagName: "INPUT",
    textContent: "",
    value: "",
    dispatchEvent() {},
    focus() {},
    getAttribute(name) {
      return name === "role" ? "combobox" : "";
    },
    closest() {
      return control;
    },
    click() {},
  };
  const documentObject = {
    body: { textContent: "" },
    defaultView: { setTimeout, MouseEvent: FakeMouseEvent },
    getElementById(id) {
      return opened && id === "react-select-source-listbox" ? listbox : null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      return selector === "#source" ? [combobox] : [];
    },
  };

  const result = await applyFillPlan(
    {
      items: [
        {
          field_id: "source",
          action: "select",
          value: "LinkedIn",
          confidence: 0.95,
          needs_review: false,
          source_refs: ["profile.preferences.source"],
        },
      ],
      blocked_items: [],
    },
    {
      fields: [
        {
          field_id: "source",
          type: "select",
          selector: "#source",
        },
      ],
    },
    documentObject,
  );

  assert.equal(opened, true);
  assert.equal(optionClicked, true);
  assert.equal(result.error_count, 0);
});

test("custom combobox does not treat uncommitted search text as selected", async () => {
  let clickCount = 0;
  const combobox = {
    tagName: "INPUT",
    textContent: "",
    value: "New York",
    dispatchEvent() {},
    getAttribute(name) {
      return name === "role" ? "combobox" : "";
    },
    click() {
      clickCount += 1;
    },
  };
  const documentObject = {
    body: { textContent: "" },
    defaultView: { setTimeout },
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "#location") return [combobox];
      return [];
    },
  };

  const result = await applyFillPlan(
    {
      items: [
        {
          field_id: "location",
          action: "select",
          value: "New York",
          confidence: 0.95,
          needs_review: false,
          source_refs: ["profile.identity.location"],
        },
      ],
      blocked_items: [],
    },
    {
      fields: [
        {
          field_id: "location",
          type: "select",
          selector: "#location",
        },
      ],
    },
    documentObject,
  );

  assert.equal(clickCount, 1);
  assert.equal(result.filled_count, 0);
  assert.equal(result.error_count, 1);
});

test("safe extension writes source-backed fields around a CAPTCHA", () => {
  const document = {
    querySelector(selector) {
      return selector.includes("iframe") ? { title: "captcha" } : null;
    },
    body: { textContent: "Please verify you are human" },
  };

  assert.equal(captchaPresent(document), true);
  const emailItem = {
    field_id: "email",
    action: "fill",
    confidence: 0.99,
    needs_review: false,
    source_refs: ["profile.identity.email"],
  };
  assert.deepEqual(eligiblePlanItems({ items: [emailItem] }, true), [emailItem]);
});

test("choice verification wait resolves without animation frames", async () => {
  const startedAt = Date.now();
  await waitForChoiceState({ defaultView: { setTimeout } }, 1);
  assert.ok(Date.now() - startedAt < 100);
});

test("document payload from the extension background decodes to bytes", () => {
  const decoded = decodeDocumentPayload({
    base64: Buffer.from("resume bytes").toString("base64"),
    filename: "resume.pdf",
    type: "application/pdf",
  });

  assert.equal(decoded.filename, "resume.pdf");
  assert.equal(decoded.type, "application/pdf");
  assert.equal(Buffer.from(decoded.bytes).toString(), "resume bytes");
});

test("Workday may clear a file input after accepting the resume", async () => {
  const previousChrome = global.chrome;
  const previousFile = global.File;
  const previousDataTransfer = global.DataTransfer;
  try {
    global.chrome = {
      runtime: {
        sendMessage: async () => ({
          ok: true,
          payload: {
            base64: Buffer.from("resume bytes").toString("base64"),
            filename: "Tao Hu Résumé 2026.pdf",
            type: "application/pdf",
          },
        }),
      },
    };
    global.File = class {
      constructor(parts, name, options) {
        this.name = name;
        this.size = parts.reduce((total, part) => total + part.byteLength, 0);
        this.type = options.type;
      }
    };
    global.DataTransfer = class {
      constructor() {
        this.files = [];
        this.items = {
          add: (file) => {
            this.files.push(file);
          },
        };
      }
    };

    const input = {
      files: [],
      tagName: "INPUT",
      dispatchEvent(event) {
        if (event.type === "change") this.files = [];
      },
    };
    const documentObject = {
      body: { textContent: "" },
      querySelector() {
        return null;
      },
      querySelectorAll(selector) {
        return selector === '[data-automation-id="file-upload-input-ref"]'
          ? [input]
          : [];
      },
    };
    const result = await applyFillPlan(
      {
        items: [
          {
            field_id: "file-upload-input-ref",
            action: "upload",
            value: "http://127.0.0.1:8765/extension/documents/resume",
            confidence: 1,
            needs_review: false,
            source_refs: ["profile.documents.resume"],
          },
        ],
        blocked_items: [],
      },
      {
        fields: [
          {
            field_id: "file-upload-input-ref",
            type: "file",
            selector: '[data-automation-id="file-upload-input-ref"]',
          },
        ],
      },
      documentObject,
    );

    assert.equal(input.files.length, 0);
    assert.equal(result.filled_count, 1);
    assert.equal(result.error_count, 0);
  } finally {
    global.chrome = previousChrome;
    global.File = previousFile;
    global.DataTransfer = previousDataTransfer;
  }
});

test("text verification accepts location normalization but rejects empty values", () => {
  assert.equal(textValueMatches("New York, NY", "New York"), true);
  assert.equal(textValueMatches("", "New York"), false);
});

test("text verification accepts formatted phone numbers and country codes", () => {
  assert.equal(textValueMatches("(929) 421-5876", "9294215876"), true);
  assert.equal(textValueMatches("+1 929-421-5876", "9294215876"), true);
  assert.equal(textValueMatches("929-421-5000", "9294215876"), false);
});

test("Ashby embedded application derives company from the frame URL", () => {
  const hints = recordHints(
    {
      title: "",
      querySelector(selector) {
        return selector === "h1, h2"
          ? { textContent: "Forward Deployed Agent Engineer" }
          : null;
      },
    },
    "ashby",
    "https://jobs.ashbyhq.com/avoca/job-id/application?embed=js",
  );

  assert.equal(hints.company, "Avoca");
  assert.equal(hints.jobTitle, "Forward Deployed Agent Engineer");
});

test("Workday uses the page title when the application heading is generic", () => {
  const document = {
    title: "Sr Site Reliability Engineer (US Federal)",
    querySelector() {
      return { textContent: "Careers at Workday" };
    },
  };

  const hints = recordHints(
    document,
    "workday",
    "https://workday.wd5.myworkdayjobs.com/en-US/Workday/job/USA/job-id/apply",
  );

  assert.equal(hints.company, "Workday");
  assert.equal(hints.jobTitle, "Sr Site Reliability Engineer (US Federal)");
});

test("Workday reports collapsed Add sections as repeatable fields", () => {
  const headings = [
    "Work Experience",
    "Education",
    "Certifications",
    "Websites",
  ].map((textContent) => {
    const button = { textContent: "Add" };
    const section = {
      querySelectorAll(selector) {
        return selector === "button" ? [button] : [];
      },
      setAttribute() {},
    };
    return {
      textContent,
      parentElement: section,
    };
  });
  const root = {
    querySelectorAll(selector) {
      return selector.includes("[role='heading']") ? headings : [];
    },
  };

  assert.deepEqual(
    workdayRepeaterFields(root).map((field) => ({
      field_id: field.field_id,
      label: field.label,
    })),
    [
      {
        field_id: "jobflow-workday-work-experience",
        label: "Work Experience",
      },
      {
        field_id: "jobflow-workday-education",
        label: "Education",
      },
      {
        field_id: "jobflow-workday-certifications",
        label: "Certifications",
      },
      {
        field_id: "jobflow-workday-websites",
        label: "Websites",
      },
    ],
  );
});

test("Workday extraction leaves repeater controls to the structured field", () => {
  const attributes = {};
  const section = {
    setAttribute(name, value) {
      attributes[name] = value;
    },
    querySelectorAll(selector) {
      return selector === "button" ? [{ textContent: "Add" }] : [];
    },
  };
  const heading = {
    textContent: "Work Experience",
    parentElement: section,
  };
  const container = {
    querySelector() {
      return { textContent: "Location" };
    },
  };
  const control = {
    tagName: "INPUT",
    disabled: false,
    id: "",
    name: "location",
    required: false,
    getAttribute(name) {
      return { name: "location", type: "text" }[name] || "";
    },
    querySelectorAll() {
      return [];
    },
    closest(selector) {
      return selector === "[data-jobflow-workday-repeater]"
        ? attributes["data-jobflow-workday-repeater"]
          ? section
          : null
        : container;
    },
  };
  const root = {
    querySelectorAll(selector) {
      if (selector.includes("[role='heading']")) return [heading];
      if (selector.startsWith("input, textarea")) return [control];
      return [];
    },
  };
  const documentObject = {
    title: "Example Role",
    documentElement: { innerHTML: "myworkdayjobs.com" },
    querySelector(selector) {
      if (selector.includes("applyFlowPage")) return root;
      if (selector === "h1, h2") return { textContent: "Careers at Workday" };
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };

  const form = extractForm(
    documentObject,
    "https://example.myworkdayjobs.com/en-US/Example/job/role/apply",
  );

  assert.deepEqual(
    form.fields.map((field) => field.field_id),
    ["jobflow-workday-work-experience"],
  );
});

test("Workday repeat action adds and fills every saved website", async () => {
  const rows = [];
  const section = {
    querySelectorAll(selector) {
      if (selector === "button") return [addButton];
      if (selector.includes("[role='heading']")) {
        return rows.map((row, index) => ({
          textContent: `Websites ${index + 1}`,
          parentElement: row,
        }));
      }
      return [];
    },
  };
  const addButton = {
    textContent: "Add",
    click() {
      const input = {
        tagName: "INPUT",
        value: "",
        getAttribute() {
          return "";
        },
        dispatchEvent() {},
      };
      const row = {
        websiteInput: input,
        parentElement: section,
        querySelector(selector) {
          return selector === "input" ? input : null;
        },
        querySelectorAll(selector) {
          if (selector === "button") return [{ textContent: "Delete" }];
          if (selector === "input") return [input];
          return [];
        },
      };
      rows.push(row);
    },
  };
  const documentObject = {
    defaultView: { setTimeout },
    querySelector(selector) {
      return selector ===
        '[data-jobflow-workday-repeater="jobflow-workday-websites"]'
        ? section
        : null;
    },
  };

  const verified = await applyWorkdayRepeater(
    {
      field_id: "jobflow-workday-websites",
      selector:
        '[data-jobflow-workday-repeater="jobflow-workday-websites"]',
      value: [
        { url: "https://github.com/example" },
        { url: "https://example.dev" },
      ],
    },
    documentObject,
  );

  assert.equal(verified, true);
  assert.deepEqual(
    rows.map((row) => row.websiteInput.value),
    ["https://github.com/example", "https://example.dev"],
  );
});

test("Workday repeat action waits for an asynchronously added row", async () => {
  const rows = [];
  const input = {
    tagName: "INPUT",
    value: "",
    getAttribute() {
      return "";
    },
    dispatchEvent() {},
  };
  const row = {
    parentElement: null,
    querySelector(selector) {
      return selector === "input" ? input : null;
    },
    querySelectorAll(selector) {
      if (selector === "button") return [{ textContent: "Delete" }];
      if (selector === "input") return [input];
      return [];
    },
  };
  const section = {
    querySelectorAll(selector) {
      if (selector === "button") return [addButton];
      if (selector.includes("[role='heading']")) {
        return rows.map((entry, index) => ({
          textContent: `Websites ${index + 1}`,
          parentElement: entry,
        }));
      }
      return [];
    },
  };
  row.parentElement = section;
  const addButton = {
    textContent: "Add",
    click() {
      setTimeout(() => rows.push(row), 250);
    },
  };
  const documentObject = {
    defaultView: { setTimeout },
    querySelector() {
      return section;
    },
  };

  const verified = await applyWorkdayRepeater(
    {
      field_id: "jobflow-workday-websites",
      selector:
        '[data-jobflow-workday-repeater="jobflow-workday-websites"]',
      value: [{ url: "https://example.dev" }],
    },
    documentObject,
  );

  assert.equal(verified, true);
  assert.equal(input.value, "https://example.dev");
});

test("Workday repeat action resolves controls outside the row heading", async () => {
  const input = {
    tagName: "INPUT",
    value: "",
    getAttribute() {
      return "";
    },
    dispatchEvent() {},
  };
  const row = {
    parentElement: null,
    querySelector(selector) {
      return selector === "input" ? input : null;
    },
    querySelectorAll(selector) {
      return selector === "button" ? [{ textContent: "Delete" }] : [];
    },
  };
  const headingBar = {
    parentElement: row,
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      return selector === "button" ? [{ textContent: "Delete" }] : [];
    },
  };
  const section = {
    querySelectorAll(selector) {
      if (selector.includes("[role='heading']")) {
        return [{ textContent: "Websites 1", parentElement: headingBar }];
      }
      return [];
    },
  };
  row.parentElement = section;
  const documentObject = {
    defaultView: { setTimeout },
    querySelector() {
      return section;
    },
  };

  const verified = await applyWorkdayRepeater(
    {
      field_id: "jobflow-workday-websites",
      selector:
        '[data-jobflow-workday-repeater="jobflow-workday-websites"]',
      value: [{ url: "https://example.dev" }],
    },
    documentObject,
  );

  assert.equal(verified, true);
  assert.equal(input.value, "https://example.dev");
});

test("Workday repeat action fills a structured work experience row", async () => {
  const makeInput = () => ({
    tagName: "INPUT",
    value: "",
    checked: false,
    getAttribute() {
      return "";
    },
    dispatchEvent() {},
  });
  const controls = {
    jobTitle: makeInput(),
    companyName: makeInput(),
    location: makeInput(),
    current: makeInput(),
    description: { ...makeInput(), tagName: "TEXTAREA" },
    months: [makeInput(), makeInput()],
    years: [makeInput(), makeInput()],
  };
  let row = null;
  const section = {
    querySelectorAll(selector) {
      if (selector === "button") return [addButton];
      if (selector.includes("[role='heading']") && row) {
        return [{ textContent: "Work Experience 1", parentElement: row }];
      }
      return [];
    },
  };
  const addButton = {
    textContent: "Add",
    click() {
      row = {
        parentElement: section,
        querySelector(selector) {
          return {
            '[name="jobTitle"]': controls.jobTitle,
            '[name="companyName"]': controls.companyName,
            '[name="location"]': controls.location,
            '[name="currentlyWorkHere"]': controls.current,
            textarea: controls.description,
          }[selector] || null;
        },
        querySelectorAll(selector) {
          if (selector === "button") return [{ textContent: "Delete" }];
          if (selector === '[data-automation-id="dateSectionMonth-input"]') {
            return controls.months;
          }
          if (selector === '[data-automation-id="dateSectionYear-input"]') {
            return controls.years;
          }
          return [];
        },
      };
    },
  };
  const documentObject = {
    defaultView: { setTimeout },
    querySelector() {
      return section;
    },
  };

  const verified = await applyWorkdayRepeater(
    {
      field_id: "jobflow-workday-work-experience",
      selector:
        '[data-jobflow-workday-repeater="jobflow-workday-work-experience"]',
      value: [
        {
          job_title: "Site Reliability Engineer",
          company: "Example Inc.",
          location: "New York, NY",
          current: false,
          start_date: "2022-01",
          end_date: "2024-06",
          description: "Operated production services.",
        },
      ],
    },
    documentObject,
  );

  assert.equal(verified, true);
  assert.equal(controls.jobTitle.value, "Site Reliability Engineer");
  assert.equal(controls.companyName.value, "Example Inc.");
  assert.equal(controls.location.value, "New York, NY");
  assert.equal(controls.current.checked, false);
  assert.deepEqual(controls.months.map((control) => control.value), ["01", "06"]);
  assert.deepEqual(controls.years.map((control) => control.value), ["2022", "2024"]);
  assert.equal(controls.description.value, "Operated production services.");
});

test("Workday repeat action selects structured education values", async () => {
  const makeInput = () => ({
    tagName: "INPUT",
    value: "",
    getAttribute() {
      return "";
    },
    dispatchEvent() {},
    focus() {},
  });
  const school = makeInput();
  const fieldOfStudy = makeInput();
  const months = [makeInput(), makeInput()];
  const years = [makeInput(), makeInput()];
  const degree = {
    tagName: "SELECT",
    value: "",
    options: [
      { value: "", textContent: "Select One" },
      { value: "bachelors", textContent: "Bachelor's Degree" },
    ],
    dispatchEvent() {},
  };
  const educationStatus = {
    tagName: "SELECT",
    value: "",
    options: [
      { value: "", textContent: "Select One" },
      { value: "attending", textContent: "Attending" },
      { value: "graduated", textContent: "Graduated" },
    ],
    dispatchEvent() {},
  };
  const options = [
    {
      textContent: "Queens College",
      ownerDocument: null,
      getClientRects() {
        return [{}];
      },
      closest() {
        return null;
      },
      click() {
        school.value = this.textContent;
      },
    },
    {
      textContent: "Computer Science",
      ownerDocument: null,
      getClientRects() {
        return [{}];
      },
      closest() {
        return null;
      },
      click() {
        fieldOfStudy.value = this.textContent;
      },
    },
  ];
  let row = null;
  const section = {
    querySelectorAll(selector) {
      if (selector === "button") return [addButton];
      if (selector.includes("[role='heading']") && row) {
        return [{ textContent: "Education 1", parentElement: row }];
      }
      return [];
    },
  };
  const addButton = {
    textContent: "Add",
    click() {
      row = {
        parentElement: section,
        querySelector(selector) {
          return {
            '[data-automation-id="searchBox"]': school,
            '[name="degree"]': degree,
            '[id$="--fieldOfStudy"]': fieldOfStudy,
            '[name="educationStatus"]': educationStatus,
          }[selector] || null;
        },
        querySelectorAll(selector) {
          if (selector === '[data-automation-id="dateSectionMonth-input"]') {
            return months;
          }
          if (selector === '[data-automation-id="dateSectionYear-input"]') {
            return years;
          }
          return selector === "button" ? [{ textContent: "Delete" }] : [];
        },
      };
    },
  };
  const documentObject = {
    defaultView: { setTimeout },
    querySelector() {
      return section;
    },
    querySelectorAll(selector) {
      return selector.includes('[role="option"]') ? options : [];
    },
  };

  const verified = await applyWorkdayRepeater(
    {
      field_id: "jobflow-workday-education",
      selector: '[data-jobflow-workday-repeater="jobflow-workday-education"]',
      value: [
        {
          school: "Queens College",
          degree: "Bachelor's Degree",
          field_of_study: "Computer Science",
          start_date: "2018-08",
          end_date: "2022-05",
          status: "graduated",
        },
      ],
    },
    documentObject,
  );

  assert.equal(verified, true);
  assert.equal(school.value, "Queens College");
  assert.equal(degree.value, "bachelors");
  assert.equal(fieldOfStudy.value, "Computer Science");
  assert.deepEqual(months.map((control) => control.value), ["08", "05"]);
  assert.deepEqual(years.map((control) => control.value), ["2018", "2022"]);
  assert.equal(educationStatus.value, "graduated");
});

test("Workday repeat action keeps already selected education values", async () => {
  const school = {
    tagName: "INPUT",
    value: "Queens College",
    getAttribute() {
      return "";
    },
    dispatchEvent() {},
    focus() {},
  };
  const fieldOfStudy = {
    ...school,
    value: "Computer Science",
  };
  const row = {
    parentElement: null,
    querySelector(selector) {
      return {
        '[data-automation-id="searchBox"]': school,
        '[id$="--fieldOfStudy"]': fieldOfStudy,
      }[selector] || null;
    },
    querySelectorAll(selector) {
      return selector === "button" ? [{ textContent: "Delete" }] : [];
    },
  };
  const section = {
    querySelectorAll(selector) {
      if (selector.includes("[role='heading']")) {
        return [{ textContent: "Education 1", parentElement: row }];
      }
      return [];
    },
  };
  row.parentElement = section;
  const documentObject = {
    defaultView: {
      setTimeout(callback) {
        callback();
      },
    },
    querySelector() {
      return section;
    },
    querySelectorAll() {
      return [];
    },
  };

  const verified = await applyWorkdayRepeater(
    {
      field_id: "jobflow-workday-education",
      selector: '[data-jobflow-workday-repeater="jobflow-workday-education"]',
      value: [
        {
          school: "Queens College",
          degree: "",
          field_of_study: "Computer Science",
        },
      ],
    },
    documentObject,
  );

  assert.equal(verified, true);
  assert.equal(school.value, "Queens College");
  assert.equal(fieldOfStudy.value, "Computer Science");
});

test("Workday repeat action fills a structured certification row", async () => {
  const makeInput = () => ({
    tagName: "INPUT",
    value: "",
    getAttribute() {
      return "";
    },
    dispatchEvent() {},
    focus() {},
  });
  const name = makeInput();
  const number = makeInput();
  const months = [makeInput(), makeInput()];
  const days = [makeInput(), makeInput()];
  const years = [makeInput(), makeInput()];
  const option = {
    textContent: "AWS Certified Developer",
    ownerDocument: null,
    getClientRects() {
      return [{}];
    },
    closest() {
      return null;
    },
    click() {
      name.value = this.textContent;
    },
  };
  let row = null;
  const section = {
    querySelectorAll(selector) {
      if (selector === "button") return [addButton];
      if (selector.includes("[role='heading']") && row) {
        return [{ textContent: "Certifications 1", parentElement: row }];
      }
      return [];
    },
  };
  const addButton = {
    textContent: "Add",
    click() {
      row = {
        parentElement: section,
        querySelector(selector) {
          return {
            '[data-automation-id="searchBox"]': name,
            '[name="certificationNumber"]': number,
          }[selector] || null;
        },
        querySelectorAll(selector) {
          if (selector === "button") return [{ textContent: "Delete" }];
          if (selector === '[data-automation-id="dateSectionMonth-input"]') {
            return months;
          }
          if (selector === '[data-automation-id="dateSectionDay-input"]') {
            return days;
          }
          if (selector === '[data-automation-id="dateSectionYear-input"]') {
            return years;
          }
          return [];
        },
      };
    },
  };
  const documentObject = {
    defaultView: { setTimeout },
    querySelector() {
      return section;
    },
    querySelectorAll(selector) {
      return selector.includes('[role="option"]') ? [option] : [];
    },
  };

  const verified = await applyWorkdayRepeater(
    {
      field_id: "jobflow-workday-certifications",
      selector:
        '[data-jobflow-workday-repeater="jobflow-workday-certifications"]',
      value: [
        {
          name: "AWS Certified Developer",
          number: "ABC-123",
          issued_date: "2024-01-15",
          expiration_date: "2027-06-30",
        },
      ],
    },
    documentObject,
  );

  assert.equal(verified, true);
  assert.equal(name.value, "AWS Certified Developer");
  assert.equal(number.value, "ABC-123");
  assert.deepEqual(months.map((control) => control.value), ["01", "06"]);
  assert.deepEqual(days.map((control) => control.value), ["15", "30"]);
  assert.deepEqual(years.map((control) => control.value), ["2024", "2027"]);
});
