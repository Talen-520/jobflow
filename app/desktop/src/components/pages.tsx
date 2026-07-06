import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Database, FileText, ShieldCheck } from "lucide-react";

import { FillPlanReviewControls } from "@/components/fill-plan-review-controls";
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
  type AnswerBankEntry,
  type DataExport,
  defaultPreferences,
  draftOpenAnswer,
  emptyProfile,
  exportData,
  type Fact,
  type DocumentRecord,
  type FillPlan,
  type FillPlanReviewDecision,
  type FillResult,
  type FormSchema,
  getPreferences,
  getPromptContextPreview,
  getProfile,
  importData,
  importDocument,
  type OpenAnswerDraft,
  type Preferences,
  type PromptContextPreview,
  type Profile,
  putPreferences,
  putProfile,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export function ProfilePage({
  backendOnline,
  onProfileUpdated,
}: {
  backendOnline: boolean;
  onProfileUpdated?: (profile: Profile) => void;
}) {
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [status, setStatus] = useState("Not saved");
  type FactListKey = "experience_facts" | "project_facts" | "skill_facts";

  useEffect(() => {
    if (!backendOnline) {
      return;
    }
    const controller = new AbortController();
    getProfile(controller.signal)
      .then((loaded) => {
        setProfile(loaded);
        setStatus("Loaded from local backend");
      })
      .catch(() => setStatus("Using local draft"));
    return () => controller.abort();
  }, [backendOnline]);

  const updateIdentity = (key: keyof Profile["identity"], value: string) => {
    setProfile((current) => ({
      ...current,
      identity: { ...current.identity, [key]: value },
    }));
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
      work_authorization: { ...current.work_authorization, [key]: value },
    }));
  };

  const addFact = (key: FactListKey) => {
    setProfile((current) => ({
      ...current,
      [key]: [
        ...current[key],
        { title: "", body: "", tags: [], source: "user" },
      ],
    }));
  };

  const updateFact = (
    key: FactListKey,
    index: number,
    field: keyof Pick<Fact, "title" | "body">,
    value: string,
  ) => {
    setProfile((current) => ({
      ...current,
      [key]: current[key].map((fact, factIndex) =>
        factIndex === index ? { ...fact, [field]: value } : fact,
      ),
    }));
  };

  const addAnswer = () => {
    setProfile((current) => ({
      ...current,
      answer_bank: [
        ...current.answer_bank,
        { question_type: "general", title: "", body: "", tags: [] },
      ],
    }));
  };

  const updateAnswer = (
    index: number,
    field: keyof Pick<AnswerBankEntry, "question_type" | "title" | "body">,
    value: string,
  ) => {
    setProfile((current) => ({
      ...current,
      answer_bank: current.answer_bank.map((answer, answerIndex) =>
        answerIndex === index ? { ...answer, [field]: value } : answer,
      ),
    }));
  };

  const save = async () => {
    setStatus("Saving...");
    try {
      const saved = await putProfile(profile);
      setProfile(saved);
      onProfileUpdated?.(saved);
      setStatus("Saved locally");
    } catch {
      setStatus("Backend unavailable");
    }
  };

  return (
    <PageShell
      title="Profile"
      description="Structured personal information used by fill plans. AI can only use facts stored here or in your answer bank."
      action={
        <Button disabled={!backendOnline} onClick={save}>
          Save Profile
        </Button>
      }
    >
      <div className="grid grid-cols-[1fr_340px] gap-4 max-[980px]:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>Name, contact, and public links.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 max-[760px]:grid-cols-1">
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
              label="Preferred name"
              value={profile.identity.preferred_name}
              onChange={(value) => updateIdentity("preferred_name", value)}
            />
            <ProfileInput
              label="Email"
              value={profile.identity.email}
              onChange={(value) => updateIdentity("email", value)}
            />
            <ProfileInput
              label="Phone"
              value={profile.identity.phone}
              onChange={(value) => updateIdentity("phone", value)}
            />
            <ProfileInput
              label="Location"
              value={profile.identity.location}
              onChange={(value) => updateIdentity("location", value)}
            />
            <ProfileInput
              label="LinkedIn"
              value={profile.links.linkedin}
              onChange={(value) => updateLink("linkedin", value)}
            />
            <ProfileInput
              label="GitHub"
              value={profile.links.github}
              onChange={(value) => updateLink("github", value)}
            />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Local Control</CardTitle>
              <CardDescription>{status}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <InfoLine label="Backend" value={backendOnline ? "Online" : "Offline"} />
              <InfoLine label="Documents" value={`${profile.documents.length}`} />
              <InfoLine label="Answer bank" value={`${profile.answer_bank.length}`} />
              <InfoLine label="Experience facts" value={`${profile.experience_facts.length}`} />
              <InfoLine
                label="Work auth"
                value={formatNullableBoolean(profile.work_authorization.authorized)}
              />
              <div className="rounded-md bg-muted p-3 text-muted-foreground">
                Sensitive facts such as sponsorship and EEO fields are never inferred.
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Work Authorization</CardTitle>
              <CardDescription>
                Legal and sponsorship facts stay user-provided and review-gated.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ProfileInput
                label="Country"
                value={profile.work_authorization.country}
                onChange={(value) => updateWorkAuthorization("country", value)}
              />
              <NullableBooleanSelect
                label="Authorized to work?"
                value={profile.work_authorization.authorized}
                onChange={(value) => updateWorkAuthorization("authorized", value)}
              />
              <NullableBooleanSelect
                label="Requires sponsorship?"
                value={profile.work_authorization.requires_sponsorship}
                onChange={(value) =>
                  updateWorkAuthorization("requires_sponsorship", value)
                }
              />
              <label className="flex flex-col gap-2 text-sm">
                <span className="font-medium">Notes</span>
                <textarea
                  className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={profile.work_authorization.notes}
                  onChange={(event) =>
                    updateWorkAuthorization("notes", event.target.value)
                  }
                />
              </label>
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 max-[980px]:grid-cols-1">
        <FactListEditor
          description="Concrete work history facts AI may cite or rewrite."
          entries={profile.experience_facts}
          title="Experience Facts"
          onAdd={() => addFact("experience_facts")}
          onChange={(index, field, value) =>
            updateFact("experience_facts", index, field, value)
          }
        />
        <FactListEditor
          description="Project examples available for role-specific answers."
          entries={profile.project_facts}
          title="Project Facts"
          onAdd={() => addFact("project_facts")}
          onChange={(index, field, value) =>
            updateFact("project_facts", index, field, value)
          }
        />
        <FactListEditor
          description="Skills and technologies that can map to form fields."
          entries={profile.skill_facts}
          title="Skill Facts"
          onAdd={() => addFact("skill_facts")}
          onChange={(index, field, value) =>
            updateFact("skill_facts", index, field, value)
          }
        />
        <AnswerBankEditor
          entries={profile.answer_bank}
          onAdd={addAnswer}
          onChange={updateAnswer}
        />
      </div>
    </PageShell>
  );
}

