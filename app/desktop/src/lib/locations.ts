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

const CITY_SUGGESTIONS_BY_REGION: Record<string, string[]> = {
  "US-AL": ["Montgomery", "Birmingham", "Huntsville", "Mobile"],
  "US-AK": ["Juneau", "Anchorage", "Fairbanks"],
  "US-AZ": ["Phoenix", "Tucson", "Mesa", "Scottsdale", "Tempe"],
  "US-AR": ["Little Rock", "Fayetteville", "Fort Smith"],
  "US-CA": ["Sacramento", "Los Angeles", "San Diego", "San Francisco", "San Jose", "Oakland", "Irvine"],
  "US-CO": ["Denver", "Colorado Springs", "Boulder", "Fort Collins"],
  "US-CT": ["Hartford", "Bridgeport", "New Haven", "Stamford"],
  "US-DE": ["Dover", "Wilmington", "Newark"],
  "US-DC": ["Washington"],
  "US-FL": ["Tallahassee", "Jacksonville", "Miami", "Tampa", "Orlando"],
  "US-GA": ["Atlanta", "Savannah", "Augusta"],
  "US-HI": ["Honolulu", "Hilo"],
  "US-ID": ["Boise", "Idaho Falls", "Coeur d'Alene"],
  "US-IL": ["Springfield", "Chicago", "Rockford"],
  "US-IN": ["Indianapolis", "Fort Wayne", "Bloomington"],
  "US-IA": ["Des Moines", "Cedar Rapids", "Iowa City"],
  "US-KS": ["Topeka", "Wichita", "Overland Park"],
  "US-KY": ["Frankfort", "Louisville", "Lexington"],
  "US-LA": ["Baton Rouge", "New Orleans", "Shreveport"],
  "US-ME": ["Augusta", "Portland", "Bangor"],
  "US-MD": ["Annapolis", "Baltimore", "Rockville", "Silver Spring"],
  "US-MA": ["Boston", "Worcester", "Cambridge", "Springfield"],
  "US-MI": ["Lansing", "Detroit", "Ann Arbor", "Grand Rapids"],
  "US-MN": ["Saint Paul", "Minneapolis", "Rochester", "Duluth"],
  "US-MS": ["Jackson", "Gulfport", "Hattiesburg"],
  "US-MO": ["Jefferson City", "Kansas City", "St. Louis", "Springfield"],
  "US-MT": ["Helena", "Billings", "Missoula", "Bozeman"],
  "US-NE": ["Lincoln", "Omaha", "Bellevue"],
  "US-NV": ["Carson City", "Las Vegas", "Reno", "Henderson"],
  "US-NH": ["Concord", "Manchester", "Nashua"],
  "US-NJ": ["Trenton", "Newark", "Jersey City", "Princeton"],
  "US-NM": ["Santa Fe", "Albuquerque", "Las Cruces"],
  "US-NY": ["Albany", "New York", "Buffalo", "Rochester", "Syracuse", "Yonkers"],
  "US-NC": ["Raleigh", "Charlotte", "Durham", "Greensboro"],
  "US-ND": ["Bismarck", "Fargo", "Grand Forks"],
  "US-OH": ["Columbus", "Cleveland", "Cincinnati", "Dayton"],
  "US-OK": ["Oklahoma City", "Tulsa", "Norman"],
  "US-OR": ["Salem", "Portland", "Eugene", "Bend"],
  "US-PA": ["Harrisburg", "Philadelphia", "Pittsburgh", "Allentown"],
  "US-RI": ["Providence", "Warwick", "Newport"],
  "US-SC": ["Columbia", "Charleston", "Greenville"],
  "US-SD": ["Pierre", "Sioux Falls", "Rapid City"],
  "US-TN": ["Nashville", "Memphis", "Knoxville", "Chattanooga"],
  "US-TX": ["Austin", "Houston", "Dallas", "San Antonio", "Fort Worth"],
  "US-UT": ["Salt Lake City", "Provo", "Ogden"],
  "US-VT": ["Montpelier", "Burlington", "Rutland"],
  "US-VA": ["Richmond", "Virginia Beach", "Norfolk", "Arlington", "Reston", "Alexandria"],
  "US-WA": ["Olympia", "Seattle", "Spokane", "Tacoma", "Bellevue"],
  "US-WV": ["Charleston", "Morgantown", "Huntington"],
  "US-WI": ["Madison", "Milwaukee", "Green Bay"],
  "US-WY": ["Cheyenne", "Casper", "Laramie"],
  "CA-AB": ["Edmonton", "Calgary", "Red Deer"],
  "CA-BC": ["Victoria", "Vancouver", "Surrey"],
  "CA-MB": ["Winnipeg", "Brandon"],
  "CA-NB": ["Fredericton", "Moncton", "Saint John"],
  "CA-NL": ["St. John's", "Corner Brook"],
  "CA-NS": ["Halifax", "Sydney"],
  "CA-NT": ["Yellowknife"],
  "CA-NU": ["Iqaluit"],
  "CA-ON": ["Toronto", "Ottawa", "Hamilton", "Waterloo"],
  "CA-PE": ["Charlottetown", "Summerside"],
  "CA-QC": ["Quebec City", "Montreal", "Laval"],
  "CA-SK": ["Regina", "Saskatoon"],
  "CA-YT": ["Whitehorse"],
};

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

export function cityOptionsForCountry(country: string, state = ""): string[] {
  const normalizedCountry = normalizeCountryCode(country);
  const normalizedState = normalizeStateCode(state, normalizedCountry);
  const regional = CITY_SUGGESTIONS_BY_REGION[`${normalizedCountry}-${normalizedState}`];
  if (regional) return regional;
  if (!["US", "CA"].includes(normalizedCountry)) return [];
  return Array.from(
    new Set(
      Object.entries(CITY_SUGGESTIONS_BY_REGION)
        .filter(([key]) => key.startsWith(`${normalizedCountry}-`))
        .flatMap(([, cities]) => cities),
    ),
  ).sort((left, right) => left.localeCompare(right));
}
