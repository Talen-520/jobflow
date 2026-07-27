export type LocationOption = {
  value: string;
  label: string;
};

const ISO_COUNTRY_CODES = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM
BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX
CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG
GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR
IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV
LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE
NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO
RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF
TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF
WS YE YT ZA ZM ZW
`
  .trim()
  .split(/\s+/);

const US_STATES: Array<[string, string]> = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["DC", "District of Columbia"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
];

const CANADIAN_PROVINCES: Array<[string, string]> = [
  ["AB", "Alberta"],
  ["BC", "British Columbia"],
  ["MB", "Manitoba"],
  ["NB", "New Brunswick"],
  ["NL", "Newfoundland and Labrador"],
  ["NS", "Nova Scotia"],
  ["NT", "Northwest Territories"],
  ["NU", "Nunavut"],
  ["ON", "Ontario"],
  ["PE", "Prince Edward Island"],
  ["QC", "Quebec"],
  ["SK", "Saskatchewan"],
  ["YT", "Yukon"],
];

const US_CITIES = [
  "New York",
  "Los Angeles",
  "Chicago",
  "Houston",
  "Phoenix",
  "Philadelphia",
  "San Antonio",
  "San Diego",
  "Dallas",
  "San Jose",
  "Austin",
  "Jacksonville",
  "Fort Worth",
  "Columbus",
  "Charlotte",
  "Indianapolis",
  "Seattle",
  "Denver",
  "Washington",
  "Boston",
  "Nashville",
  "Detroit",
  "Portland",
  "Las Vegas",
  "Baltimore",
  "Milwaukee",
  "Atlanta",
  "Miami",
  "Raleigh",
  "Minneapolis",
  "Tampa",
  "Cleveland",
  "Pittsburgh",
  "Richmond",
  "Salt Lake City",
  "Orlando",
  "Sacramento",
  "San Francisco",
  "Kansas City",
  "St. Louis",
  "Cincinnati",
  "Buffalo",
  "Rochester",
  "Jersey City",
  "Newark",
];

const CANADIAN_CITIES = [
  "Toronto",
  "Montreal",
  "Vancouver",
  "Calgary",
  "Edmonton",
  "Ottawa",
  "Winnipeg",
  "Quebec City",
  "Hamilton",
  "Halifax",
  "Victoria",
  "Saskatoon",
  "Regina",
];

const displayNames =
  typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

export const COUNTRY_OPTIONS: LocationOption[] = ISO_COUNTRY_CODES.map((code) => ({
  value: code,
  label: displayNames?.of(code) || code,
})).sort((left, right) => left.label.localeCompare(right.label));

export function normalizeCountryCode(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "";
  const compact = normalized.toLowerCase().replace(/[^a-z]/g, "");
  if (["us", "usa", "unitedstates", "unitedstatesofamerica"].includes(compact)) {
    return "US";
  }
  if (["ca", "canada"].includes(compact)) return "CA";
  const upper = normalized.toUpperCase();
  if (ISO_COUNTRY_CODES.includes(upper)) return upper;
  const country = COUNTRY_OPTIONS.find(
    (option) => option.label.toLowerCase() === normalized.toLowerCase(),
  );
  return country?.value || normalized;
}

export function stateOptionsForCountry(country: string): LocationOption[] {
  const normalizedCountry = normalizeCountryCode(country);
  const entries =
    normalizedCountry === "US"
      ? US_STATES
      : normalizedCountry === "CA"
        ? CANADIAN_PROVINCES
        : [];
  return entries.map(([value, label]) => ({ value, label }));
}

export function normalizeStateCode(value: string, country: string): string {
  const normalized = value.trim();
  if (!normalized) return "";
  const options = stateOptionsForCountry(country);
  const upper = normalized.toUpperCase();
  const match = options.find(
    (option) =>
      option.value === upper ||
      option.label.toLowerCase() === normalized.toLowerCase(),
  );
  return match?.value || normalized;
}

export function cityOptionsForCountry(country: string): string[] {
  const normalizedCountry = normalizeCountryCode(country);
  if (normalizedCountry === "US") return US_CITIES;
  if (normalizedCountry === "CA") return CANADIAN_CITIES;
  return [];
}
