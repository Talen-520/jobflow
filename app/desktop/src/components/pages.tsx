import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileText,
  Plug,
  ShieldCheck,
} from "lucide-react";
import {
  IoAdd,
  IoCalendarOutline,
  IoCheckmarkDoneSharp,
  IoChevronDown,
  IoHelpCircleOutline,
  IoTrashOutline,
} from "react-icons/io5";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  type ApplicationRecord,
  type DataExport,
  defaultPreferences,
  deleteCredential,
  deleteDocument,
  emptyProfile,
  exportData,
  type FillPlan,
  type FillResult,
  type Fact,
  type FormSchema,
  getPreferences,
  getCredentialStatus,
  getExtensionStatus,
  getProfile,
  importData,
  type Preferences,
  type Profile,
  putCredential,
  putPreferences,
  putProfile,
  uploadDocument,
  type CredentialStatus,
  type ExtensionStatus,
  type RemoteAIProvider,
} from "@/lib/api";
import {
  cityOptionsForCountry,
  COUNTRY_OPTIONS,
  normalizeCountryCode,
  normalizeStateCode,
  stateOptionsForCountry,
} from "@/lib/locations";
import { cn } from "@/lib/utils";

type ModelOption = {
  value: string;
  label: string;
};

type ProfileFactCollection = "experience_facts" | "education" | "certifications";

const AI_PROVIDER_OPTIONS: Array<{
  value: Preferences["ai_provider"];
  label: string;
  description: string;
}> = [
  {
    value: "ollama",
    label: "Ollama",
    description: "Use a local Ollama model and enter the local model name manually.",
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    description: "Use DeepSeek API models from the current official model list.",
  },
  {
    value: "openai",
    label: "OpenAI",
    description: "Use OpenAI API models from the current official model list.",
  },
  {
    value: "gemini",
    label: "Gemini",
    description: "Use Gemini API models from the current official model list.",
  },
];

