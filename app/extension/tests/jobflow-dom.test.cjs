const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyFillPlan,
  captchaPresent,
  choiceButtonSelected,
  choiceTextMatches,
  choiceValueAliases,
  ashbyRadioGroup,
  decodeDocumentPayload,
  eligiblePlanItems,
  recordHints,
  textValueMatches,
  waitForChoiceState,
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
  assert.equal(choiceTextMatches("Female", "Male"), false);
});

test("custom combobox values accept boolean Yes and No aliases", () => {
  assert.deepEqual(choiceValueAliases("True"), ["yes", "true"]);
  assert.deepEqual(choiceValueAliases("false"), ["no", "false"]);
  assert.deepEqual(choiceValueAliases("LinkedIn"), ["linkedin"]);
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
