const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const desktopRoot = path.resolve(__dirname, "..");

test("Education uses searchable canonical suggestion inputs", () => {
  const pageSource = fs.readFileSync(
    path.join(desktopRoot, "src/components/pages.tsx"),
    "utf8",
  );
  const optionSource = fs.readFileSync(
    path.join(desktopRoot, "src/lib/education-options.ts"),
    "utf8",
  );
  const styleSource = fs.readFileSync(
    path.join(desktopRoot, "src/index.css"),
    "utf8",
  );

  assert.match(
    pageSource,
    /label="School or university"[\s\S]+options=\{EDUCATION_SCHOOL_OPTIONS\}/,
  );
  assert.match(
    pageSource,
    /label="Degree"[\s\S]+options=\{EDUCATION_DEGREE_OPTIONS\}/,
  );
  assert.match(
    pageSource,
    /label="Field of study"[\s\S]+options=\{EDUCATION_FIELD_OPTIONS\}/,
  );
  assert.match(pageSource, /const listId = useId\(\)/);
  assert.match(pageSource, /profile-combobox-input/);
  assert.match(pageSource, /<IoChevronDown className="pointer-events-none/);
  assert.match(
    styleSource,
    /\.profile-combobox-input\[list\]::-webkit-calendar-picker-indicator/,
  );
  assert.match(optionSource, /export function canonicalEducationOption/);
  assert.match(optionSource, /\bBS:\s*"Bachelor's Degree"/);
  assert.match(optionSource, /\bCS:\s*"Computer Science"/);
});
