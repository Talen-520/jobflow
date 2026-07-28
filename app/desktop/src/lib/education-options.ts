export const EDUCATION_SCHOOL_OPTIONS = [
  "Arizona State University",
  "Boston University",
  "Carnegie Mellon University",
  "Columbia University",
  "Cornell University",
  "CUNY Baruch College",
  "CUNY City College",
  "CUNY Hunter College",
  "Georgia Institute of Technology",
  "Harvard University",
  "Massachusetts Institute of Technology",
  "New York University",
  "Northeastern University",
  "Pennsylvania State University",
  "Princeton University",
  "Purdue University",
  "Queens College",
  "Rutgers University",
  "Stanford University",
  "Stony Brook University",
  "SUNY Binghamton University",
  "SUNY University at Albany",
  "SUNY University at Buffalo",
  "University of California, Berkeley",
  "University of California, Davis",
  "University of California, Irvine",
  "University of California, Los Angeles",
  "University of California, San Diego",
  "University of Chicago",
  "University of Illinois Urbana-Champaign",
  "University of Maryland",
  "University of Michigan",
  "University of Pennsylvania",
  "University of Southern California",
  "University of Texas at Austin",
  "University of Washington",
  "University of Wisconsin-Madison",
  "Virginia Tech",
  "Yale University",
] as const;

export const EDUCATION_DEGREE_OPTIONS = [
  "High School Diploma",
  "GED",
  "Associate's Degree",
  "Bachelor's Degree",
  "Master's Degree",
  "Doctoral Degree",
  "Professional Degree",
  "Juris Doctor (JD)",
  "Master of Business Administration (MBA)",
  "Certificate",
  "Other",
] as const;

export const EDUCATION_DEGREE_ALIASES = {
  AA: "Associate's Degree",
  AS: "Associate's Degree",
  BA: "Bachelor's Degree",
  BS: "Bachelor's Degree",
  BSc: "Bachelor's Degree",
  MA: "Master's Degree",
  MS: "Master's Degree",
  MSc: "Master's Degree",
  MBA: "Master of Business Administration (MBA)",
  JD: "Juris Doctor (JD)",
  PhD: "Doctoral Degree",
  Doctorate: "Doctoral Degree",
} as const;

export const EDUCATION_FIELD_OPTIONS = [
  "Accounting",
  "Aerospace Engineering",
  "Applied Mathematics",
  "Artificial Intelligence",
  "Biology",
  "Business Administration",
  "Chemical Engineering",
  "Civil Engineering",
  "Communications",
  "Computer Engineering",
  "Computer Science",
  "Cybersecurity",
  "Data Science",
  "Economics",
  "Electrical Engineering",
  "English",
  "Finance",
  "Information Systems",
  "Information Technology",
  "International Relations",
  "Journalism",
  "Mathematics",
  "Mechanical Engineering",
  "Philosophy",
  "Physics",
  "Political Science",
  "Psychology",
  "Public Health",
  "Software Engineering",
  "Statistics",
  "Other",
] as const;

export const EDUCATION_FIELD_ALIASES = {
  AI: "Artificial Intelligence",
  CS: "Computer Science",
  Cyber: "Cybersecurity",
  DS: "Data Science",
  EE: "Electrical Engineering",
  IS: "Information Systems",
  IT: "Information Technology",
  Math: "Mathematics",
  ME: "Mechanical Engineering",
  SWE: "Software Engineering",
} as const;

function normalizedEducationValue(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function canonicalEducationOption(
  value: string,
  options: readonly string[],
  aliases: Readonly<Record<string, string>> = {},
): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const normalized = normalizedEducationValue(trimmed);
  const option = options.find(
    (candidate) => normalizedEducationValue(candidate) === normalized,
  );
  if (option) return option;
  const alias = Object.entries(aliases).find(
    ([candidate]) => normalizedEducationValue(candidate) === normalized,
  );
  return alias?.[1] ?? trimmed;
}