const API_MODEL_OPTIONS: Partial<Record<Preferences["ai_provider"], ModelOption[]>> = {
  deepseek: [
    { value: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
    { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  ],
  openai: [
    { value: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
    { value: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
    { value: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
  ],
  gemini: [
    { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
    { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
    { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
  ],
};

const DEFAULT_MODEL_BY_PROVIDER: Record<Preferences["ai_provider"], string> = {
  ollama: "llama3.1:8b",
  deepseek: "deepseek-v4-flash",
  openai: "gpt-5.6-terra",
  gemini: "gemini-3.5-flash",
  custom: "",
};

const DEFAULT_BASE_URL_BY_PROVIDER: Partial<Record<Preferences["ai_provider"], string>> = {
  ollama: "http://127.0.0.1:11434",
  deepseek: "https://api.deepseek.com",
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com",
};

export function ProfilePage({
  backendOnline,
  onProfileUpdated,
}: {
  backendOnline: boolean;
  onProfileUpdated?: (profile: Profile) => void;
}) {
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [status, setStatus] = useState("Not loaded");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSavedProfileRef = useRef("");
  const resumeDocument = profile.documents.find((document) => document.kind === "resume");

  useEffect(() => {
    if (!backendOnline) {
      setProfileLoaded(false);
      return;
    }
    const controller = new AbortController();
    getProfile(controller.signal)
      .then((loaded) => {
        lastSavedProfileRef.current = JSON.stringify(loaded);
        setProfile(normalizeProfileGeography(loaded));
        setProfileLoaded(true);
        setStatus("Loaded. Changes auto-save.");
      })
      .catch(() => {
        lastSavedProfileRef.current = JSON.stringify(emptyProfile);
        setProfileLoaded(true);
        setStatus("Using local draft. Changes auto-save when backend is available.");
      });
    return () => controller.abort();
  }, [backendOnline]);

  useEffect(() => {
    if (!backendOnline || !profileLoaded) {
      return;
    }

    const serialized = JSON.stringify(profile);
    if (serialized === lastSavedProfileRef.current) {
      return;
    }

    setStatus("Auto-saving...");
    const timeout = window.setTimeout(() => {
      void putProfile(profile)
        .then((saved) => {
          const normalized = normalizeProfileGeography(saved);
          lastSavedProfileRef.current = JSON.stringify(normalized);
          setProfile(normalized);
          onProfileUpdated?.(normalized);
          setStatus("Saved locally");
        })
        .catch(() => setStatus("Auto-save failed. Backend unavailable."));
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [backendOnline, onProfileUpdated, profile, profileLoaded]);

  const updateIdentity = (key: keyof Profile["identity"], value: string) => {
    setProfile((current) => ({
      ...current,
      identity: { ...current.identity, [key]: value },
    }));
  };

  const updateCountry = (value: string) => {
    const country = normalizeCountryCode(value);
    setProfile((current) => {
      const state = normalizeStateCode(current.identity.state, country);
      const stateOptions = stateOptionsForCountry(country);
      return {
        ...current,
        identity: {
          ...current.identity,
          country,
          state:
            stateOptions.length && !stateOptions.some((option) => option.value === state)
              ? ""
              : state,
        },
      };
    });
  };

  const updateLink = (key: keyof Profile["links"], value: string) => {
    setProfile((current) => ({
      ...current,
      links: { ...current.links, [key]: value },
    }));
  };

  const updateWorkAuthorization = (
    key: keyof Profile["work_authorization"],
    value: string | boolean | null,
  ) => {
    setProfile((current) => ({
      ...current,
      work_authorization: {
        ...current.work_authorization,
        country:
          key === "authorized" || key === "requires_sponsorship"
            ? "US"
            : current.work_authorization.country,
        [key]: value,
      },
    }));
  };

  const updatePreference = (key: string, value: string | boolean | null) => {
    setProfile((current) => ({
      ...current,
      preferences: { ...current.preferences, [key]: value },
    }));
  };

  const addProfileFact = (collection: ProfileFactCollection) => {
    setProfile((current) => ({
      ...current,
      [collection]: [...current[collection], createProfileFact()],
    }));
  };

  const updateProfileFact = (
    collection: ProfileFactCollection,
    index: number,
    key: keyof Fact,
    value: string | boolean,
  ) => {
    setProfile((current) => ({
      ...current,
      [collection]: current[collection].map((fact, factIndex) =>
        factIndex === index ? { ...fact, [key]: value } : fact,
      ),
    }));
  };

  const removeProfileFact = (collection: ProfileFactCollection, index: number) => {
    setProfile((current) => ({
      ...current,
      [collection]: current[collection].filter(
        (_, factIndex) => factIndex !== index,
      ),
    }));
  };

  const uploadResume = async (file: File | null) => {
    if (!file) {
      return;
    }
    setStatus("Uploading resume...");
    try {
      const document = await uploadDocument(file, {
        kind: "resume",
        name: file.name,
      });
      const updated = await getProfile();
      const normalized = normalizeProfileGeography(updated);
      lastSavedProfileRef.current = JSON.stringify(normalized);
      setProfile(normalized);
      onProfileUpdated?.(normalized);
      setStatus("Resume replaced locally");
    } catch {
      setStatus("Resume upload failed");
    }
  };

  const handleResumeFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    void uploadResume(file);
    event.target.value = "";
  };

  const removeResume = async () => {
    if (!resumeDocument?.id) {
      setStatus("No uploaded resume to remove");
      return;
    }
    setStatus("Removing resume...");
    try {
      await deleteDocument(resumeDocument.id);
      const updated = await getProfile();
      const normalized = normalizeProfileGeography(updated);
      lastSavedProfileRef.current = JSON.stringify(normalized);
      setProfile(normalized);
      onProfileUpdated?.(normalized);
      setStatus("Resume removed");
    } catch {
      setStatus("Resume removal failed");
    }
  };

  return (
    <PageShell
      title="Profile"
      description="Keep the information exact. JobFlow can fill only from these saved values."
    >
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-10 max-[980px]:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Application Profile</CardTitle>
            <CardDescription>
              Keep this compact and exact. These values become the allowed source
              data for common job application fields.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-4 gap-y-5 max-[760px]:grid-cols-1">
            <ProfileInput
              label="First name"
              value={profile.identity.first_name}
              onChange={(value) => updateIdentity("first_name", value)}
            />
            <ProfileInput
              label="Last name"
              value={profile.identity.last_name}
              onChange={(value) => updateIdentity("last_name", value)}
            />
            <ProfileInput
              label="Middle name"
              value={profile.identity.middle_name}
              onChange={(value) => updateIdentity("middle_name", value)}
            />
            <ProfileInput
              label="Preferred name"
              value={profile.identity.preferred_name}
              onChange={(value) => updateIdentity("preferred_name", value)}
            />
            <ProfileInput
              label="Email"
              type="email"
              value={profile.identity.email}
              onChange={(value) => updateIdentity("email", value)}
            />
            <ProfileInput
              label="Phone"
              value={profile.identity.phone}
              onChange={(value) => updateIdentity("phone", value)}
            />
            <ProfileInput
              label="Phone country code"
              value={profile.identity.phone_country_code}
              onChange={(value) => updateIdentity("phone_country_code", value)}
            />
            <ProfileInput
              label="Phone extension"
              value={profile.identity.phone_extension}
              onChange={(value) => updateIdentity("phone_extension", value)}
            />
            <ProfileInput
              label="Address line 1"
              value={profile.identity.address}
              onChange={(value) => updateIdentity("address", value)}
            />
            <ProfileInput
              label="Address line 2"
              value={profile.identity.address_line2}
              onChange={(value) => updateIdentity("address_line2", value)}
            />
            <ProfileCombobox
              description="Type any city. Suggestions follow the selected state or province."
              label="City"
              value={profile.identity.location}
              options={cityOptionsForCountry(
                profile.identity.country,
                profile.identity.state,
              )}
              onChange={(value) => updateIdentity("location", value)}
            />
            {stateOptionsForCountry(profile.identity.country).length ? (
              <ProfileSelect
                label="State / Province"
                value={profile.identity.state}
                options={[
                  { value: "", label: "Select state / province" },
                  ...stateOptionsForCountry(profile.identity.country),
                ]}
                onChange={(value) =>
                  updateIdentity(
                    "state",
                    normalizeStateCode(value, profile.identity.country),
                  )
                }
              />
            ) : (
              <ProfileCombobox
                label="State / Province"
                value={profile.identity.state}
                options={[]}
                onChange={(value) => updateIdentity("state", value)}
              />
            )}
            <ProfileInput
              label="Postal code"
              value={profile.identity.postal_code}
              onChange={(value) => updateIdentity("postal_code", value)}
            />
            <ProfileSelect
              label="Country / Territory"
              value={profile.identity.country}
              options={[
                { value: "", label: "Select country / territory" },
                ...COUNTRY_OPTIONS,
              ]}
              onChange={updateCountry}
            />
            <ProfileInput
              label="Company"
              value={profilePreference(profile, "company")}
              onChange={(value) => updatePreference("company", value)}
            />
            <ProfileInput
              label="LinkedIn URL"
              value={profile.links.linkedin}
              onChange={(value) => updateLink("linkedin", value)}
            />
            <ProfileInput
              label="GitHub URL"
              value={profile.links.github}
              onChange={(value) => updateLink("github", value)}
            />
            <ProfileInput
              label="Portfolio URL"
              value={profile.links.portfolio}
              onChange={(value) => updateLink("portfolio", value)}
            />
            <div className="col-span-2 max-[760px]:col-span-1">
              <NullableBooleanSelect
                label="Are you legally authorized to work in the US?"
                value={profile.work_authorization.authorized}
                onChange={(value) => updateWorkAuthorization("authorized", value)}
              />
            </div>
            <div className="col-span-2 max-[760px]:col-span-1">
              <NullableBooleanSelect
                label="Will you now or in the future require visa sponsorship to work in the US?"
                value={profile.work_authorization.requires_sponsorship}
                onChange={(value) =>
                  updateWorkAuthorization("requires_sponsorship", value)
                }
              />
            </div>
            <div className="col-span-2 max-[760px]:col-span-1">
              <NullableBooleanSelect
                label="Are you subject to a non-compete or non-solicitation agreement that could affect employment?"
                value={profilePreferenceBoolean(profile, "non_compete_restrictions")}
                onChange={(value) =>
                  updatePreference("non_compete_restrictions", value)
                }
              />
            </div>
            <div className="col-span-2 max-[760px]:col-span-1">
              <NullableBooleanSelect
                label="May employers send job-application updates by SMS?"
                value={profilePreferenceBoolean(profile, "sms_opt_in")}
                onChange={(value) => updatePreference("sms_opt_in", value)}
              />
            </div>
            <ProfileInput
              label="University"
              value={profilePreference(profile, "university")}
              onChange={(value) => updatePreference("university", value)}
            />
            <ProfileInput
              label="Please tell us how you heard about this opportunity."
              value={profilePreference(profile, "heard_about_opportunity")}
              onChange={(value) => updatePreference("heard_about_opportunity", value)}
            />
            <ProfileSelect
              label="Gender"
              value={profilePreference(profile, "gender")}
              options={[
                { value: "", label: "Prefer not set" },
                { value: "Male", label: "Male" },
                { value: "Female", label: "Female" },
                { value: "Non-binary", label: "Non-binary" },
                {
                  value: "I do not wish to answer",
                  label: "I do not wish to answer",
                },
              ]}
              onChange={(value) => updatePreference("gender", value)}
            />
            <ProfileSelect
              label="Race"
              value={profilePreference(profile, "race")}
              options={[
                { value: "", label: "Prefer not set" },
                {
                  value: "American Indian or Alaska Native",
                  label: "American Indian or Alaska Native",
                },
                { value: "Asian", label: "Asian" },
                {
                  value: "Black or African American",
                  label: "Black or African American",
                },
                { value: "Hispanic or Latino", label: "Hispanic or Latino" },
                {
                  value: "Native Hawaiian or Other Pacific Islander",
                  label: "Native Hawaiian or Other Pacific Islander",
                },
                { value: "White", label: "White" },
                { value: "Two or More Races", label: "Two or More Races" },
                {
                  value: "I do not wish to answer",
                  label: "I do not wish to answer",
                },
              ]}
              onChange={(value) => updatePreference("race", value)}
            />
            <ProfileSelect
              label="Disability status"
              value={profilePreference(profile, "disability_status")}
              options={[
                { value: "", label: "Prefer not set" },
                {
                  value: "Yes, I have a disability",
                  label: "Yes, I have a disability",
                },
                {
                  value: "No, I do not have a disability",
                  label: "No, I do not have a disability",
                },
                { value: "I do not wish to answer", label: "I do not wish to answer" },
              ]}
              onChange={(value) => updatePreference("disability_status", value)}
            />
            <ProfileSelect
              label="Veteran status"
              value={profilePreference(profile, "veteran_status")}
              options={[
                { value: "", label: "Prefer not set" },
                {
                  value: "I am not a protected veteran",
                  label: "I am not a protected veteran",
                },
                {
                  value:
                    "I identify as one or more classifications of protected veteran",
                  label:
                    "I identify as one or more classifications of protected veteran",
                },
                { value: "I do not wish to answer", label: "I do not wish to answer" },
              ]}
              onChange={(value) => updatePreference("veteran_status", value)}
            />
            <div className="col-span-2 max-[760px]:col-span-1">
              <ProfileTextarea
                description="Add verified background, strengths, interests, and writing preferences for AI open answers. JobFlow treats this text as user-provided source material."
                label="AI answer context"
                maxLength={6000}
                value={profile.ai_context ?? ""}
                onChange={(value) =>
                  setProfile((current) => ({ ...current, ai_context: value }))
                }
              />
            </div>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Resume</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div
                className={cn(
                  "min-w-0 rounded-md bg-muted px-3 py-3 text-sm",
                  resumeDocument ? "font-medium" : "text-muted-foreground",
                )}
                title={resumeDocument?.name}
              >
                <span className="block truncate">
                  {resumeDocument?.name || "Empty"}
                </span>
              </div>
              <Input
                ref={fileInputRef}
                accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                className="hidden"
                type="file"
                onChange={handleResumeFileSelected}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!backendOnline}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {resumeDocument ? (
                    <IoCheckmarkDoneSharp data-icon="inline-start" />
                  ) : (
                    <IoAdd data-icon="inline-start" />
                  )}
                  {resumeDocument ? "Replace Resume" : "Add Resume"}
                </Button>
                <Button
                  disabled={!backendOnline || !resumeDocument}
                  variant="outline"
                  onClick={removeResume}
                >
                  Remove
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Local Status</CardTitle>
              <CardDescription>{status}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <InfoLine label="Backend" value={backendOnline ? "Online" : "Offline"} />
              <InfoLine label="Resume" value={resumeDocument ? "Uploaded" : "Missing"} />
              <InfoLine
                label="Work authorized"
                value={formatNullableBoolean(profile.work_authorization.authorized)}
              />
              <InfoLine
                label="Needs sponsorship"
                value={formatNullableBoolean(
                  profile.work_authorization.requires_sponsorship,
                )}
              />
              <div className="rounded-md bg-muted p-3 text-muted-foreground">
                Open answers and sensitive fields are never invented. Missing values
                stay blank or pause for review.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <section className="pt-2">
        <div>
          <h2 className="text-2xl font-semibold">Optional Background</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Add only verified details. These entries become source material for
            matching application fields and AI answers.
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <ProfileFactEditor
            emptyLabel="No work experience added."
            facts={profile.experience_facts}
            kind="experience_facts"
            title="Work Experience"
            onAdd={() => addProfileFact("experience_facts")}
            onRemove={(index) => removeProfileFact("experience_facts", index)}
            onUpdate={(index, key, value) =>
              updateProfileFact("experience_facts", index, key, value)
            }
          />
          <ProfileFactEditor
            emptyLabel="No education added."
            facts={profile.education}
            kind="education"
            title="Education"
            onAdd={() => addProfileFact("education")}
            onRemove={(index) => removeProfileFact("education", index)}
            onUpdate={(index, key, value) =>
              updateProfileFact("education", index, key, value)
            }
          />
          <ProfileFactEditor
            emptyLabel="No certifications added."
            facts={profile.certifications}
            kind="certifications"
            title="Certifications"
            onAdd={() => addProfileFact("certifications")}
            onRemove={(index) => removeProfileFact("certifications", index)}
            onUpdate={(index, key, value) =>
              updateProfileFact("certifications", index, key, value)
            }
          />
        </div>
      </section>
    </PageShell>
  );
}

function createProfileFact(): Fact {
  return {
    id: `fact_${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
    title: "",
    body: "",
    tags: [],
    source: "user",
    organization: "",
    location: "",
    start_date: "",
    end_date: "",
    current: false,
    degree: "",
    education_status: "",
    credential_number: "",
    issued_date: "",
    expiration_date: "",
  };
}

function fullNameFromProfile(profile: Profile): string {
  return [profile.identity.first_name, profile.identity.last_name]
    .filter(Boolean)
    .join(" ");
}

function normalizeProfileGeography(profile: Profile): Profile {
  const country = normalizeCountryCode(profile.identity.country);
  const state = normalizeStateCode(profile.identity.state, country);
  const aiContext = profile.ai_context ?? "";
  const education = profile.education ?? [];
  const experienceFacts = profile.experience_facts ?? [];
  const certifications = profile.certifications ?? [];
  if (
    aiContext === profile.ai_context &&
    country === profile.identity.country &&
    state === profile.identity.state &&
    education === profile.education &&
    experienceFacts === profile.experience_facts &&
    certifications === profile.certifications
  ) {
    return profile;
  }
  return {
    ...profile,
    ai_context: aiContext,
    education,
    experience_facts: experienceFacts,
    certifications,
    identity: {
      ...profile.identity,
      country,
      state,
    },
  };
}

function isValidEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}

function profilePreference(profile: Profile, key: string): string {
  const value = profile.preferences[key];
  return typeof value === "string" ? value : "";
}

function profilePreferenceBoolean(profile: Profile, key: string): boolean | null {
  const value = profile.preferences[key];
  return typeof value === "boolean" ? value : null;
}

function modelOptionsForProvider(
  provider: Preferences["ai_provider"],
  currentModel: string,
): ModelOption[] {
  const options = API_MODEL_OPTIONS[provider] ?? [];
  if (!currentModel || options.some((option) => option.value === currentModel)) {
    return options;
  }
  return [{ value: currentModel, label: `${currentModel} (saved)` }, ...options];
}

function providerLabel(provider: Preferences["ai_provider"]): string {
  return (
    AI_PROVIDER_OPTIONS.find((option) => option.value === provider)?.label ??
    provider
  );
}

export function SettingsPage({ backendOnline }: { backendOnline: boolean }) {
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [status, setStatus] = useState("Not loaded");
  const lastSavedPreferencesRef = useRef("");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [credentialDirty, setCredentialDirty] = useState(false);
  const [credentialStatus, setCredentialStatus] = useState<CredentialStatus | null>(
    null,
  );
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatus | null>(null);

  useEffect(() => {
    if (!backendOnline) {
      setExtensionStatus(null);
      return;
    }
    const controller = new AbortController();
    const refresh = () => {
      getExtensionStatus(false, controller.signal)
        .then(setExtensionStatus)
        .catch(() => setExtensionStatus(null));
    };
    refresh();
    const interval = window.setInterval(refresh, 2000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [backendOnline]);

  useEffect(() => {
    if (!backendOnline) {
      setPreferencesLoaded(false);
      return;
    }
    const controller = new AbortController();
    getPreferences(controller.signal)
      .then((loaded) => {
        lastSavedPreferencesRef.current = JSON.stringify(loaded);
        setPreferences(loaded);
        setPreferencesLoaded(true);
        setStatus("Loaded. Changes auto-save.");
      })
      .catch(() => {
        lastSavedPreferencesRef.current = JSON.stringify(defaultPreferences);
        setPreferencesLoaded(true);
        setStatus("Using defaults. Changes auto-save when backend is available.");
      });
    return () => controller.abort();
  }, [backendOnline]);

  useEffect(() => {
    setApiKeyDraft("");
    setCredentialDirty(false);
    setCredentialStatus(null);
    if (!backendOnline || preferences.ai_provider === "ollama") {
      return;
    }

    const controller = new AbortController();
    const provider = preferences.ai_provider as RemoteAIProvider;
    getCredentialStatus(provider, controller.signal)
      .then(setCredentialStatus)
      .catch(() => setStatus("Unable to read the local secrets file."));
    return () => controller.abort();
  }, [backendOnline, preferences.ai_provider]);

  useEffect(() => {
    if (!backendOnline || !preferencesLoaded) {
      return;
    }

    const serialized = JSON.stringify(preferences);
    if (serialized === lastSavedPreferencesRef.current) {
      return;
    }

    setStatus("Auto-saving...");
    const timeout = window.setTimeout(() => {
      void putPreferences(preferences)
        .then((saved) => {
          lastSavedPreferencesRef.current = JSON.stringify(saved);
          setPreferences(saved);
          setStatus("Saved locally");
        })
        .catch(() => setStatus("Auto-save failed. Backend unavailable."));
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [backendOnline, preferences, preferencesLoaded]);

  useEffect(() => {
    const apiKey = apiKeyDraft.trim();
    if (
      !backendOnline ||
      !credentialDirty ||
      !apiKey ||
      preferences.ai_provider === "ollama"
    ) {
      return;
    }

    const provider = preferences.ai_provider as RemoteAIProvider;
    setStatus("Saving API key to the local .env file...");
    const timeout = window.setTimeout(() => {
      void putCredential(provider, apiKey)
        .then((saved) => {
          setCredentialStatus(saved);
          setApiKeyDraft("");
          setCredentialDirty(false);
          setStatus("API key saved locally in .env.");
        })
        .catch(() => setStatus("API key save failed."));
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [apiKeyDraft, backendOnline, credentialDirty, preferences.ai_provider]);

  const removeProviderCredential = async () => {
    if (preferences.ai_provider === "ollama") {
      return;
    }
    setStatus("Removing API key...");
    try {
      const removed = await deleteCredential(
        preferences.ai_provider as RemoteAIProvider,
      );
      setCredentialStatus(removed);
      setApiKeyDraft("");
      setCredentialDirty(false);
      setStatus("API key removed from the local .env file.");
    } catch {
      setStatus("API key removal failed.");
    }
  };

  const apiModelOptions = modelOptionsForProvider(
    preferences.ai_provider,
    preferences.ai_model,
  );
  const modelSelectionMode =
    preferences.ai_provider === "ollama" || preferences.ai_provider === "custom"
      ? "manual"
      : "dropdown";

  return (
    <PageShell
      title="Settings"
      description="Safety settings that govern filling, review, and source-backed answers."
    >
      <div className="grid grid-cols-[1fr_320px] gap-4 max-[980px]:grid-cols-1">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Chrome Connection</CardTitle>
                  <CardDescription>
                    Supported application forms are detected automatically while JobFlow runs.
                  </CardDescription>
                </div>
                <Badge variant={extensionStatus?.connected ? "success" : "outline"}>
                  {extensionStatus?.connected ? "Connected" : "Disconnected"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {extensionStatus?.connected ? (
                <div className="flex items-start gap-3 rounded-md border border-border p-3">
                  <Plug className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 text-sm text-muted-foreground">
                    <div className="font-medium text-foreground">Browser paired</div>
                    <div>
                      {extensionStatus.title
                        ? extensionStatus.title
                        : "Open a supported job application in Chrome."}
                    </div>
                    {extensionStatus.url ? (
                      <div className="truncate">{extensionStatus.url}</div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-md border border-border p-3">
                  <Plug className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 text-sm text-muted-foreground">
                    <div className="font-medium text-foreground">
                      Waiting for Chrome extension
                    </div>
                    <div>
                      Start JobFlow, then open or reload the extension. It connects
                      automatically over localhost.
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Model Connection</CardTitle>
              <CardDescription>
                Choose the local or API model used for source-backed answer drafting.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 max-[760px]:grid-cols-1">
              <PolicySelect
                label="Model provider"
                options={AI_PROVIDER_OPTIONS}
                value={preferences.ai_provider}
                onChange={(value) =>
                  setPreferences((current) => {
                    const provider = value as Preferences["ai_provider"];
                    return {
                      ...current,
                      ai_provider: provider,
                      ai_model: DEFAULT_MODEL_BY_PROVIDER[provider],
                      ai_base_url:
                        DEFAULT_BASE_URL_BY_PROVIDER[provider] ?? current.ai_base_url,
                    };
                  })
                }
              />
              {modelSelectionMode === "manual" ? (
                <ProfileInput
                  label={
                    preferences.ai_provider === "ollama"
                      ? "Ollama model name"
                      : "Model name"
                  }
                  value={preferences.ai_model}
                  onChange={(value) =>
                    setPreferences((current) => ({ ...current, ai_model: value }))
                  }
                />
              ) : (
                <ProfileSelect
                  label="Model"
                  options={apiModelOptions}
                  value={preferences.ai_model}
                  onChange={(value) =>
                    setPreferences((current) => ({ ...current, ai_model: value }))
                  }
                />
              )}
              {preferences.ai_provider !== "ollama" ? (
                <div className="flex flex-col gap-2">
                  <ProfileInput
                    label="API key"
                    placeholder={
                      credentialStatus?.configured
                        ? "Saved locally in .env"
                        : "Enter API key"
                    }
                    type="password"
                    value={apiKeyDraft}
                    onChange={(value) => {
                      setApiKeyDraft(value);
                      setCredentialDirty(true);
                    }}
                  />
                  {credentialStatus?.configured ? (
                    <Button
                      className="self-start"
                      size="sm"
                      variant="outline"
                      onClick={() => void removeProviderCredential()}
                    >
                      Remove API key
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <ProfileInput
                label="Base URL"
                value={preferences.ai_base_url}
                onChange={(value) =>
                  setPreferences((current) => ({ ...current, ai_base_url: value }))
                }
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Open Answers</CardTitle>
              <CardDescription>
                Saved Profile fields fill directly. Only open questions use the selected
                source-backed AI model. Personal answer context is edited in Profile.
                Final submission remains manual.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4 max-[760px]:grid-cols-1">
                <ProfileInput
                  label="Open answer max words"
                  value={`${preferences.open_answer_max_words}`}
                  onChange={(value) =>
                    setPreferences((current) => ({
                      ...current,
                      open_answer_max_words: Number(value) || 0,
                    }))
                  }
                />
                <ProfileInput
                  label="Open answer style"
                  value={preferences.open_answer_style}
                  onChange={(value) =>
                    setPreferences((current) => ({
                      ...current,
                      open_answer_style: value,
                    }))
                  }
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Field Policies</CardTitle>
              <CardDescription>How the fill plan handles sensitive or missing data.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 max-[760px]:grid-cols-1">
              <PolicySelect
                label="Salary fields"
                options={[
                  {
                    value: "ask_user",
                    label: "Ask me",
                    description: "Pause instead of guessing salary or compensation.",
                  },
                  {
                    value: "leave_blank",
                    label: "Leave blank",
                    description: "Skip salary fields without writing a value.",
                  },
                  {
                    value: "use_profile",
                    label: "Use profile",
                    description: "Use a saved profile salary fact when present.",
                  },
                ]}
                value={preferences.salary_answer_policy}
                onChange={(value) =>
                  setPreferences((current) => ({
                    ...current,
                    salary_answer_policy:
                      value as Preferences["salary_answer_policy"],
                  }))
                }
              />
              <PolicySelect
                label="Relocation fields"
                options={[
                  {
                    value: "ask_user",
                    label: "Ask me",
                    description: "Pause before answering relocation questions.",
                  },
                  {
                    value: "leave_blank",
                    label: "Leave blank",
                    description: "Skip relocation fields without writing a value.",
                  },
                  {
                    value: "use_profile",
                    label: "Use profile",
                    description: "Use a saved profile relocation fact when present.",
                  },
                ]}
                value={preferences.relocation_policy}
                onChange={(value) =>
                  setPreferences((current) => ({
                    ...current,
                    relocation_policy: value as Preferences["relocation_policy"],
                  }))
                }
              />
              <PolicySelect
                label="Missing facts"
                options={[
                  {
                    value: "ask_user",
                    label: "Ask me",
                    description: "Block or review fields with no matching source fact.",
                  },
                  {
                    value: "leave_blank",
                    label: "Leave blank",
                    description: "Skip fields when no user-provided fact exists.",
                  },
                ]}
                value={preferences.missing_fact_policy}
                onChange={(value) =>
                  setPreferences((current) => ({
                    ...current,
                    missing_fact_policy: value as Preferences["missing_fact_policy"],
                  }))
                }
              />
              <PolicySelect
                label="Low confidence"
                options={[
                  {
                    value: "pause",
                    label: "Pause",
                    description: "Require review for weak source matches.",
                  },
                  {
                    value: "leave_blank",
                    label: "Leave blank",
                    description: "Skip low-confidence drafts instead of filling them.",
                  },
                ]}
                value={preferences.low_confidence_policy}
                onChange={(value) =>
                  setPreferences((current) => ({
                    ...current,
                    low_confidence_policy:
                      value as Preferences["low_confidence_policy"],
                  }))
                }
              />
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Safety State</CardTitle>
            <CardDescription>{status}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <InfoLine label="Final submit" value="Manual only" />
            <InfoLine label="Salary" value={preferences.salary_answer_policy} />
            <InfoLine label="Relocation" value={preferences.relocation_policy} />
            <InfoLine label="Low confidence" value={preferences.low_confidence_policy} />
            <InfoLine label="Missing facts" value={preferences.missing_fact_policy} />
            <InfoLine label="Provider" value={providerLabel(preferences.ai_provider)} />
            <InfoLine label="Model" value={preferences.ai_model || "Not set"} />
            {preferences.ai_provider !== "ollama" ? (
              <InfoLine
                label="API key"
                value={
                  credentialStatus?.configured
                    ? "Local .env file"
                    : "Not set"
                }
              />
            ) : null}
            <div className="flex items-start gap-2 rounded-[16px] bg-muted p-3 text-foreground">
              <AlertTriangle />
              <p>AI may rewrite user facts, but cannot create unsupported factual claims.</p>
            </div>
          </CardContent>
        </Card>
      </div>
      <DataPortabilityPanel
        backendOnline={backendOnline}
        onPreferencesImported={setPreferences}
      />
    </PageShell>
  );
}

function DataPortabilityPanel({
  backendOnline,
  onPreferencesImported,
}: {
  backendOnline: boolean;
  onPreferencesImported: (preferences: Preferences) => void;
}) {
  const [backupJson, setBackupJson] = useState("");
  const [status, setStatus] = useState(
    "Export a local JSON backup before moving machines or testing real data.",
  );

  const describeSnapshot = (snapshot: DataExport) =>
    `${snapshot.applications.length} applications, ${snapshot.profile.documents.length} documents, ${snapshot.profile.answer_bank.length} saved answers`;

  const exportLocalData = async () => {
    setStatus("Exporting local data...");
    try {
      const snapshot = await exportData();
      setBackupJson(JSON.stringify(snapshot, null, 2));
      setStatus(`Export ready: ${describeSnapshot(snapshot)}.`);
    } catch {
      setStatus("Export failed. Check that the local backend is running.");
    }
  };

  const importLocalData = async () => {
    if (!backupJson.trim()) {
      setStatus("Paste a JobFlow JSON backup before importing.");
      return;
    }

    setStatus("Importing local data...");
    try {
      const parsed = JSON.parse(backupJson) as DataExport;
      const imported = await importData(parsed);
      setBackupJson(JSON.stringify(imported, null, 2));
      onPreferencesImported(imported.preferences);
      setStatus(`Import complete: ${describeSnapshot(imported)}.`);
    } catch (error) {
      const reason = error instanceof SyntaxError ? "Invalid JSON backup." : "Import failed.";
      setStatus(`${reason} No local data was changed by this screen after the error.`);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Local Data Portability</CardTitle>
          <CardDescription>{status}</CardDescription>
        </div>
        <Badge variant="outline">JSON</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button disabled={!backendOnline} variant="secondary" onClick={exportLocalData}>
            Export Local Data
          </Button>
          <Button disabled={!backendOnline} variant="outline" onClick={importLocalData}>
            Import JSON
          </Button>
        </div>
        <textarea
          className="min-h-64 rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Exported JobFlow JSON will appear here. You can also paste a backup and import it."
          spellCheck={false}
          value={backupJson}
          onChange={(event) => setBackupJson(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          The export includes profile facts, preferences, document references, and
          application records. It does not click final submit or sync data to a cloud service.
        </p>
      </CardContent>
    </Card>
  );
}

function PageShell({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-6 max-[760px]:flex-col">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading scroll-m-20 text-4xl font-extrabold text-balance max-[760px]:text-3xl">
            {title}
          </h1>
          <p className="max-w-3xl text-xl text-muted-foreground text-balance">
            {description}
          </p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function ProfileInput({
  label,
  placeholder,
  type = "text",
  value,
  onChange,
}: {
  label: string;
  placeholder?: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="leading-none font-medium">{label}</span>
      <Input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ProfileDateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="leading-none font-medium">{label}</span>
      <span className="relative">
        <Input
          className="w-full pr-10 [&::-webkit-calendar-picker-indicator]:opacity-0"
          type="date"
          value={value}
          onClick={(event) => {
            try {
              event.currentTarget.showPicker?.();
            } catch {
              // The native date input still handles the click when showPicker is unavailable.
            }
          }}
          onChange={(event) => onChange(event.target.value)}
        />
        <IoCalendarOutline className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </span>
    </label>
  );
}

function ProfileFactEditor({
  emptyLabel,
  facts,
  kind,
  title,
  onAdd,
  onRemove,
  onUpdate,
}: {
  emptyLabel: string;
  facts: Fact[];
  kind: ProfileFactCollection;
  title: string;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (
    index: number,
    key: keyof Fact,
    value: string | boolean,
  ) => void;
}) {
  return (
    <section className="grid min-w-0 grid-cols-[180px_minmax(0,1fr)] gap-6 py-5 max-[760px]:grid-cols-1 max-[760px]:gap-3">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button
            aria-label={`Add ${title.toLowerCase()}`}
            size="icon-sm"
            title={`Add ${title.toLowerCase()}`}
            type="button"
            variant="ghost"
            onClick={onAdd}
          >
            <IoAdd />
          </Button>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        {facts.length ? (
          facts.map((fact, index) => (
            <div
              className="rounded-md bg-muted/55 p-4"
              key={fact.id || `${title}-${index}`}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-muted-foreground">
                  {title} {index + 1}
                </span>
                <Button
                  aria-label={`Remove ${title.toLowerCase()} ${index + 1}`}
                  size="icon-xs"
                  title="Remove"
                  type="button"
                  variant="ghost"
                  onClick={() => onRemove(index)}
                >
                  <IoTrashOutline />
                </Button>
              </div>
              {kind === "experience_facts" ? (
                <div className="grid grid-cols-2 gap-3 max-[760px]:grid-cols-1">
                  <ProfileInput
                    label="Job title"
                    value={fact.title}
                    onChange={(value) => onUpdate(index, "title", value)}
                  />
                  <ProfileInput
                    label="Company"
                    value={fact.organization ?? ""}
                    onChange={(value) => onUpdate(index, "organization", value)}
                  />
                  <ProfileInput
                    label="Location"
                    value={fact.location ?? ""}
                    onChange={(value) => onUpdate(index, "location", value)}
                  />
                  <label className="flex items-end gap-3 pb-3 text-sm">
                    <input
                      checked={Boolean(fact.current)}
                      className="size-4"
                      type="checkbox"
                      onChange={(event) =>
                        onUpdate(index, "current", event.target.checked)
                      }
                    />
                    <span className="font-medium">I currently work here</span>
                  </label>
                  <ProfileDateInput
                    label="Start date"
                    value={fact.start_date ?? ""}
                    onChange={(value) => onUpdate(index, "start_date", value)}
                  />
                  <ProfileDateInput
                    label="End date"
                    value={fact.end_date ?? ""}
                    onChange={(value) => onUpdate(index, "end_date", value)}
                  />
                  <label className="col-span-2 flex flex-col gap-2 text-sm max-[760px]:col-span-1">
                    <span className="leading-none font-medium">Role description</span>
                    <textarea
                      className="min-h-24 resize-y px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={fact.body}
                      onChange={(event) =>
                        onUpdate(index, "body", event.target.value)
                      }
                    />
                  </label>
                </div>
              ) : null}
              {kind === "education" ? (
                <div className="grid grid-cols-2 gap-3 max-[760px]:grid-cols-1">
                  <ProfileInput
                    label="School or university"
                    value={fact.title}
                    onChange={(value) => onUpdate(index, "title", value)}
                  />
                  <ProfileInput
                    label="Degree"
                    value={fact.degree ?? ""}
                    onChange={(value) => onUpdate(index, "degree", value)}
                  />
                  <div className="col-span-2 max-[760px]:col-span-1">
                    <ProfileInput
                      label="Field of study"
                      value={fact.body}
                      onChange={(value) => onUpdate(index, "body", value)}
                    />
                  </div>
                  <ProfileDateInput
                    label="Start date"
                    value={fact.start_date ?? ""}
                    onChange={(value) => onUpdate(index, "start_date", value)}
                  />
                  <ProfileDateInput
                    label="End date"
                    value={fact.end_date ?? ""}
                    onChange={(value) => onUpdate(index, "end_date", value)}
                  />
                  <div className="col-span-2 max-[760px]:col-span-1">
                    <ProfileSelect
                      label="Status"
                      value={fact.education_status ?? ""}
                      options={[
                        { value: "", label: "Not set" },
                        { value: "attending", label: "Attending" },
                        { value: "graduated", label: "Graduated" },
                      ]}
                      onChange={(value) =>
                        onUpdate(index, "education_status", value)
                      }
                    />
                  </div>
                </div>
              ) : null}
              {kind === "certifications" ? (
                <div className="grid grid-cols-2 gap-3 max-[760px]:grid-cols-1">
                  <ProfileInput
                    label="Certification"
                    value={fact.title}
                    onChange={(value) => onUpdate(index, "title", value)}
                  />
                  <ProfileInput
                    label="Certification number"
                    value={fact.credential_number ?? ""}
                    onChange={(value) =>
                      onUpdate(index, "credential_number", value)
                    }
                  />
                  <ProfileDateInput
                    label="Issued date"
                    value={fact.issued_date ?? ""}
                    onChange={(value) => onUpdate(index, "issued_date", value)}
                  />
                  <ProfileDateInput
                    label="Expiration date"
                    value={fact.expiration_date ?? ""}
                    onChange={(value) =>
                      onUpdate(index, "expiration_date", value)
                    }
                  />
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className="py-2 text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        )}
      </div>
    </section>
  );
}

function ProfileSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="leading-none font-medium">{label}</span>
      <select
        className="h-12 rounded-[16px] border border-transparent bg-muted px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value || "empty"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProfileCombobox({
  description,
  label,
  value,
  options,
  onChange,
}: {
  description?: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const listId = `profile-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <label className="flex flex-col gap-2 text-sm">
      <FieldLabel description={description} label={label} />
      <span className="relative">
        <Input
          className="w-full pr-10"
          list={listId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <IoChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </span>
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </label>
  );
}

function ProfileTextarea({
  description,
  label,
  maxLength,
  value,
  onChange,
}: {
  description: string;
  label: string;
  maxLength: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <FieldLabel description={description} label={label} />
      <textarea
        className="min-h-36 resize-y px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="self-end text-xs text-muted-foreground">
        {value.length}/{maxLength}
      </span>
    </label>
  );
}

function FieldLabel({
  description,
  label,
}: {
  description?: string;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5 leading-none font-medium">
      <span>{label}</span>
      {description ? <HelpTooltip content={description} /> : null}
    </span>
  );
}

function HelpTooltip({ content }: { content: string }) {
  const tooltipId = useId();
  return (
    <span
      aria-describedby={tooltipId}
      aria-label={content}
      className="group relative inline-flex shrink-0 cursor-help text-muted-foreground outline-none focus-visible:text-foreground"
      role="img"
      tabIndex={0}
    >
      <IoHelpCircleOutline aria-hidden="true" className="size-4" />
      <span
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-64 -translate-x-1/2 rounded-md bg-foreground px-3 py-2 text-xs font-normal leading-5 text-background opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100"
        id={tooltipId}
        role="tooltip"
      >
        {content}
      </span>
    </span>
  );
}

function NullableBooleanSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="leading-none font-medium">{label}</span>
      <select
        className="h-12 rounded-[16px] border border-transparent bg-muted px-4 text-sm"
        value={value === null ? "unknown" : value ? "yes" : "no"}
        onChange={(event) => {
          const selected = event.target.value;
          onChange(selected === "unknown" ? null : selected === "yes");
        }}
      >
        <option value="unknown">Unknown / ask me</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  );
}

function PolicySelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; description: string }>;
  onChange: (value: string) => void;
}) {
  const selected = options.find((option) => option.value === value);

  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="leading-none font-medium">{label}</span>
      <select
        className="h-12 rounded-[16px] border border-transparent bg-muted px-4 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="text-xs text-muted-foreground">
        {selected ? selected.description : "Unknown policy value."}
      </span>
    </label>
  );
}

function formatNullableBoolean(value: boolean | null): string {
  if (value === null) {
    return "Unknown";
  }
  return value ? "Yes" : "No";
}

function formatPlanValue(
  value: string | boolean | Array<Record<string, string | boolean>> | null,
): string {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (Array.isArray(value)) {
    return `${value.length} saved ${value.length === 1 ? "entry" : "entries"}`;
  }
  return value || "-";
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
      <div className="flex flex-col gap-1">
        <span className="text-sm leading-none font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </div>
      <button
        aria-pressed={checked}
        className="relative h-6 w-11 rounded-full bg-muted transition-colors aria-pressed:bg-primary"
        onClick={(event) => {
          event.preventDefault();
          onChange(!checked);
        }}
        type="button"
      >
        <span
          className={cn(
            "absolute left-1 top-1 size-4 rounded-full bg-card transition-transform",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
    </label>
  );
}

export function DashboardPage({
  applications,
  backendOnline,
  fillPlan,
  fillResult,
  formSchema,
  profile,
}: {
  applications: ApplicationRecord[];
  backendOnline: boolean;
  fillPlan: FillPlan | null;
  fillResult: FillResult | null;
  formSchema: FormSchema | null;
  profile: Profile | null;
}) {
  const identityReady = Boolean(
    profile?.identity.first_name &&
      profile.identity.last_name &&
      isValidEmail(profile.identity.email),
  );
  const resumeReady = Boolean(
    profile?.documents.some((document) => document.kind === "resume"),
  );
  const savedProfileFieldCount = profile
    ? [
        profile.identity.first_name,
        profile.identity.last_name,
        profile.identity.email,
        profile.identity.phone,
        profile.identity.location,
        profilePreference(profile, "company"),
        profile.links.linkedin,
        profile.links.github,
        profile.links.portfolio,
        profilePreference(profile, "university"),
        profilePreference(profile, "heard_about_opportunity"),
        profilePreference(profile, "gender"),
        profilePreference(profile, "race"),
      ].filter(Boolean).length
    : 0;
  const submittedCount = applications.filter(
    (application) => application.status === "applied",
  ).length;
  const draftCount = applications.filter(
    (application) => application.status === "draft",
  ).length;
  const archivedCount = applications.filter(
    (application) => application.status === "archived",
  ).length;
  const reviewCount = fillPlan?.items.filter((item) => item.needs_review).length ?? 0;
  const blockedCount = fillPlan?.blocked_items.length ?? 0;
  const latestApplication = applications[0];
  const nextAction = dashboardNextAction({
    backendOnline,
    blockedCount,
    fillPlan,
    formSchema,
    identityReady,
    resumeReady,
    reviewCount,
  });

  return (
    <PageShell
      title="Dashboard"
      description="Local status summary for current job application work."
    >
      <div className="grid grid-cols-3 gap-4 max-[980px]:grid-cols-1">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              {backendOnline ? <CheckCircle2 /> : <AlertTriangle />}
              <CardTitle>Local Readiness</CardTitle>
            </div>
            <CardDescription>
              {backendOnline
                ? "Backend is online and local data is available."
                : "Start the local backend before applying."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <InfoLine label="Identity" value={identityReady ? "Ready" : "Incomplete"} />
            <InfoLine label="Resume" value={resumeReady ? "Uploaded" : "Missing"} />
            <InfoLine label="Saved fields" value={`${savedProfileFieldCount}/13`} />
            <InfoLine
              label="Work auth"
              value={formatNullableBoolean(profile?.work_authorization.authorized ?? null)}
            />
            <InfoLine
              label="Sponsorship"
              value={formatNullableBoolean(
                profile?.work_authorization.requires_sponsorship ?? null,
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText />
              <CardTitle>Application History</CardTitle>
            </div>
            <CardDescription>
              {latestApplication
                ? `${latestApplication.company_name || "Unknown company"} · ${
                    latestApplication.job_title || "Untitled role"
                  }`
                : "No saved application records yet."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <InfoLine label="Total records" value={`${applications.length}`} />
            <InfoLine label="Submitted" value={`${submittedCount}`} />
            <InfoLine label="Draft" value={`${draftCount}`} />
            <InfoLine label="Archived" value={`${archivedCount}`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database />
              <CardTitle>Current Apply Run</CardTitle>
            </div>
            <CardDescription>{nextAction}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <InfoLine label="Detected fields" value={`${formSchema?.fields.length ?? 0}`} />
            <InfoLine label="Planned fields" value={`${fillPlan?.items.length ?? 0}`} />
            <InfoLine label="Needs review" value={`${reviewCount}`} />
            <InfoLine label="Blocked" value={`${blockedCount}`} />
            <InfoLine label="Last filled" value={`${fillResult?.filled_count ?? 0}`} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-[1fr_360px] gap-4 max-[980px]:grid-cols-1">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck />
              <CardTitle>Safety Boundary</CardTitle>
            </div>
            <CardDescription>
              JobFlow fills only source-backed fields and leaves final submission manual.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 text-sm max-[760px]:grid-cols-1">
            <SafetyTile
              label="Manual submit"
              value="Required"
              description="No final employer submit click is automated."
            />
            <SafetyTile
              label="Open answers"
              value="Source-backed"
              description="Generated text must come from saved user facts or presets."
            />
            <SafetyTile
              label="Sensitive fields"
              value="Review-gated"
              description="Legal, EEO, salary, and low-confidence fields pause first."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next Best Action</CardTitle>
            <CardDescription>{nextAction}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Keep profile facts concise and verified. When the assistant pauses, edit or
            leave blank instead of guessing.
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function SafetyTile({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
      <p className="mt-2 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function dashboardNextAction({
  backendOnline,
  blockedCount,
  fillPlan,
  formSchema,
  identityReady,
  resumeReady,
  reviewCount,
}: {
  backendOnline: boolean;
  blockedCount: number;
  fillPlan: FillPlan | null;
  formSchema: FormSchema | null;
  identityReady: boolean;
  resumeReady: boolean;
  reviewCount: number;
}): string {
  if (!backendOnline) {
    return "Start the local FastAPI backend.";
  }
  if (!identityReady) {
    return "Complete name and email in Profile.";
  }
  if (!resumeReady) {
    return "Upload a resume in Profile.";
  }
  if (!formSchema) {
    return "Open a job page and inspect the application form.";
  }
  if (!fillPlan) {
    return "Create a source-backed fill plan for the detected form.";
  }
  if (reviewCount > 0) {
    return "Review paused fields before the next safe fill.";
  }
  if (blockedCount > 0) {
    return "Resolve blocked fields or intentionally leave them blank.";
  }
  return "Safe fields are ready; final submission still stays manual.";
}
