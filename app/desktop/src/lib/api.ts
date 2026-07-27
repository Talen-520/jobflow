export const API_BASE =
  import.meta.env.VITE_JOBFLOW_API_BASE ?? "http://127.0.0.1:8765";

export type Health = {
  status: "ok";
  service: string;
  protocol_version: number;
};

export type Profile = {
  ai_context: string;
  identity: {
    first_name: string;
    middle_name: string;
    last_name: string;
    preferred_name: string;
    email: string;
    phone: string;
    phone_country_code: string;
    phone_extension: string;
    location: string;
    address: string;
    address_line2: string;
    state: string;
    postal_code: string;
    country: string;
  };
  links: {
    linkedin: string;
    github: string;
    portfolio: string;
  };
  work_authorization: {
    country: string;
    authorized: boolean | null;
    requires_sponsorship: boolean | null;
    notes: string;
  };
  education: Fact[];
  experience_facts: Fact[];
  certifications: Fact[];
  project_facts: Fact[];
  skill_facts: Fact[];
  documents: DocumentRecord[];
  answer_bank: AnswerBankEntry[];
  preferences: Record<string, unknown>;
};

export type Fact = {
  id?: string;
  title: string;
  body: string;
  tags: string[];
  source?: string;
};

export type AnswerBankEntry = {
  id?: string;
  question_type: string;
  title: string;
  body: string;
  tags: string[];
};

export type AnswerBankSaveRequest = {
  question_type?: string;
  title?: string;
  body: string;
  tags?: string[];
};

export type DocumentRecord = {
  id?: string;
  kind: "resume" | "cover_letter" | "other";
  name: string;
  path: string;
  created_at?: string;
};

export type DocumentDeleteResult = {
  id: string;
  status: "deleted";
  file_deleted: boolean;
};

export type Preferences = {
  final_submission_mode: "manual_only";
  fill_sensitive_fields: boolean;
  fill_eeo_fields: boolean;
  ai_provider: "ollama" | "deepseek" | "openai" | "gemini" | "custom";
  ai_model: string;
  ai_base_url: string;
  open_answer_style: string;
  open_answer_max_words: number;
  salary_answer_policy: "ask_user" | "leave_blank" | "use_profile";
  relocation_policy: "ask_user" | "leave_blank" | "use_profile";
  missing_fact_policy: "ask_user" | "leave_blank";
  low_confidence_policy: "pause" | "leave_blank";
};

export type RemoteAIProvider = Exclude<Preferences["ai_provider"], "ollama">;

export type CredentialStatus = {
  provider: RemoteAIProvider;
  configured: boolean;
  storage: string;
};

export type FormField = {
  field_id: string;
  label: string;
  type: string;
  required: boolean;
  options: string[];
  placeholder: string;
  helper_text: string;
  selector: string;
  sensitive: boolean;
};

export type FormSchema = {
  url: string;
  ats: string;
  company_name_hint: string;
  job_title_hint: string;
  fields: FormField[];
};

export type FillPlanItem = {
  field_id: string;
  action: "fill" | "select" | "check" | "upload" | "skip";
  value: string | boolean | null;
  selector: string;
  confidence: number;
  needs_review: boolean;
  source_refs: string[];
  reason: string;
};

export type FillPlan = {
  form_id: string;
  items: FillPlanItem[];
  blocked_items: Array<{ field_id: string; reason: string }>;
};

export type FillPlanReviewDecision = "accept" | "edit" | "leave_blank";

export type FillPlanReviewResult = {
  status: "updated";
  field_id: string;
  decision: FillPlanReviewDecision;
  updated_plan: FillPlan;
  message: string;
};

export type ChatAdjustResult = {
  status: "parsed";
  field_id: string | null;
  command: "review" | "leave_blank" | "shorten" | "use_fact";
  message: string;
  updated_plan: FillPlan | null;
  source_refs: string[];
};

export type FillResult = {
  status: "applied" | "dry_run" | "blocked" | "error";
  filled_count: number;
  skipped_count: number;
  review_count: number;
  error_count: number;
  items: Array<{
    field_id: string;
    status: "filled" | "skipped" | "needs_review" | "blocked" | "error";
    reason: string;
  }>;
};

export type BrowserState = {
  status: "started" | "stopped" | "not_started" | "opened" | "connected" | "error";
  url: string;
  message: string;
};

export type ExtensionStatus = {
  connected: boolean;
  url: string;
  title: string;
  extension_version: string;
  captcha_detected: boolean;
  form_detected: boolean;
  field_count: number;
  ats: string;
  form_url: string;
  pairing_token: string;
};