export function FillPlansPage({
  fillPlan,
  fillResult,
  formSchema,
  backendOnline = true,
  onReviewField,
  onSaveReviewedAnswer,
}: {
  fillPlan: FillPlan | null;
  fillResult: FillResult | null;
  formSchema: FormSchema | null;
  backendOnline?: boolean;
  onReviewField?: (
    fieldId: string,
    decision: FillPlanReviewDecision,
    value?: string | boolean | null,
  ) => void;
  onSaveReviewedAnswer?: (request: {
    fieldId: string;
    title: string;
    body: string;
    questionType: string;
    tags: string[];
  }) => void;
}) {
  const reviewCount = fillPlan?.items.filter((item) => item.needs_review).length ?? 0;
  const readyCount =
    fillPlan?.items.filter((item) => !item.needs_review && item.confidence >= 0.85)
      .length ?? 0;
  const blockedCount = fillPlan?.blocked_items.length ?? 0;
  const fieldById = new Map(
    (formSchema?.fields ?? []).map((field) => [field.field_id, field]),
  );

  return (
    <PageShell
      title="Fill Plans"
      description="Draft plans show exactly which field will be filled, from which source, and whether review is required."
    >
      <div className="grid grid-cols-3 gap-4 max-[980px]:grid-cols-1">
        {[
          ["High Confidence", `${readyCount} fields ready`, "success"],
          ["Needs Review", `${reviewCount} fields paused`, "warning"],
          ["Blocked", `${blockedCount} missing or sensitive`, "danger"],
        ].map(([title, description, variant]) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant={variant as "success" | "warning" | "danger"}>
                Source-backed only
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Field-Level Review</CardTitle>
            <CardDescription>
              {formSchema
                ? `${formSchema.ats} form with ${formSchema.fields.length} detected fields.`
                : "Inspect a form and create a fill plan to populate this table."}
            </CardDescription>
          </div>
          <Badge variant={fillResult?.error_count ? "danger" : "outline"}>
            {fillResult ? fillResult.status : "No fill run"}
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {fillPlan && onReviewField ? (
            <div className="border-t border-border p-4">
              <FillPlanReviewControls
                disabled={!backendOnline}
                fillPlan={fillPlan}
                formSchema={formSchema}
                onSaveReviewedAnswer={onSaveReviewedAnswer}
                onReviewField={onReviewField}
              />
            </div>
          ) : null}
          {!fillPlan ? (
            <div className="m-4 rounded-md bg-muted p-4 text-sm text-muted-foreground">
              No fill plan yet. Use the assistant to open a job page, inspect the form,
              then create a source-backed plan.
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full min-w-[880px] border-collapse text-sm">
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Field</th>
                    <th className="px-4 py-2 font-medium">Action</th>
                    <th className="px-4 py-2 font-medium">Value</th>
                    <th className="px-4 py-2 font-medium">Confidence</th>
                    <th className="px-4 py-2 font-medium">Review</th>
                    <th className="px-4 py-2 font-medium">Sources</th>
                    <th className="px-4 py-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {fillPlan.items.map((item) => {
                    const field = fieldById.get(item.field_id);
                    return (
                      <tr className="border-t border-border" key={item.field_id}>
                        <td className="px-4 py-3">
                          <div className="font-medium">{field?.label || item.field_id}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.field_id}
                          </div>
                        </td>
                        <td className="px-4 py-3">{item.action}</td>
                        <td className="max-w-64 truncate px-4 py-3 text-muted-foreground">
                          {formatPlanValue(item.value)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              item.confidence >= 0.85
                                ? "success"
                                : item.confidence >= 0.5
                                  ? "warning"
                                  : "danger"
                            }
                          >
                            {Math.round(item.confidence * 100)}%
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={item.needs_review ? "warning" : "success"}>
                            {item.needs_review ? "Review" : "Ready"}
                          </Badge>
                        </td>
                        <td className="max-w-56 px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {item.source_refs.length === 0 ? (
                              <span className="text-xs text-muted-foreground">None</span>
                            ) : null}
                            {item.source_refs.map((sourceRef) => (
                              <Badge key={sourceRef} variant="outline">
                                {sourceRef}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="max-w-72 px-4 py-3 text-muted-foreground">
                          {item.reason || "-"}
                        </td>
                      </tr>
                    );
                  })}
                  {fillPlan.blocked_items.map((item) => {
                    const field = fieldById.get(item.field_id);
                    return (
                      <tr className="border-t border-border bg-red-50/40" key={item.field_id}>
                        <td className="px-4 py-3">
                          <div className="font-medium">{field?.label || item.field_id}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.field_id}
                          </div>
                        </td>
                        <td className="px-4 py-3">blocked</td>
                        <td className="px-4 py-3 text-muted-foreground">-</td>
                        <td className="px-4 py-3">
                          <Badge variant="danger">0%</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="danger">Blocked</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">None</td>
                        <td className="px-4 py-3 text-muted-foreground">{item.reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}

export function DocumentsPage({
  backendOnline,
  onProfileUpdated,
}: {
  backendOnline: boolean;
  onProfileUpdated?: (profile: Profile) => void;
}) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [kind, setKind] = useState<"resume" | "cover_letter" | "other">("resume");
  const [name, setName] = useState("Main Resume");
  const [path, setPath] = useState("");
  const [status, setStatus] = useState("Load your profile to view vault documents.");

  useEffect(() => {
    if (!backendOnline) {
      return;
    }
    const controller = new AbortController();
    getProfile(controller.signal)
      .then((profile) => {
        setDocuments(profile.documents);
        onProfileUpdated?.(profile);
        setStatus(`${profile.documents.length} documents stored locally.`);
      })
      .catch(() => setStatus("Unable to load local documents."));
    return () => controller.abort();
  }, [backendOnline]);

  const importLocalDocument = async () => {
    if (!path.trim()) {
      setStatus("Enter a local file path before importing.");
      return;
    }
    setStatus("Importing into local vault...");
    try {
      const document = await importDocument({
        kind,
        name: name.trim() || "Document",
        path,
      });
      const updatedProfile = await getProfile();
      setDocuments(updatedProfile.documents);
      onProfileUpdated?.(updatedProfile);
      setStatus(`Imported ${document.name}.`);
    } catch {
      setStatus("Import failed. Check that the path exists on this machine.");
    }
  };

  return (
    <PageShell
      title="Documents"
      description="Local vault for resumes, cover letters, transcripts, and generated application snapshots."
    >
      <div className="grid grid-cols-[360px_1fr] gap-4 max-[980px]:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Import Local File</CardTitle>
            <CardDescription>{status}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-medium">Document type</span>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as "resume" | "cover_letter" | "other")
                }
              >
                <option value="resume">Resume</option>
                <option value="cover_letter">Cover letter</option>
                <option value="other">Other</option>
              </select>
            </label>
            <ProfileInput label="Display name" value={name} onChange={setName} />
            <ProfileInput label="Local file path" value={path} onChange={setPath} />
            <Button disabled={!backendOnline} onClick={importLocalDocument}>
              Import to Vault
            </Button>
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              Files are copied into JobFlow's local vault. The original path is not
              used for future fills.
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Vault Documents</CardTitle>
            <CardDescription>Documents available to fill plans and records.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 max-[980px]:grid-cols-1">
            {documents.length === 0 ? (
              <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                No documents imported yet.
              </div>
            ) : null}
            {documents.map((document) => (
              <div
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                key={document.id ?? document.path}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <FileText />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{document.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {document.path}
                    </span>
                  </div>
                </div>
                <Badge variant="outline">{document.kind}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

export function DataSourcesPage({ backendOnline }: { backendOnline: boolean }) {
  const [question, setQuestion] = useState(
    "Why are you interested in this AI automation role?",
  );
  const [questionType, setQuestionType] = useState("motivation");
  const [keywords, setKeywords] = useState("ai, automation");
  const [useModel, setUseModel] = useState(false);
  const [draft, setDraft] = useState<OpenAnswerDraft | null>(null);
  const [status, setStatus] = useState("Drafts use only stored facts and answers.");
  const [contextPreview, setContextPreview] = useState<PromptContextPreview | null>(
    null,
  );
  const [contextStatus, setContextStatus] = useState("Loading local context...");

  useEffect(() => {
    if (!backendOnline) {
      setContextStatus("Backend offline. Start the local backend to inspect context.");
      return;
    }
    const controller = new AbortController();
    getPromptContextPreview(controller.signal)
      .then((preview) => {
        setContextPreview(preview);
        setContextStatus(`${preview.source_count} local sources available to tools.`);
      })
      .catch(() => {
        setContextStatus("Context preview failed. Check the local backend.");
      });
    return () => controller.abort();
  }, [backendOnline]);

  const refreshContextPreview = async () => {
    setContextStatus("Refreshing local context...");
    try {
      const preview = await getPromptContextPreview();
      setContextPreview(preview);
      setContextStatus(`${preview.source_count} local sources available to tools.`);
    } catch {
      setContextStatus("Context preview failed. Check the local backend.");
    }
  };

  const createDraft = async () => {
    setStatus("Searching local facts...");
    try {
      const result = await draftOpenAnswer({
        question,
        question_type: questionType,
        keywords: keywords
          .split(",")
          .map((keyword) => keyword.trim())
          .filter(Boolean),
        use_model: useModel,
      });
      setDraft(result);
      setStatus(
        result.source_refs.length > 0
          ? `${result.source_refs.length} source refs used. Review required.`
          : "No matching sources found. Add facts or answer-bank entries.",
      );
    } catch {
      setStatus("Draft failed. Check the backend or local model settings.");
    }
  };

  return (
    <PageShell
      title="Data Sources"
      description="Facts and answer-bank entries that AI tools may use. Anything not listed here is out of bounds."
    >
      <div className="grid grid-cols-[1fr_380px] gap-4 max-[980px]:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Open Answer Draft</CardTitle>
            <CardDescription>{status}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-medium">Question</span>
              <textarea
                className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-3 max-[760px]:grid-cols-1">
              <ProfileInput
                label="Question type"
                value={questionType}
                onChange={setQuestionType}
              />
              <ProfileInput label="Keywords" value={keywords} onChange={setKeywords} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                checked={useModel}
                type="checkbox"
                onChange={(event) => setUseModel(event.target.checked)}
              />
              <span>Use local Ollama model when available</span>
            </label>
            <Button disabled={!backendOnline} onClick={createDraft}>
              Draft from Sources
            </Button>
            {draft ? (
              <div className="flex flex-col gap-3 rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">Generated Draft</span>
                  <Badge variant={draft.fallback_used ? "outline" : "success"}>
                    {draft.fallback_used ? "Fallback" : "Model"}
                  </Badge>
                </div>
                <p className="whitespace-pre-wrap text-sm">{draft.answer || "No answer."}</p>
                <div className="flex flex-wrap gap-2">
                  {draft.source_refs.map((sourceRef) => (
                    <Badge key={sourceRef} variant="outline">
                      {sourceRef}
                    </Badge>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">
                  {draft.needs_review
                    ? "Review is required before using this answer."
                    : "Ready to use."}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tool Calls</CardTitle>
            <CardDescription>Visible provenance for AI drafting.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {draft?.tool_calls.length ? (
              draft.tool_calls.map((call) => (
                <div
                  className="rounded-md border border-border p-3 text-sm"
                  key={call.tool_name}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{call.tool_name}</span>
                    <Badge variant="outline">{call.result_count}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {call.source_refs.join(", ") || "No matching sources"}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                Run a draft to see tool calls and source references.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <PromptContextPreviewPanel
        backendOnline={backendOnline}
        preview={contextPreview}
        status={contextStatus}
        onRefresh={refreshContextPreview}
      />
      <StaticSourcesOverview />
    </PageShell>
  );
}

function PromptContextPreviewPanel({
  backendOnline,
  preview,
  status,
  onRefresh,
}: {
  backendOnline: boolean;
  preview: PromptContextPreview | null;
  status: string;
  onRefresh: () => void;
}) {
  const visibleSources = preview?.sources.slice(0, 12) ?? [];
  const hiddenSourceCount = preview
    ? Math.max(0, preview.sources.length - visibleSources.length)
    : 0;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Prompt Context Preview</CardTitle>
          <CardDescription>{status}</CardDescription>
        </div>
        <Button disabled={!backendOnline} size="sm" variant="outline" onClick={onRefresh}>
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="grid grid-cols-[1fr_420px] gap-4 max-[1040px]:grid-cols-1">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 max-[760px]:grid-cols-1">
            <ContextList title="Rules" items={preview?.system_rules ?? []} />
            <ContextList title="Preferences" items={preview?.preference_summary ?? []} />
          </div>
          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Value</th>
                  <th className="px-3 py-2 font-medium">Risk</th>
                </tr>
              </thead>
              <tbody>
                {visibleSources.length === 0 ? (
                  <tr>
                    <td
                      className="px-3 py-4 text-sm text-muted-foreground"
                      colSpan={4}
                    >
                      No prompt context loaded yet.
                    </td>
                  </tr>
                ) : null}
                {visibleSources.map((source) => (
                  <tr className="border-t border-border" key={source.source_ref}>
                    <td className="max-w-56 px-3 py-3">
                      <div className="truncate font-medium">{source.label}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {source.source_ref}
                      </div>
                    </td>
                    <td className="px-3 py-3">{source.category}</td>
                    <td className="max-w-80 truncate px-3 py-3 text-muted-foreground">
                      {source.value}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={source.sensitive ? "warning" : "outline"}>
                        {source.sensitive ? "Sensitive" : "Normal"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hiddenSourceCount > 0 ? (
            <p className="text-xs text-muted-foreground">
              Showing first {visibleSources.length} sources. {hiddenSourceCount} more are
              included in the generated prompt below.
            </p>
          ) : null}
        </div>
        <label className="flex min-h-96 flex-col gap-2 text-sm">
          <span className="font-medium">Generated prompt boundary</span>
          <textarea
            className="min-h-96 flex-1 rounded-md border border-input bg-muted/30 px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            readOnly
            value={preview?.generated_prompt ?? ""}
          />
        </label>
      </CardContent>
    </Card>
  );
}

function ContextList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-medium">{title}</span>
        <Badge variant="outline">{items.length}</Badge>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No entries loaded.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StaticSourcesOverview() {
  return (
    <div className="grid grid-cols-2 gap-4 max-[980px]:grid-cols-1">
      <Card>
        <CardHeader>
          <CardTitle>Answer Bank</CardTitle>
          <CardDescription>Preset answers for open-ended questions.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {["Why this role?", "AI automation experience", "Tell us about yourself"].map(
            (item) => (
              <div className="rounded-md border border-border p-3" key={item}>
                <span className="font-medium">{item}</span>
                <p className="text-sm text-muted-foreground">
                  Used only with source references and review.
                </p>
              </div>
            ),
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Fact Categories</CardTitle>
          <CardDescription>Profile facts available to tool calls.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {["Experience facts", "Project facts", "Skill facts", "Education"].map((item) => (
            <div
              className="flex items-center justify-between rounded-md border border-border p-3"
              key={item}
            >
              <div className="flex items-center gap-3">
                <Database />
                <span className="font-medium">{item}</span>
              </div>
              <Badge variant="outline">Local</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function SettingsPage({ backendOnline }: { backendOnline: boolean }) {
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [status, setStatus] = useState("Not saved");

  useEffect(() => {
    if (!backendOnline) {
      return;
    }
    const controller = new AbortController();
    getPreferences(controller.signal)
      .then((loaded) => {
        setPreferences(loaded);
        setStatus("Loaded from local backend");
      })
      .catch(() => setStatus("Using defaults"));
    return () => controller.abort();
  }, [backendOnline]);

  const save = async () => {
    setStatus("Saving...");
    try {
      const saved = await putPreferences(preferences);
      setPreferences(saved);
      setStatus("Saved locally");
    } catch {
      setStatus("Backend unavailable");
    }
  };

  return (
    <PageShell
      title="Automation Rules"
      description="Safety settings that govern filling, review, and source-backed answers."
      action={
        <Button disabled={!backendOnline} onClick={save}>
          Save Rules
        </Button>
      }
    >
      <div className="grid grid-cols-[1fr_320px] gap-4 max-[980px]:grid-cols-1">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Review Boundaries</CardTitle>
              <CardDescription>Final submission is locked to manual only.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <SwitchRow
                checked={preferences.fill_sensitive_fields}
                description="When off, sponsorship, salary, authorization, and other sensitive fields pause."
                label="Allow sensitive field auto-fill"
                onChange={(value) =>
                  setPreferences((current) => ({
                    ...current,
                    fill_sensitive_fields: value,
                  }))
                }
              />
              <SwitchRow
                checked={preferences.fill_eeo_fields}
                description="When off, EEO fields remain blocked unless the user manually fills them."
                label="Allow EEO field auto-fill"
                onChange={(value) =>
                  setPreferences((current) => ({
                    ...current,
                    fill_eeo_fields: value,
                  }))
                }
              />
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
            <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-amber-800">
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
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function FactListEditor({
  title,
  description,
  entries,
  onAdd,
  onChange,
}: {
  title: string;
  description: string;
  entries: Fact[];
  onAdd: () => void;
  onChange: (
    index: number,
    field: keyof Pick<Fact, "title" | "body">,
    value: string,
  ) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={onAdd}>
          Add
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {entries.length === 0 ? (
          <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            No facts yet. Add only verified user-provided information.
          </div>
        ) : null}
        {entries.map((entry, index) => (
          <div className="flex flex-col gap-2 rounded-md border border-border p-3" key={entry.id ?? index}>
            <ProfileInput
              label="Title"
              value={entry.title}
              onChange={(value) => onChange(index, "title", value)}
            />
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-medium">Fact</span>
              <textarea
                className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={entry.body}
                onChange={(event) => onChange(index, "body", event.target.value)}
              />
            </label>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AnswerBankEditor({
  entries,
  onAdd,
  onChange,
}: {
  entries: AnswerBankEntry[];
  onAdd: () => void;
  onChange: (
    index: number,
    field: keyof Pick<AnswerBankEntry, "question_type" | "title" | "body">,
    value: string,
  ) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Answer Bank</CardTitle>
          <CardDescription>
            Preset answers used for open-ended fields, always with review.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={onAdd}>
          Add
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {entries.length === 0 ? (
          <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            Add reusable answers such as motivation, company interest, or role fit.
          </div>
        ) : null}
        {entries.map((entry, index) => (
          <div className="flex flex-col gap-2 rounded-md border border-border p-3" key={entry.id ?? index}>
            <div className="grid grid-cols-2 gap-3">
              <ProfileInput
                label="Question type"
                value={entry.question_type}
                onChange={(value) => onChange(index, "question_type", value)}
              />
              <ProfileInput
                label="Title"
                value={entry.title}
                onChange={(value) => onChange(index, "title", value)}
              />
            </div>
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-medium">Answer</span>
              <textarea
                className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={entry.body}
                onChange={(event) => onChange(index, "body", event.target.value)}
              />
            </label>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ProfileInput({
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
      <span className="font-medium">{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
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
      <span className="font-medium">{label}</span>
      <select
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
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
      <span className="font-medium">{label}</span>
      <select
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
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

function formatPlanValue(value: string | boolean | null): string {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
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
        <span className="font-medium">{label}</span>
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
    profile?.identity.first_name && profile.identity.last_name && profile.identity.email,
  );
  const documentCount = profile?.documents.length ?? 0;
  const answerCount = profile?.answer_bank.length ?? 0;
  const factCount =
    (profile?.experience_facts.length ?? 0) +
    (profile?.project_facts.length ?? 0) +
    (profile?.skill_facts.length ?? 0);
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
    answerCount,
    backendOnline,
    blockedCount,
    documentCount,
    factCount,
    fillPlan,
    formSchema,
    identityReady,
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
            <InfoLine label="Documents" value={`${documentCount}`} />
            <InfoLine label="Answer bank" value={`${answerCount}`} />
            <InfoLine label="Stored facts" value={`${factCount}`} />
            <InfoLine
              label="Work auth"
              value={formatNullableBoolean(profile?.work_authorization.authorized ?? null)}
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
  answerCount,
  backendOnline,
  blockedCount,
  documentCount,
  factCount,
  fillPlan,
  formSchema,
  identityReady,
  reviewCount,
}: {
  answerCount: number;
  backendOnline: boolean;
  blockedCount: number;
  documentCount: number;
  factCount: number;
  fillPlan: FillPlan | null;
  formSchema: FormSchema | null;
  identityReady: boolean;
  reviewCount: number;
}): string {
  if (!backendOnline) {
    return "Start the local FastAPI backend.";
  }
  if (!identityReady) {
    return "Complete name and email in Profile.";
  }
  if (documentCount === 0) {
    return "Import a resume into the document vault.";
  }
  if (answerCount === 0 && factCount === 0) {
    return "Add answer-bank presets or verified experience facts.";
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
