import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Database, FileText, ShieldCheck } from "lucide-react";

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
  type AnswerBankEntry,
  defaultPreferences,
  draftOpenAnswer,
  emptyProfile,
  type Fact,
  type DocumentRecord,
  getPreferences,
  getProfile,
  importDocument,
  type OpenAnswerDraft,
  type Preferences,
  type Profile,
  putPreferences,
  putProfile,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export function ProfilePage({ backendOnline }: { backendOnline: boolean }) {
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
            <div className="rounded-md bg-muted p-3 text-muted-foreground">
              Sensitive facts such as sponsorship and EEO fields are never inferred.
            </div>
          </CardContent>
        </Card>
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

export function FillPlansPage() {
  return (
    <PageShell
      title="Fill Plans"
      description="Draft plans show exactly which field will be filled, from which source, and whether review is required."
    >
      <div className="grid grid-cols-3 gap-4 max-[980px]:grid-cols-1">
        {[
          ["High Confidence", "12 fields ready", "success"],
          ["Needs Review", "3 fields paused", "warning"],
          ["Blocked", "1 missing fact", "danger"],
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
    </PageShell>
  );
}

export function DocumentsPage({ backendOnline }: { backendOnline: boolean }) {
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
      setDocuments((current) => [document, ...current]);
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
      <StaticSourcesOverview />
    </PageShell>
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
            <CardTitle>Safety State</CardTitle>
            <CardDescription>{status}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <InfoLine label="Final submit" value="Manual only" />
            <InfoLine label="Low confidence" value={preferences.low_confidence_policy} />
            <InfoLine label="Missing facts" value={preferences.missing_fact_policy} />
            <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-amber-800">
              <AlertTriangle />
              <p>AI may rewrite user facts, but cannot create unsupported factual claims.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
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

export function DashboardPage() {
  return (
    <PageShell
      title="Dashboard"
      description="Local status summary for current job application work."
    >
      <div className="grid grid-cols-3 gap-4 max-[980px]:grid-cols-1">
        {[
          ["Local backend", "Profile and application APIs are ready.", CheckCircle2],
          ["Manual submit", "Final employer submission stays user-controlled.", ShieldCheck],
          ["Fact boundary", "Open answers must use stored user facts.", Database],
        ].map(([title, description, Icon]) => (
          <Card key={title as string}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Icon />
                <CardTitle>{title as string}</CardTitle>
              </div>
              <CardDescription>{description as string}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