export type AutomationEvent = {
  id: string;
  event_type: string;
  status: "info" | "running" | "success" | "warning" | "error";
  message: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type EventHistoryClearResult = {
  status: "cleared";
  deleted_count: number;
};

export type ApplicationRecord = {
  id?: string;
  company_name: string;
  job_title: string;
  application_date?: string;
  job_url: string;
  ats: string;
  status: "draft" | "applied" | "archived";
  resume_document_id?: string;
  cover_letter_document_id?: string;
  answers_snapshot?: Record<string, unknown>;
  success_detection?: {
    confidence: number;
    signals: string[];
  };
  notes?: string;
};

export type ApplicationDeleteResult = {
  id: string;
  status: "deleted";
};

export type SuccessDetectionResult = {
  detected: boolean;
  confidence: number;
  signals: string[];
  proposed_record: ApplicationRecord | null;
};

export type ToolCallRecord = {
  tool_name: string;
  arguments: Record<string, unknown>;
  source_refs: string[];
  result_count: number;
};

export type OpenAnswerDraft = {
  answer: string;
  source_refs: string[];
  needs_review: boolean;
  tool_calls: ToolCallRecord[];
  model_used: string;
  fallback_used: boolean;
  unsupported_claims: string[];
  reason: string;
};

export type OpenAnswerDraftRequest = {
  question: string;
  question_type?: string;
  keywords?: string[];
  context_facts?: Record<string, string>;
  max_words?: number;
  use_model?: boolean;
};

export type PromptContextSource = {
  source_ref: string;
  category: string;
  label: string;
  value: string;
  sensitive: boolean;
};

export type PromptContextPreview = {
  source_count: number;
  system_rules: string[];
  preference_summary: string[];
  sources: PromptContextSource[];
  generated_prompt: string;
};

export type DataExport = {
  schema_version: 1;
  profile: Profile;
  preferences: Preferences;
  applications: ApplicationRecord[];
};

export const emptyProfile: Profile = {
  ai_context: "",
  identity: {
    first_name: "",
    middle_name: "",
    last_name: "",
    preferred_name: "",
    email: "",
    phone: "",
    phone_country_code: "",
    phone_extension: "",
    location: "",
    address: "",
    address_line2: "",
    state: "",
    postal_code: "",
    country: "",
  },
  links: {
    linkedin: "",
    github: "",
    portfolio: "",
  },
  work_authorization: {
    country: "US",
    authorized: null,
    requires_sponsorship: null,
    notes: "",
  },
  education: [],
  experience_facts: [],
  certifications: [],
  project_facts: [],
  skill_facts: [],
  documents: [],
  answer_bank: [],
  preferences: {},
};

export const defaultPreferences: Preferences = {
  final_submission_mode: "manual_only",
  fill_sensitive_fields: true,
  fill_eeo_fields: true,
  ai_provider: "ollama",
  ai_model: "llama3.1:8b",
  ai_base_url: "",
  open_answer_style: "concise_professional",
  open_answer_max_words: 180,
  salary_answer_policy: "ask_user",
  relocation_policy: "ask_user",
  missing_fact_policy: "ask_user",
  low_confidence_policy: "pause",
};

export async function getHealth(signal?: AbortSignal): Promise<Health> {
  const response = await fetch(`${API_BASE}/health`, { signal });
  if (!response.ok) {
    throw new Error(`Backend health failed: ${response.status}`);
  }
  return response.json() as Promise<Health>;
}

export function getEventsUrl(): string {
  const url = new URL(API_BASE);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/events";
  url.search = "";
  return url.toString();
}

export async function listEventHistory(
  limit = 20,
  signal?: AbortSignal,
): Promise<AutomationEvent[]> {
  const url = new URL(`${API_BASE}/events/history`);
  url.searchParams.set("limit", String(limit));
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Event history load failed: ${response.status}`);
  }
  return response.json() as Promise<AutomationEvent[]>;
}

export async function clearEventHistory(): Promise<EventHistoryClearResult> {
  const response = await fetch(`${API_BASE}/events/history`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Event history clear failed: ${response.status}`);
  }
  return response.json() as Promise<EventHistoryClearResult>;
}

export async function getProfile(signal?: AbortSignal): Promise<Profile> {
  const response = await fetch(`${API_BASE}/profile`, { signal });
  if (!response.ok) {
    throw new Error(`Profile load failed: ${response.status}`);
  }
  return response.json() as Promise<Profile>;
}

export async function putProfile(profile: Profile): Promise<Profile> {
  const response = await fetch(`${API_BASE}/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  if (!response.ok) {
    throw new Error(`Profile save failed: ${response.status}`);
  }
  return response.json() as Promise<Profile>;
}

export async function saveAnswerBankEntry(
  request: AnswerBankSaveRequest,
): Promise<AnswerBankEntry> {
  const response = await fetch(`${API_BASE}/profile/answer-bank`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(`Answer save failed: ${response.status}`);
  }
  return response.json() as Promise<AnswerBankEntry>;
}

export async function getPreferences(signal?: AbortSignal): Promise<Preferences> {
  const response = await fetch(`${API_BASE}/preferences`, { signal });
  if (!response.ok) {
    throw new Error(`Preferences load failed: ${response.status}`);
  }
  return response.json() as Promise<Preferences>;
}

export async function putPreferences(preferences: Preferences): Promise<Preferences> {
  const response = await fetch(`${API_BASE}/preferences`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preferences),
  });
  if (!response.ok) {
    throw new Error(`Preferences save failed: ${response.status}`);
  }
  return response.json() as Promise<Preferences>;
}

export async function getCredentialStatus(
  provider: RemoteAIProvider,
  signal?: AbortSignal,
): Promise<CredentialStatus> {
  const response = await fetch(`${API_BASE}/credentials/${provider}`, { signal });
  if (!response.ok) {
    throw new Error(`Credential status failed: ${response.status}`);
  }
  return response.json() as Promise<CredentialStatus>;
}

export async function putCredential(
  provider: RemoteAIProvider,
  apiKey: string,
): Promise<CredentialStatus> {
  const response = await fetch(`${API_BASE}/credentials/${provider}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
  });
  if (!response.ok) {
    throw new Error(`Credential save failed: ${response.status}`);
  }
  return response.json() as Promise<CredentialStatus>;
}

export async function deleteCredential(
  provider: RemoteAIProvider,
): Promise<CredentialStatus> {
  const response = await fetch(`${API_BASE}/credentials/${provider}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Credential removal failed: ${response.status}`);
  }
  return response.json() as Promise<CredentialStatus>;
}

export async function listApplications(
  signal?: AbortSignal,
): Promise<ApplicationRecord[]> {
  const response = await fetch(`${API_BASE}/applications`, { signal });
  if (!response.ok) {
    throw new Error(`Applications load failed: ${response.status}`);
  }
  return response.json() as Promise<ApplicationRecord[]>;
}

export async function createApplication(
  record: ApplicationRecord,
): Promise<ApplicationRecord> {
  const response = await fetch(`${API_BASE}/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
  if (!response.ok) {
    throw new Error(`Application save failed: ${response.status}`);
  }
  return response.json() as Promise<ApplicationRecord>;
}

export async function getApplication(
  recordId: string,
  signal?: AbortSignal,
): Promise<ApplicationRecord> {
  const response = await fetch(`${API_BASE}/applications/${recordId}`, { signal });
  if (!response.ok) {
    throw new Error(`Application detail load failed: ${response.status}`);
  }
  return response.json() as Promise<ApplicationRecord>;
}

export async function patchApplication(
  recordId: string,
  patch: Partial<ApplicationRecord>,
): Promise<ApplicationRecord> {
  const response = await fetch(`${API_BASE}/applications/${recordId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    throw new Error(`Application update failed: ${response.status}`);
  }
  return response.json() as Promise<ApplicationRecord>;
}

export async function deleteApplication(
  recordId: string,
): Promise<ApplicationDeleteResult> {
  const response = await fetch(`${API_BASE}/applications/${recordId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Application delete failed: ${response.status}`);
  }
  return response.json() as Promise<ApplicationDeleteResult>;
}

export async function importDocument(request: {
  kind: "resume" | "cover_letter" | "other";
  name: string;
  path: string;
}): Promise<DocumentRecord> {
  const response = await fetch(`${API_BASE}/documents/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(`Document import failed: ${response.status}`);
  }
  return response.json() as Promise<DocumentRecord>;
}

export async function uploadDocument(
  file: File,
  request: {
    kind: "resume" | "cover_letter" | "other";
    name?: string;
  },
): Promise<DocumentRecord> {
  const url = new URL(`${API_BASE}/documents/upload`);
  url.searchParams.set("kind", request.kind);
  url.searchParams.set("name", request.name?.trim() || file.name);
  url.searchParams.set("filename", file.name);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });
  if (!response.ok) {
    throw new Error(`Document upload failed: ${response.status}`);
  }
  return response.json() as Promise<DocumentRecord>;
}

export async function deleteDocument(
  documentId: string,
): Promise<DocumentDeleteResult> {
  const response = await fetch(`${API_BASE}/documents/${documentId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Document delete failed: ${response.status}`);
  }
  return response.json() as Promise<DocumentDeleteResult>;
}

export async function exportData(signal?: AbortSignal): Promise<DataExport> {
  const response = await fetch(`${API_BASE}/data/export`, { signal });
  if (!response.ok) {
    throw new Error(`Data export failed: ${response.status}`);
  }
  return response.json() as Promise<DataExport>;
}

export async function importData(payload: DataExport): Promise<DataExport> {
  const response = await fetch(`${API_BASE}/data/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Data import failed: ${response.status}`);
  }
  return response.json() as Promise<DataExport>;
}

export async function getExtensionStatus(
  includePairingToken = false,
  signal?: AbortSignal,
): Promise<ExtensionStatus> {
  const url = new URL(`${API_BASE}/extension/status`);
  url.searchParams.set("include_pairing_token", String(includePairingToken));
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Chrome extension status failed: ${response.status}`);
  }
  return response.json() as Promise<ExtensionStatus>;
}

export async function stopBrowser(): Promise<BrowserState> {
  const response = await fetch(`${API_BASE}/browser/stop`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Browser stop failed: ${response.status}`);
  }
  return response.json() as Promise<BrowserState>;
}

export async function pauseAutomation(): Promise<{ status: "paused" }> {
  const response = await fetch(`${API_BASE}/automation/pause`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Automation pause failed: ${response.status}`);
  }
  return response.json() as Promise<{ status: "paused" }>;
}

export async function resumeAutomation(): Promise<{ status: "resumed" }> {
  const response = await fetch(`${API_BASE}/automation/resume`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Automation resume failed: ${response.status}`);
  }
  return response.json() as Promise<{ status: "resumed" }>;
}

export async function inspectForm(): Promise<FormSchema> {
  const response = await fetch(`${API_BASE}/automation/inspect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    throw new Error(`Form inspection failed: ${response.status}`);
  }
  return response.json() as Promise<FormSchema>;
}

export async function createFillPlan(form: FormSchema): Promise<FillPlan> {
  const response = await fetch(`${API_BASE}/automation/create-fill-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ form }),
  });
  if (!response.ok) {
    throw new Error(`Fill plan creation failed: ${response.status}`);
  }
  return response.json() as Promise<FillPlan>;
}

export async function prepareFillPlan(form: FormSchema): Promise<FillPlan> {
  const response = await fetch(`${API_BASE}/automation/prepare-fill-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ form }),
  });
  if (!response.ok) {
    throw new Error(`Fill plan preparation failed: ${response.status}`);
  }
  return response.json() as Promise<FillPlan>;
}

export async function draftOpenAnswer(
  request: OpenAnswerDraftRequest,
): Promise<OpenAnswerDraft> {
  const response = await fetch(`${API_BASE}/automation/draft-open-answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(`Open-answer draft failed: ${response.status}`);
  }
  return response.json() as Promise<OpenAnswerDraft>;
}

export async function getPromptContextPreview(
  signal?: AbortSignal,
): Promise<PromptContextPreview> {
  const response = await fetch(`${API_BASE}/automation/context-preview`, { signal });
  if (!response.ok) {
    throw new Error(`Prompt context preview failed: ${response.status}`);
  }
  return response.json() as Promise<PromptContextPreview>;
}

export async function reviewFillPlanField(request: {
  field_id: string;
  decision: FillPlanReviewDecision;
  current_plan: FillPlan;
  form?: FormSchema | null;
  value?: string | boolean | null;
}): Promise<FillPlanReviewResult> {
  const response = await fetch(`${API_BASE}/automation/review-field`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(`Fill-plan review failed: ${response.status}`);
  }
  return response.json() as Promise<FillPlanReviewResult>;
}

export async function chatAdjust(request: {
  field_id?: string | null;
  message: string;
  current_plan?: FillPlan | null;
}): Promise<ChatAdjustResult> {
  const response = await fetch(`${API_BASE}/automation/chat-adjust`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(`Chat adjustment failed: ${response.status}`);
  }
  return response.json() as Promise<ChatAdjustResult>;
}

export async function applyFillPlan(
  plan: FillPlan,
  form: FormSchema,
  dryRun = false,
): Promise<FillResult> {
  const response = await fetch(`${API_BASE}/automation/apply-fill-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan, form, dry_run: dryRun }),
  });
  if (!response.ok) {
    throw new Error(`Fill plan apply failed: ${response.status}`);
  }
  return response.json() as Promise<FillResult>;
}

export async function detectSuccess(
  form?: FormSchema,
): Promise<SuccessDetectionResult> {
  const response = await fetch(`${API_BASE}/automation/detect-success`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ats: form?.ats ?? "generic",
      company_name_hint: form?.company_name_hint ?? "",
      job_title_hint: form?.job_title_hint ?? "",
    }),
  });
  if (!response.ok) {
    throw new Error(`Success detection failed: ${response.status}`);
  }
  return response.json() as Promise<SuccessDetectionResult>;
}
