import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  Database,
  FileText,
  Home,
  Lock,
  MoreVertical,
  Pause,
  Play,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Trash2,
  User,
} from "lucide-react";
import { motion } from "motion/react";

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
import { Progress } from "@/components/ui/progress";
import {
  DashboardPage,
  DataSourcesPage,
  DocumentsPage,
  FillPlansPage,
  ProfilePage,
  SettingsPage,
} from "@/components/pages";
import {
  collapseToFloatingAssistant,
  isDesktopRuntime,
  showFloatingAssistant,
} from "@/lib/desktop";
import {
  applicationSnapshotAnswerCount,
  applicationSnapshotFromRecord,
  buildApplicationAnswersSnapshot,
  uploadedDocumentIdsFromPlan,
} from "@/lib/fill-plan";
import {
  API_BASE,
  applyFillPlan,
  chatAdjust,
  clearEventHistory,
  createApplication,
  createFillPlan,
  deleteApplication,
  detectSuccess,
  getDemoApplicationUrl,
  getEventsUrl,
  getHealth,
  getProfile,
  inspectForm,
  listApplications,
  listEventHistory,
  openBrowser,
  patchApplication,
  reviewFillPlanField,
  saveAnswerBankEntry,
  stopBrowser,
  type ApplicationRecord,
  type AutomationEvent,
  type DocumentRecord,
  type FillPlan,
  type FillPlanReviewDecision,
  type FillResult,
  type FormSchema,
  type Profile,
  type SuccessDetectionResult,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", icon: Home },
  { label: "Profile", icon: User },
  { label: "Applications", icon: BriefcaseBusiness },
  { label: "Fill Plans", icon: ClipboardList },
  { label: "Documents", icon: FileText },
  { label: "Data Sources", icon: Database },
  { label: "Automation Rules", icon: ShieldCheck },
  { label: "Settings", icon: Settings },
];

const confidenceVariant = {
  High: "success",
  Medium: "warning",
  Low: "danger",
  "-": "outline",
} as const;

const statusVariant = {
  Reviewed: "success",
  "Review Needed": "warning",
  Pending: "outline",
  "In Progress": "default",
  "Ready to Submit": "warning",
  Submitted: "success",
  Withdrawn: "danger",
  Draft: "outline",
  Archived: "outline",
  Filled: "success",
  "Needs Review": "warning",
  Blocked: "danger",
  Skipped: "outline",
  Error: "danger",
  Planned: "default",
} as const;

const eventVariant = {
  info: "outline",
  running: "default",
  success: "success",
  warning: "warning",
  error: "danger",
} as const;

type SaveReviewedAnswerRequest = {
  fieldId: string;
  title: string;
  body: string;
  questionType: string;
  tags: string[];
};

const applicationRefreshEvents = new Set([
  "application.saved",
  "application.updated",
  "application.deleted",
]);
const profileRefreshEvents = new Set([
  "document.imported",
  "document.deleted",
  "profile.answer_saved",
]);

function mergeEventLog(
  incoming: AutomationEvent[],
  current: AutomationEvent[] = [],
): AutomationEvent[] {
  const seen = new Set<string>();
  const merged: AutomationEvent[] = [];
  for (const event of [...incoming, ...current]) {
    if (seen.has(event.id)) {
      continue;
    }
    seen.add(event.id);
    merged.push(event);
    if (merged.length >= 8) {
      break;
    }
  }
  return merged;
}

function App() {
  const [selectedNav, setSelectedNav] = useState("Applications");
  const [assistantState, setAssistantState] = useState<"idle" | "running" | "paused">(
    "idle",
  );
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">(
    "checking",
  );
  const [targetUrl, setTargetUrl] = useState(getDemoApplicationUrl);
  const [automationMessage, setAutomationMessage] = useState("Ready to inspect this page.");
  const [formSchema, setFormSchema] = useState<FormSchema | null>(null);
  const [fillPlan, setFillPlan] = useState<FillPlan | null>(null);
  const [fillResult, setFillResult] = useState<FillResult | null>(null);
  const [successResult, setSuccessResult] = useState<SuccessDetectionResult | null>(null);
  const [successDraft, setSuccessDraft] = useState<ApplicationRecord | null>(null);
  const [savedApplications, setSavedApplications] = useState<ApplicationRecord[]>([]);
  const [profileState, setProfileState] = useState<Profile | null>(null);
  const [profileDocuments, setProfileDocuments] = useState<DocumentRecord[]>([]);
  const [eventLog, setEventLog] = useState<AutomationEvent[]>([]);
  const desktopAvailable = isDesktopRuntime();

  useEffect(() => {
    const controller = new AbortController();
    getHealth(controller.signal)
      .then(() => setBackendStatus("online"))
      .catch(() => setBackendStatus("offline"));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (backendStatus !== "online") {
      return;
    }
    const controller = new AbortController();
    listApplications(controller.signal)
      .then(setSavedApplications)
      .catch(() => setSavedApplications([]));
    getProfile(controller.signal)
      .then((profile) => {
        setProfileState(profile);
        setProfileDocuments(profile.documents);
      })
      .catch(() => {
        setProfileState(null);
        setProfileDocuments([]);
      });
    listEventHistory(8, controller.signal)
      .then((events) => setEventLog((current) => mergeEventLog(events, current)))
      .catch(() => undefined);
    return () => controller.abort();
  }, [backendStatus]);

  useEffect(() => {
    if (backendStatus !== "online") {
      return;
    }
    const socket = new WebSocket(getEventsUrl());
    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as AutomationEvent;
        setEventLog((current) => mergeEventLog([event], current));
        if (event.message) {
          setAutomationMessage(event.message);
        }
        if (applicationRefreshEvents.has(event.event_type)) {
          void listApplications()
            .then(setSavedApplications)
            .catch(() => undefined);
        }
        if (profileRefreshEvents.has(event.event_type)) {
          void getProfile()
            .then((profile) => {
              setProfileState(profile);
              setProfileDocuments(profile.documents);
            })
            .catch(() => undefined);
        }
      } catch {
        setAutomationMessage("Received an unreadable automation event.");
      }
    };
    socket.onerror = () => {
      setAutomationMessage("Automation event stream disconnected.");
    };
    return () => socket.close();
  }, [backendStatus]);

  const backendOnline = backendStatus === "online";

  const runAutomationStep = async (
    step: "open" | "inspect" | "plan" | "fill" | "success" | "save" | "stop",
  ) => {
    if (!backendOnline) {
      setAutomationMessage("Backend is offline. Start the local API first.");
      return;
    }
    setAssistantState("running");
    try {
      if (step === "open") {
        setAutomationMessage("Opening controlled browser...");
        const state = await openBrowser(targetUrl);
        setAutomationMessage(
          state.status === "error"
            ? state.message || "Browser failed to start."
            : `Browser opened: ${state.url}`,
        );
      }
      if (step === "stop") {
        setAutomationMessage("Stopping controlled browser...");
        const state = await stopBrowser();
        setFormSchema(null);
        setFillPlan(null);
        setFillResult(null);
        setSuccessResult(null);
        setSuccessDraft(null);
        setAutomationMessage(state.status === "stopped" ? "Browser stopped." : state.message);
      }
      if (step === "inspect") {
        setAutomationMessage("Inspecting current browser page...");
        const inspected = await inspectForm();
        setFormSchema(inspected);
        setFillPlan(null);
        setFillResult(null);
        setSuccessResult(null);
        setSuccessDraft(null);
        setAutomationMessage(
          `Found ${inspected.fields.length} fields on ${inspected.ats}.`,
        );
      }
      if (step === "plan") {
        if (!formSchema) {
          setAutomationMessage("Inspect a form before creating a fill plan.");
          return;
        }
        setAutomationMessage("Creating source-backed fill plan...");
        const plan = await createFillPlan(formSchema);
        setFillPlan(plan);
        setFillResult(null);
        setAutomationMessage(
          `${plan.items.length} planned, ${plan.blocked_items.length} blocked.`,
        );
      }
      if (step === "fill") {
        if (!formSchema || !fillPlan) {
          setAutomationMessage("Create a fill plan before filling.");
          return;
        }
        setAutomationMessage("Filling high-confidence fields only...");
        const result = await applyFillPlan(fillPlan, formSchema, false);
        setFillResult(result);
        setAutomationMessage(
          `Filled ${result.filled_count}; ${result.review_count} need review; ${result.error_count} errors.`,
        );
      }
      if (step === "success") {
        setAutomationMessage("Checking for a success page...");
        const result = await detectSuccess(formSchema ?? undefined);
        setSuccessResult(result);
        setSuccessDraft(result.proposed_record);
        setAutomationMessage(
          result.detected
            ? `Success detected at ${Math.round(result.confidence * 100)}% confidence.`
            : "No success page detected yet.",
        );
      }
      if (step === "save") {
        const proposal = successDraft ?? successResult?.proposed_record;
        if (!proposal) {
          setAutomationMessage("No success record proposal is ready to save.");
          return;
        }
        const saved = await createApplication({
          ...proposal,
          ...uploadedDocumentIdsFromPlan(fillPlan),
          status: "applied",
          answers_snapshot: buildApplicationAnswersSnapshot(fillPlan, fillResult),
        });
        setSavedApplications((current) => [saved, ...current]);
        setSelectedNav("Applications");
        setAutomationMessage(`Saved application record for ${saved.company_name}.`);
      }
    } catch (error) {
      setAutomationMessage(error instanceof Error ? error.message : "Automation failed.");
    } finally {
      setAssistantState((current) => (current === "paused" ? "paused" : "idle"));
    }
  };

  const runChatAdjustment = async (message: string) => {
    if (!backendOnline) {
      setAutomationMessage("Backend is offline. Start the local API first.");
      return;
    }
    if (!fillPlan) {
      setAutomationMessage("Create a fill plan before adjusting fields.");
      return;
    }
    try {
      const result = await chatAdjust({
        message,
        current_plan: fillPlan,
      });
      if (result.updated_plan) {
        setFillPlan(result.updated_plan);
      }
      setAutomationMessage(`Chat adjustment parsed as ${result.command}.`);
    } catch (error) {
      setAutomationMessage(error instanceof Error ? error.message : "Chat adjustment failed.");
    }
  };

  const reviewCurrentField = async (
    fieldId: string,
    decision: FillPlanReviewDecision,
    value?: string | boolean | null,
  ) => {
    if (!backendOnline) {
      setAutomationMessage("Backend is offline. Start the local API first.");
      return;
    }
    if (!fillPlan) {
      setAutomationMessage("Create a fill plan before reviewing fields.");
      return;
    }
    try {
      const result = await reviewFillPlanField({
        field_id: fieldId,
        decision,
        value,
        current_plan: fillPlan,
        form: formSchema,
      });
      setFillPlan(result.updated_plan);
      setFillResult(null);
      setAutomationMessage(result.message);
    } catch (error) {
      setAutomationMessage(error instanceof Error ? error.message : "Field review failed.");
    }
  };

  const saveReviewedAnswer = async (request: SaveReviewedAnswerRequest) => {
    if (!backendOnline) {
      setAutomationMessage("Backend is offline. Start the local API first.");
      return;
    }
    try {
      const saved = await saveAnswerBankEntry({
        question_type: request.questionType,
        title: request.title,
        body: request.body,
        tags: request.tags,
      });
      setProfileState((current) =>
        current
          ? {
              ...current,
              answer_bank: [...current.answer_bank, saved],
            }
          : current,
      );
      setAutomationMessage(
        `Saved "${saved.title || request.fieldId}" as a reusable preset answer.`,
      );
    } catch (error) {
      setAutomationMessage(error instanceof Error ? error.message : "Answer save failed.");
    }
  };

  const updateSavedApplication = (updated: ApplicationRecord) => {
    setSavedApplications((current) =>
      current.map((application) =>
        application.id === updated.id ? updated : application,
      ),
    );
  };

  const addSavedApplication = (saved: ApplicationRecord) => {
    setSavedApplications((current) => [
      saved,
      ...current.filter((application) => application.id !== saved.id),
    ]);
  };

  const removeSavedApplication = (recordId: string) => {
    setSavedApplications((current) =>
      current.filter((application) => application.id !== recordId),
    );
  };

  const clearEvents = async () => {
    try {
      const result = await clearEventHistory();
      setEventLog([]);
      setAutomationMessage(`Cleared ${result.deleted_count} local event records.`);
    } catch (error) {
      setAutomationMessage(
        error instanceof Error ? error.message : "Unable to clear event history.",
      );
    }
  };

  const handleProfileUpdated = (profile: Profile) => {
    setProfileState(profile);
    setProfileDocuments(profile.documents);
  };

  const openFloatingAssistant = async () => {
    try {
      const result = await showFloatingAssistant();
      setAutomationMessage(result);
    } catch (error) {
      setAutomationMessage(
        error instanceof Error ? error.message : "Unable to open floating assistant.",
      );
    }
  };

  const collapseMainWindow = async () => {
    try {
      const result = await collapseToFloatingAssistant();
      setAutomationMessage(result);
    } catch (error) {
      setAutomationMessage(
        error instanceof Error ? error.message : "Unable to collapse to assistant.",
      );
    }
  };

  const startManualApplicationRecord = () => {
    setSelectedNav("Applications");
    setAutomationMessage("Create a local record with Manual Application Record.");
  };

  const goToDocumentImport = () => {
    setSelectedNav("Documents");
    setAutomationMessage("Import a resume or cover letter into the local vault.");
  };

  const openDemoApplication = async () => {
    const demoUrl = getDemoApplicationUrl();
    setSelectedNav("Applications");
    setTargetUrl(demoUrl);
    if (!backendOnline) {
      setAutomationMessage("Backend is offline. Start the local API before opening demo.");
      return;
    }
    setAutomationMessage("Opening local demo application...");
    try {
      const state = await openBrowser(demoUrl);
      setAutomationMessage(
        state.status === "error"
          ? state.message || "Demo application failed to open."
          : `Demo application opened: ${state.url}`,
      );
    } catch (error) {
      setAutomationMessage(error instanceof Error ? error.message : "Demo open failed.");
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <TopBar
        backendStatus={backendStatus}
        desktopAvailable={desktopAvailable}
        onCollapseToAssistant={collapseMainWindow}
        onShowFloatingAssistant={openFloatingAssistant}
      />
      <div className="app-grid min-h-[calc(100vh-52px)]">
        <Sidebar
          selectedNav={selectedNav}
          onImportDocument={goToDocumentImport}
          onNewApplication={startManualApplicationRecord}
          onOpenDemo={() => void openDemoApplication()}
          onSelect={setSelectedNav}
        />
        <section className="flex min-w-0 flex-col gap-4 border-l border-border p-5">
          {selectedNav === "Dashboard" ? (
            <DashboardPage
              applications={savedApplications}
              backendOnline={backendOnline}
              fillPlan={fillPlan}
              fillResult={fillResult}
              formSchema={formSchema}
              profile={profileState}
            />
          ) : null}
          {selectedNav === "Profile" ? (
            <ProfilePage
              backendOnline={backendOnline}
              onProfileUpdated={handleProfileUpdated}
            />
          ) : null}
          {selectedNav === "Applications" ? (
            <ApplicationWorkspace
              applications={savedApplications}
              documents={profileDocuments}
              fillPlan={fillPlan}
              fillResult={fillResult}
              formSchema={formSchema}
              onApplicationCreated={addSavedApplication}
              onApplicationDeleted={removeSavedApplication}
              onApplicationUpdated={updateSavedApplication}
              onReviewField={reviewCurrentField}
              onSaveReviewedAnswer={saveReviewedAnswer}
            />
          ) : null}
          {selectedNav === "Fill Plans" ? (
            <FillPlansPage
              backendOnline={backendOnline}
              fillPlan={fillPlan}
              fillResult={fillResult}
              formSchema={formSchema}
              onReviewField={reviewCurrentField}
              onSaveReviewedAnswer={saveReviewedAnswer}
            />
          ) : null}
          {selectedNav === "Documents" ? (
            <DocumentsPage
              backendOnline={backendOnline}
              onProfileUpdated={handleProfileUpdated}
            />
          ) : null}
          {selectedNav === "Data Sources" ? (
            <DataSourcesPage backendOnline={backendOnline} />
          ) : null}
          {selectedNav === "Automation Rules" || selectedNav === "Settings" ? (
            <SettingsPage backendOnline={backendOnline} />
          ) : null}
        </section>
        <AssistantRail
          automationMessage={automationMessage}
          events={eventLog}
          fillPlan={fillPlan}
          fillResult={fillResult}
          formSchema={formSchema}
          onAutomationStep={runAutomationStep}
          onChatAdjust={runChatAdjustment}
          onClearEvents={clearEvents}
          onReviewField={reviewCurrentField}
          onSaveReviewedAnswer={saveReviewedAnswer}
          state={assistantState}
          successDraft={successDraft}
          successResult={successResult}
          targetUrl={targetUrl}
          onUseDemoUrl={() => setTargetUrl(getDemoApplicationUrl())}
          onSuccessDraftChange={setSuccessDraft}
          onTargetUrlChange={setTargetUrl}
          onRun={() => setAssistantState("running")}
          onPause={() => setAssistantState("paused")}
          onStop={() => void runAutomationStep("stop")}
        />
      </div>
      <FloatingAssistantButton
        state={assistantState}
        onRun={openFloatingAssistant}
      />
    </main>
  );
}

function ApplicationWorkspace({
  applications,
  documents,
  fillPlan,
  fillResult,
  formSchema,
  onApplicationCreated,
  onApplicationDeleted,
  onApplicationUpdated,
  onReviewField,
  onSaveReviewedAnswer,
}: {
  applications: ApplicationRecord[];
  documents: DocumentRecord[];
  fillPlan: FillPlan | null;
  fillResult: FillResult | null;
  formSchema: FormSchema | null;
  onApplicationCreated: (application: ApplicationRecord) => void;
  onApplicationDeleted: (recordId: string) => void;
  onApplicationUpdated: (application: ApplicationRecord) => void;
  onReviewField: (
    fieldId: string,
    decision: FillPlanReviewDecision,
    value?: string | boolean | null,
  ) => void;
  onSaveReviewedAnswer: (request: SaveReviewedAnswerRequest) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (applications.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !applications.some((application) => application.id === selectedId)) {
      setSelectedId(applications[0].id ?? null);
    }
  }, [applications, selectedId]);
  const selectedApplication =
    applications.find((application) => application.id === selectedId) ??
    applications[0] ??
    null;
  const handleApplicationDeleted = (recordId: string) => {
    onApplicationDeleted(recordId);
    if (selectedId === recordId) {
      setSelectedId(null);
    }
  };

  return (
    <>
      <StatsRow
        applications={applications}
        fillPlan={fillPlan}
        fillResult={fillResult}
        formSchema={formSchema}
      />
      <Card className="overflow-hidden">
        <WorkspaceHeader fillPlan={fillPlan} formSchema={formSchema} />
        <div className="grid grid-cols-[1fr_360px] border-t border-border max-[980px]:grid-cols-1">
          <FillPlanPanel fillPlan={fillPlan} fillResult={fillResult} formSchema={formSchema} />
          <FieldReviewPanel
            fillPlan={fillPlan}
            fillResult={fillResult}
            formSchema={formSchema}
            onReviewField={onReviewField}
            onSaveReviewedAnswer={onSaveReviewedAnswer}
          />
        </div>
      </Card>
      <div className="grid grid-cols-[1fr_380px] gap-4 max-[1180px]:grid-cols-1">
        <div className="flex flex-col gap-4">
          <ManualApplicationForm
            documents={documents}
            onCreated={(application) => {
              onApplicationCreated(application);
              setSelectedId(application.id ?? null);
            }}
          />
          <ApplicationsTable
            applications={applications}
            documents={documents}
            selectedId={selectedApplication?.id ?? null}
            onSelect={setSelectedId}
          />
        </div>
        <ApplicationDetailPanel
          application={selectedApplication}
          documents={documents}
          onApplicationDeleted={handleApplicationDeleted}
          onApplicationUpdated={onApplicationUpdated}
        />
      </div>
    </>
  );
}

function TopBar({
  backendStatus,
  desktopAvailable,
  onCollapseToAssistant,
  onShowFloatingAssistant,
}: {
  backendStatus: "checking" | "online" | "offline";
  desktopAvailable: boolean;
  onCollapseToAssistant: () => void;
  onShowFloatingAssistant: () => void;
}) {
  const statusLabel =
    backendStatus === "online"
      ? "Backend online"
      : backendStatus === "offline"
        ? "Backend offline"
        : "Checking backend";
  return (
    <header className="flex h-[52px] items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <BriefcaseBusiness />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold">JobFlow</span>
          <Badge variant="success">Local Mode</Badge>
        </div>
      </div>
      <div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex">
        <Lock />
        <span>All data is stored locally on this device.</span>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant={backendStatus === "online" ? "success" : "outline"}>
          {statusLabel}
        </Badge>
        <Button
          disabled={!desktopAvailable}
          size="sm"
          variant="outline"
          onClick={onShowFloatingAssistant}
        >
          Float Assistant
        </Button>
        <Button
          disabled={!desktopAvailable}
          size="sm"
          variant="outline"
          onClick={onCollapseToAssistant}
        >
          Collapse
        </Button>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option>Profile: Default</option>
        </select>
      </div>
    </header>
  );
}

function Sidebar({
  onImportDocument,
  onNewApplication,
  onOpenDemo,
  selectedNav,
  onSelect,
}: {
  onImportDocument: () => void;
  onNewApplication: () => void;
  onOpenDemo: () => void;
  selectedNav: string;
  onSelect: (value: string) => void;
}) {
  return (
    <aside className="flex flex-col justify-between bg-card p-3">
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const selected = item.label === selectedNav;
          return (
            <button
              className={cn(
                "flex h-10 items-center gap-3 rounded-md px-3 text-left text-sm transition-colors",
                selected
                  ? "bg-secondary font-medium text-primary"
                  : "text-foreground hover:bg-secondary",
              )}
              key={item.label}
              onClick={() => onSelect(item.label)}
            >
              <Icon />
              <span className="max-[1180px]:hidden">{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="flex flex-col gap-3 text-xs text-muted-foreground max-[1180px]:hidden">
        <div className="flex flex-col gap-2">
          <span className="font-medium uppercase tracking-wide">Quick Actions</span>
          <button className="text-left hover:text-foreground" onClick={onNewApplication}>
            New Application
          </button>
          <button className="text-left hover:text-foreground" onClick={onImportDocument}>
            Import Document
          </button>
          <button className="text-left hover:text-foreground" onClick={onOpenDemo}>
            Open Demo
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <span>Storage</span>
          <Progress value={18} />
          <span>1.2 GB / 10 GB</span>
        </div>
      </div>
    </aside>
  );
}

function StatsRow({
  applications,
  fillPlan,
  fillResult,
  formSchema,
}: {
  applications: ApplicationRecord[];
  fillPlan: FillPlan | null;
  fillResult: FillResult | null;
  formSchema: FormSchema | null;
}) {
  const appliedCount = applications.filter(
    (application) => application.status === "applied",
  ).length;
  const draftCount = applications.filter(
    (application) => application.status === "draft",
  ).length;
  const safeToFillCount =
    fillPlan?.items.filter((item) => isSafeFillCandidate(item)).length ?? 0;
  const reviewCount =
    (fillPlan?.items.filter((item) => item.needs_review).length ?? 0) +
    (fillPlan?.blocked_items.length ?? 0);
  const cards = [
    {
      label: "Applications",
      value: `${applications.length}`,
      hint: `${appliedCount} applied, ${draftCount} drafts`,
      icon: CheckCircle2,
      variant: "success" as const,
    },
    {
      label: "Current Form",
      value: `${formSchema?.fields.length ?? 0}`,
      hint: formSchema ? `${formSchema.ats} fields detected` : "Inspect a page first",
      icon: BriefcaseBusiness,
      variant: "default" as const,
    },
    {
      label: "Safe Fill",
      value: `${fillResult?.filled_count ?? safeToFillCount}`,
      hint: fillResult ? "Filled this run" : "Eligible high-confidence fields",
      icon: AlertTriangle,
      variant: "warning" as const,
    },
    {
      label: "Needs Review",
      value: `${reviewCount}`,
      hint: "Review-required or blocked fields",
      icon: ShieldCheck,
      variant: reviewCount ? ("warning" as const) : ("success" as const),
    },
  ];
  return (
    <div className="grid grid-cols-4 gap-4 max-[1040px]:grid-cols-2">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.label}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">{card.label}</span>
                <span className="text-3xl font-semibold tracking-tight">{card.value}</span>
                <span className="text-xs text-muted-foreground">{card.hint}</span>
              </div>
              <Badge variant={card.variant}>
                <Icon />
              </Badge>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function WorkspaceHeader({
  fillPlan,
  formSchema,
}: {
  fillPlan: FillPlan | null;
  formSchema: FormSchema | null;
}) {
  return (
    <CardHeader className="gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle>Application Workspace</CardTitle>
          <Badge variant={formSchema ? "success" : "outline"}>
            {formSchema ? formSchema.ats : "No form"}
          </Badge>
        </div>
        <Badge variant="warning">Manual submit only</Badge>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-6 text-sm">
          {["Fill Plan & Review", "Form Fields", "Profile Matches", "Attachments", "Notes"].map(
            (tab, index) => (
              <button
                className={cn(
                  "border-b-2 py-2",
                  index === 0
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
                key={tab}
              >
                {tab}
              </button>
            ),
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {formSchema
            ? `${fillPlan?.items.length ?? 0} planned for ${formSchema.url || "current page"}`
            : "Open and inspect a job application page to populate this workspace."}
        </span>
      </div>
    </CardHeader>
  );
}

function FillPlanPanel({
  fillPlan,
  fillResult,
  formSchema,
}: {
  fillPlan: FillPlan | null;
  fillResult: FillResult | null;
  formSchema: FormSchema | null;
}) {
  const planItems = new Map(fillPlan?.items.map((item) => [item.field_id, item]) ?? []);
  const blockedItems = new Map(
    fillPlan?.blocked_items.map((item) => [item.field_id, item]) ?? [],
  );
  const resultItems = new Map(fillResult?.items.map((item) => [item.field_id, item]) ?? []);
  const totalFields = formSchema?.fields.length ?? 0;
  const plannedFields = fillPlan?.items.length ?? 0;
  const progress = totalFields ? Math.round((plannedFields / totalFields) * 100) : 0;

  return (
    <section className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Fill Plan & Review</h2>
          <p className="text-sm text-muted-foreground">
            Current extracted fields, proposed values, confidence, and review state.
          </p>
        </div>
        <div className="flex min-w-48 flex-col gap-1 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Overall Progress</span>
            <span>{plannedFields} / {totalFields}</span>
          </div>
          <Progress value={progress} />
        </div>
      </div>
      {formSchema ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Field</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Proposed Value</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Confidence</th>
                <th className="px-3 py-2 font-medium">Sources</th>
              </tr>
            </thead>
            <tbody>
              {formSchema.fields.map((field) => {
                const item = planItems.get(field.field_id);
                const blocked = blockedItems.get(field.field_id);
                const result = resultItems.get(field.field_id);
                const status = planStatusLabel(item, blocked, result);
                const confidence = confidenceLabel(item?.confidence);
                return (
                  <tr className="border-t border-border" key={field.field_id}>
                    <td className="px-3 py-3 font-medium">{field.label || field.field_id}</td>
                    <td className="px-3 py-3 text-muted-foreground">{field.type}</td>
                    <td className="max-w-56 truncate px-3 py-3 text-muted-foreground">
                      {formatPlanValue(item?.value)}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={statusVariant[status]}>{status}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={confidenceVariant[confidence]}>{confidence}</Badge>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {item?.source_refs.length ?? 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          No form inspected yet. Use the assistant to open a URL and inspect the
          current application page.
        </div>
      )}
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex gap-4">
          <span>High (80-100%)</span>
          <span>Medium (50-79%)</span>
          <span>Low (0-49%)</span>
        </div>
        <span>{fillResult ? `${fillResult.filled_count} fields filled this run` : "No fill run yet"}</span>
      </div>
    </section>
  );
}

function FieldReviewPanel({
  fillPlan,
  fillResult,
  formSchema,
  onReviewField,
  onSaveReviewedAnswer,
}: {
  fillPlan: FillPlan | null;
  fillResult: FillResult | null;
  formSchema: FormSchema | null;
  onReviewField: (
    fieldId: string,
    decision: FillPlanReviewDecision,
    value?: string | boolean | null,
  ) => void;
  onSaveReviewedAnswer: (request: SaveReviewedAnswerRequest) => void;
}) {
  const reviewItem =
    fillPlan?.items.find((item) => item.needs_review || item.confidence < 0.8) ??
    fillPlan?.items[0] ??
    null;
  const blockedItem = fillPlan?.blocked_items[0] ?? null;
  const activeFieldId = reviewItem?.field_id ?? blockedItem?.field_id ?? null;
  const activeField = formSchema?.fields.find((field) => field.field_id === activeFieldId);
  const activeResult = fillResult?.items.find((item) => item.field_id === activeFieldId);
  const status = planStatusLabel(reviewItem, blockedItem, activeResult);
  const confidence = confidenceLabel(reviewItem?.confidence);
  const reason = blockedItem?.reason ?? reviewItem?.reason ?? "No fill plan item selected.";

  return (
    <aside className="flex flex-col gap-4 border-l border-border p-4 max-[980px]:border-l-0 max-[980px]:border-t">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Field Review</h2>
        <Badge variant={statusVariant[status]}>{status}</Badge>
      </div>
      {activeFieldId ? (
        <>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">Field Label</span>
            <span className="font-medium">{activeField?.label || activeFieldId}</span>
            <span className="text-xs text-muted-foreground">Proposed Value</span>
            <Input value={formatPlanValue(reviewItem?.value)} readOnly />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Confidence</span>
            <Badge variant={confidenceVariant[confidence]}>{confidence}</Badge>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <span className="text-muted-foreground">Source refs</span>
            <div className="flex flex-wrap gap-1">
              {reviewItem?.source_refs.length ? (
                reviewItem.source_refs.map((sourceRef) => (
                  <Badge key={sourceRef} variant="outline">
                    {sourceRef}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">No source refs.</span>
              )}
            </div>
          </div>
          <div className="rounded-md bg-muted/60 p-3 text-sm">
            <span className="font-medium">Why this state?</span>
            <p className="mt-1 text-muted-foreground">{reason}</p>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Last fill result</span>
            <Badge variant={activeResult?.status === "filled" ? "success" : "outline"}>
              {activeResult?.status ?? "Not filled"}
            </Badge>
          </div>
          <FillPlanReviewControls
            fillPlan={fillPlan}
            formSchema={formSchema}
            onSaveReviewedAnswer={onSaveReviewedAnswer}
            onReviewField={onReviewField}
          />
        </>
      ) : (
        <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          Create a fill plan to review the next field that needs attention.
        </div>
      )}
    </aside>
  );
}

function ManualApplicationForm({
  documents,
  onCreated,
}: {
  documents: DocumentRecord[];
  onCreated: (application: ApplicationRecord) => void;
}) {
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [applicationDate, setApplicationDate] = useState(todayDate());
  const [jobUrl, setJobUrl] = useState("");
  const [ats, setAts] = useState("generic");
  const [status, setStatus] = useState<ApplicationRecord["status"]>("draft");
  const [resumeDocumentId, setResumeDocumentId] = useState("");
  const [coverLetterDocumentId, setCoverLetterDocumentId] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("Create a local record when success detection is unavailable.");

  const resumes = documents.filter((document) => document.kind === "resume");
  const coverLetters = documents.filter((document) => document.kind === "cover_letter");

  const createManualRecord = async () => {
    if (!companyName.trim() || !jobTitle.trim()) {
      setMessage("Company and role are required for a manual record.");
      return;
    }
    setMessage("Saving manual application record...");
    try {
      const saved = await createApplication({
        company_name: companyName.trim(),
        job_title: jobTitle.trim(),
        application_date: applicationDate || todayDate(),
        job_url: jobUrl.trim(),
        ats: ats.trim() || "generic",
        status,
        resume_document_id: resumeDocumentId,
        cover_letter_document_id: coverLetterDocumentId,
        notes,
      });
      onCreated(saved);
      setCompanyName("");
      setJobTitle("");
      setApplicationDate(todayDate());
      setJobUrl("");
      setAts("generic");
      setStatus("draft");
      setResumeDocumentId("");
      setCoverLetterDocumentId("");
      setNotes("");
      setMessage(`Saved manual record for ${saved.company_name || "this role"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Manual record save failed.");
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Manual Application Record</CardTitle>
          <CardDescription>{message}</CardDescription>
        </div>
        <Badge variant="outline">Local only</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="grid grid-cols-2 gap-3 max-[760px]:grid-cols-1">
          <DetailInput label="Company" value={companyName} onChange={setCompanyName} />
          <DetailInput label="Role" value={jobTitle} onChange={setJobTitle} />
          <DetailInput
            label="Date"
            type="date"
            value={applicationDate}
            onChange={setApplicationDate}
          />
          <DetailInput label="ATS" value={ats} onChange={setAts} />
        </div>
        <DetailInput label="Job URL" type="url" value={jobUrl} onChange={setJobUrl} />
        <div className="grid grid-cols-3 gap-3 max-[900px]:grid-cols-1">
          <ApplicationSelect
            label="Status"
            value={status}
            onChange={(value) => setStatus(value as ApplicationRecord["status"])}
            options={[
              { value: "draft", label: "Draft" },
              { value: "applied", label: "Applied" },
              { value: "archived", label: "Archived" },
            ]}
          />
          <ApplicationSelect
            label="Resume"
            value={resumeDocumentId}
            onChange={setResumeDocumentId}
            options={[
              { value: "", label: "No resume" },
              ...resumes.map((document) => ({
                value: document.id ?? "",
                label: document.name || document.id || "Resume",
              })),
            ]}
          />
          <ApplicationSelect
            label="Cover letter"
            value={coverLetterDocumentId}
            onChange={setCoverLetterDocumentId}
            options={[
              { value: "", label: "No cover letter" },
              ...coverLetters.map((document) => ({
                value: document.id ?? "",
                label: document.name || document.id || "Cover letter",
              })),
            ]}
          />
        </div>
        <label className="flex flex-col gap-2">
          <span className="font-medium">Notes</span>
          <textarea
            className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        <Button onClick={() => void createManualRecord()}>
          Save Manual Record
        </Button>
      </CardContent>
    </Card>
  );
}

function ApplicationsTable({
  applications,
  documents,
  selectedId,
  onSelect,
}: {
  applications: ApplicationRecord[];
  documents: DocumentRecord[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "Submitted" | "Draft" | "Archived"
  >("all");
  const rows = applications.map((application) => ({
    id: application.id ?? null,
    role: application.job_title || "Untitled role",
    company: application.company_name || "Unknown company",
    status:
      application.status === "applied"
        ? "Submitted"
        : application.status === "draft"
          ? "Draft"
          : "Archived",
    date: application.application_date ?? "Saved locally",
    url: application.job_url || "-",
    ats: application.ats || "generic",
    resume: documentDisplayValue(application.resume_document_id, documents),
    answers: applicationSnapshotAnswerCount(application.answers_snapshot),
  }));
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = rows.filter((row) => {
    const matchesStatus = statusFilter === "all" || row.status === statusFilter;
    const searchText = [
      row.role,
      row.company,
      row.date,
      row.url,
      row.ats,
      row.status,
      row.resume,
    ]
      .join(" ")
      .toLowerCase();
    return matchesStatus && (!normalizedQuery || searchText.includes(normalizedQuery));
  });
  const filtersActive = Boolean(normalizedQuery) || statusFilter !== "all";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between p-4">
        <div>
          <CardTitle>Application History</CardTitle>
          <CardDescription>Saved after manual submission confirmation.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 text-muted-foreground" />
            <Input
              className="w-72 pl-9"
              placeholder="Search applications..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <label className="relative">
            <SlidersHorizontal className="pointer-events-none absolute left-3 top-2.5 text-muted-foreground" />
            <select
              className="h-10 rounded-md border border-input bg-background pl-9 pr-8 text-sm"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as typeof statusFilter)
              }
            >
              <option value="all">All statuses</option>
              <option value="Submitted">Submitted</option>
              <option value="Draft">Draft</option>
              <option value="Archived">Archived</option>
            </select>
          </label>
          {filtersActive ? (
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                setStatusFilter("all");
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Job Title</th>
              <th className="px-4 py-2 font-medium">Company</th>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">URL</th>
              <th className="px-4 py-2 font-medium">ATS</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Resume</th>
              <th className="px-4 py-2 font-medium">Answers</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {applications.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-muted-foreground" colSpan={9}>
                  No saved applications yet. Detect a success page after manual
                  submission, review the record, then save it here.
                </td>
              </tr>
            ) : null}
            {applications.length > 0 && filteredRows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-muted-foreground" colSpan={9}>
                  No applications match the current search or status filter.
                </td>
              </tr>
            ) : null}
            {filteredRows.map((row) => (
              <tr
                className={cn(
                  "border-t border-border",
                  row.id && row.id === selectedId ? "bg-muted/60" : "",
                  row.id ? "cursor-pointer hover:bg-muted/40" : "",
                )}
                key={row.id ?? `${row.company}-${row.role}`}
                onClick={() => onSelect(row.id)}
              >
                <td className="px-4 py-3 font-medium">{row.role}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.company}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.date}</td>
                <td className="max-w-48 truncate px-4 py-3 text-muted-foreground">
                  {row.url}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{row.ats}</td>
                <td className="px-4 py-3">
                  <Badge variant={statusVariant[row.status as keyof typeof statusVariant]}>
                    {row.status}
                  </Badge>
                </td>
                <td className="max-w-40 truncate px-4 py-3 text-muted-foreground">
                  {row.resume}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{row.answers}</td>
                <td className="px-4 py-3">
                  <Button variant="ghost" size="icon">
                    <MoreVertical />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ApplicationDetailPanel({
  application,
  documents,
  onApplicationDeleted,
  onApplicationUpdated,
}: {
  application: ApplicationRecord | null;
  documents: DocumentRecord[];
  onApplicationDeleted: (recordId: string) => void;
  onApplicationUpdated: (application: ApplicationRecord) => void;
}) {
  const [companyName, setCompanyName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [applicationDate, setApplicationDate] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [ats, setAts] = useState("generic");
  const [status, setStatus] = useState<ApplicationRecord["status"]>("applied");
  const [notes, setNotes] = useState("");
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [saveState, setSaveState] = useState("Select an application.");

  useEffect(() => {
    if (!application) {
      setCompanyName("");
      setJobTitle("");
      setApplicationDate("");
      setJobUrl("");
      setAts("generic");
      setStatus("applied");
      setNotes("");
      setDeleteConfirming(false);
      setSaveState("Select an application.");
      return;
    }
    setCompanyName(application.company_name);
    setJobTitle(application.job_title);
    setApplicationDate(application.application_date ?? "");
    setJobUrl(application.job_url);
    setAts(application.ats || "generic");
    setStatus(application.status);
    setNotes(application.notes ?? "");
    setDeleteConfirming(false);
    setSaveState("Loaded from local application history.");
  }, [application]);

  const save = async () => {
    if (!application?.id) {
      setSaveState("No saved application selected.");
      return;
    }
    setSaveState("Saving...");
    try {
      const updated = await patchApplication(application.id, {
        company_name: companyName,
        job_title: jobTitle,
        application_date: applicationDate || application.application_date,
        job_url: jobUrl,
        ats: ats || "generic",
        status,
        notes,
      });
      onApplicationUpdated(updated);
      setSaveState("Saved locally.");
    } catch {
      setSaveState("Unable to save application detail.");
    }
  };

  const remove = async () => {
    if (!application?.id) {
      setSaveState("No saved application selected.");
      return;
    }
    if (!deleteConfirming) {
      setDeleteConfirming(true);
      setSaveState("Click Confirm Delete to remove this local record.");
      return;
    }
    setSaveState("Deleting local record...");
    try {
      const deleted = await deleteApplication(application.id);
      onApplicationDeleted(deleted.id);
      setDeleteConfirming(false);
      setSaveState("Deleted local record.");
    } catch {
      setSaveState("Unable to delete application record.");
    }
  };

  if (!application) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Application Detail</CardTitle>
          <CardDescription>No saved application selected.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Save a detected success record to inspect company, role, URL, notes, and
          automation provenance here.
        </CardContent>
      </Card>
    );
  }

  const answerSnapshot = applicationSnapshotFromRecord(application.answers_snapshot);
  const answerKeys = Object.keys(application.answers_snapshot ?? {});
  const answerCount = answerSnapshot?.fields.length ?? answerKeys.length;
  const signals = application.success_detection?.signals ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Application Detail</CardTitle>
            <CardDescription>{saveState}</CardDescription>
          </div>
          <Badge variant={statusVariant[statusToLabel(status)]}>{statusToLabel(status)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <DetailInput label="Company" value={companyName} onChange={setCompanyName} />
          <DetailInput label="Role" value={jobTitle} onChange={setJobTitle} />
          <DetailInput
            label="Date"
            type="date"
            value={applicationDate}
            onChange={setApplicationDate}
          />
          <DetailInput label="ATS" value={ats} onChange={setAts} />
        </div>
        <DetailInput label="Job URL" type="url" value={jobUrl} onChange={setJobUrl} />
        <label className="flex flex-col gap-2">
          <span className="font-medium">Status</span>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as ApplicationRecord["status"])
            }
          >
            <option value="draft">Draft</option>
            <option value="applied">Applied</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-medium">Notes</span>
          <textarea
            className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <InfoBlock label="Answer snapshots" value={`${answerCount}`} />
          <InfoBlock
            label="Success confidence"
            value={`${Math.round((application.success_detection?.confidence ?? 0) * 100)}%`}
          />
          <InfoBlock
            label="Resume document"
            value={documentDisplayValue(application.resume_document_id, documents)}
          />
          <InfoBlock
            label="Cover letter"
            value={documentDisplayValue(application.cover_letter_document_id, documents)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-medium">Success signals</span>
          <div className="flex flex-wrap gap-1">
            {signals.length === 0 ? (
              <span className="text-xs text-muted-foreground">No signals stored.</span>
            ) : null}
            {signals.map((signal) => (
              <Badge key={signal} variant="outline">
                {signal}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-medium">Answer provenance</span>
          {answerSnapshot ? (
            <div className="flex flex-col gap-2">
              {answerSnapshot.fields.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  No field-level snapshot was stored.
                </span>
              ) : null}
              {answerSnapshot.fields.slice(0, 8).map((field) => (
                <div
                  className="rounded-md border border-border p-3"
                  key={`${field.field_id}-${field.action}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{field.field_id}</span>
                    <Badge variant="outline">{field.status}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {field.action} · {Math.round(field.confidence * 100)}%
                    {field.needs_review ? " · review required" : ""}
                  </div>
                  {field.value_preview ? (
                    <div className="mt-2 break-words text-xs">{field.value_preview}</div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {field.source_refs.length === 0 ? (
                      <Badge variant="outline">no source refs</Badge>
                    ) : null}
                    {field.source_refs.map((sourceRef) => (
                      <Badge key={sourceRef} variant="outline">
                        {sourceRef}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
              {answerSnapshot.fields.length > 8 ? (
                <span className="text-xs text-muted-foreground">
                  {answerSnapshot.fields.length - 8} more fields stored in the local
                  snapshot.
                </span>
              ) : null}
              {answerSnapshot.blocked_items.length > 0 ? (
                <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
                  Blocked fields:{" "}
                  {answerSnapshot.blocked_items
                    .map((item) => `${item.field_id}: ${item.reason}`)
                    .join("; ")}
                </div>
              ) : null}
            </div>
          ) : answerKeys.length > 0 ? (
            <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
              Legacy snapshot keys: {answerKeys.join(", ")}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              No answer provenance stored yet.
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <Button onClick={save}>Save Detail</Button>
          <div className="flex items-center gap-2">
            {deleteConfirming ? (
              <Button
                onClick={() => {
                  setDeleteConfirming(false);
                  setSaveState("Delete cancelled.");
                }}
                variant="outline"
              >
                Cancel
              </Button>
            ) : null}
            <Button onClick={remove} variant={deleteConfirming ? "destructive" : "outline"}>
              <Trash2 className="size-4" />
              {deleteConfirming ? "Confirm Delete" : "Delete Record"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-medium">{value}</div>
    </div>
  );
}

function DetailInput({
  label,
  type = "text",
  value,
  onChange,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-medium">{label}</span>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ApplicationSelect({
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
    <label className="flex flex-col gap-2">
      <span className="font-medium">{label}</span>
      <select
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function documentDisplayValue(
  documentId: string | undefined,
  documents: DocumentRecord[],
): string {
  if (!documentId) {
    return "-";
  }
  const document = documents.find((item) => item.id === documentId);
  if (!document) {
    return `Unknown document (${documentId})`;
  }
  return document.name || fileNameFromPath(document.path) || document.id || documentId;
}

function fileNameFromPath(path: string | undefined): string {
  if (!path) {
    return "";
  }
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function statusToLabel(status: ApplicationRecord["status"]): keyof typeof statusVariant {
  if (status === "applied") {
    return "Submitted";
  }
  if (status === "draft") {
    return "Draft";
  }
  return "Archived";
}

function isSafeFillCandidate(item: FillPlan["items"][number]): boolean {
  return (
    item.action !== "skip" &&
    !item.needs_review &&
    item.confidence >= 0.8 &&
    item.value !== null &&
    item.source_refs.length > 0
  );
}

function formatPlanValue(value: string | boolean | null | undefined): string {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return value || "-";
}

function confidenceLabel(confidence?: number): keyof typeof confidenceVariant {
  if (confidence === undefined) {
    return "-";
  }
  if (confidence >= 0.8) {
    return "High";
  }
  if (confidence >= 0.5) {
    return "Medium";
  }
  return "Low";
}

function planStatusLabel(
  item: FillPlan["items"][number] | null | undefined,
  blocked: FillPlan["blocked_items"][number] | null | undefined,
  result: FillResult["items"][number] | null | undefined,
): keyof typeof statusVariant {
  if (result?.status === "filled") {
    return "Filled";
  }
  if (result?.status === "needs_review") {
    return "Needs Review";
  }
  if (result?.status === "blocked") {
    return "Blocked";
  }
  if (result?.status === "error") {
    return "Error";
  }
  if (result?.status === "skipped") {
    return "Skipped";
  }
  if (blocked) {
    return "Blocked";
  }
  if (item?.needs_review) {
    return "Needs Review";
  }
  if (item) {
    return "Planned";
  }
  return "Pending";
}

function AssistantRail({
  automationMessage,
  events,
  fillPlan,
  fillResult,
  formSchema,
  onAutomationStep,
  onChatAdjust,
  onClearEvents,
  onReviewField,
  onSaveReviewedAnswer,
  state,
  successDraft,
  successResult,
  targetUrl,
  onUseDemoUrl,
  onSuccessDraftChange,
  onTargetUrlChange,
  onRun,
  onPause,
  onStop,
}: {
  automationMessage: string;
  events: AutomationEvent[];
  fillPlan: FillPlan | null;
  fillResult: FillResult | null;
  formSchema: FormSchema | null;
  onAutomationStep: (
    step: "open" | "inspect" | "plan" | "fill" | "success" | "save" | "stop",
  ) => void;
  onChatAdjust: (message: string) => void;
  onClearEvents: () => void;
  onReviewField: (
    fieldId: string,
    decision: FillPlanReviewDecision,
    value?: string | boolean | null,
  ) => void;
  onSaveReviewedAnswer: (request: SaveReviewedAnswerRequest) => void;
  state: "idle" | "running" | "paused";
  successDraft: ApplicationRecord | null;
  successResult: SuccessDetectionResult | null;
  targetUrl: string;
  onUseDemoUrl: () => void;
  onSuccessDraftChange: (record: ApplicationRecord | null) => void;
  onTargetUrlChange: (value: string) => void;
  onRun: () => void;
  onPause: () => void;
  onStop: () => void;
}) {
  const active = state === "running";
  const plannedCount = fillPlan?.items.length ?? 0;
  const blockedCount = fillPlan?.blocked_items.length ?? 0;
  const [chatMessage, setChatMessage] = useState("");
  const [confirmClearEvents, setConfirmClearEvents] = useState(false);
  const sendChatMessage = () => {
    const message = chatMessage.trim();
    if (!message) {
      return;
    }
    onChatAdjust(message);
    setChatMessage("");
  };
  const clearEvents = () => {
    if (!confirmClearEvents) {
      setConfirmClearEvents(true);
      return;
    }
    onClearEvents();
    setConfirmClearEvents(false);
  };
  return (
    <aside className="assistant-rail flex flex-col gap-4 border-l border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">JobFlow Assistant</h2>
        <Badge variant={active ? "success" : "outline"}>{active ? "Active" : "Idle"}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={active ? onPause : () => onAutomationStep("open")}>
          {active ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
          {active ? "Pause" : "Play"}
        </Button>
        <Button variant="outline" onClick={onStop}>
          <Square data-icon="inline-start" />
          Stop
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Controlled Browser</CardTitle>
          <CardDescription>Open a job URL, then inspect the current form.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Input
            value={targetUrl}
            onChange={(event) => onTargetUrlChange(event.target.value)}
          />
          <div className="grid grid-cols-3 gap-2">
            <Button size="sm" variant="outline" onClick={onUseDemoUrl}>
              Use Demo
            </Button>
            <Button size="sm" variant="outline" onClick={() => onAutomationStep("open")}>
              Open URL
            </Button>
            <Button size="sm" onClick={() => onAutomationStep("inspect")}>
              Inspect
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Automation Pipeline</CardTitle>
          <CardDescription>{automationMessage}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              disabled={!formSchema}
              size="sm"
              variant="outline"
              onClick={() => onAutomationStep("plan")}
            >
              Create Plan
            </Button>
            <Button
              disabled={!fillPlan}
              size="sm"
              onClick={() => onAutomationStep("fill")}
            >
              Fill Safe
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAutomationStep("success")}
            >
              Detect Success
            </Button>
            <Button
              disabled={!successDraft}
              size="sm"
              variant="outline"
              onClick={() => onAutomationStep("save")}
            >
              Save Record
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-md bg-muted p-2">
              <strong className="block text-sm">{formSchema?.fields.length ?? 0}</strong>
              Fields
            </div>
            <div className="rounded-md bg-muted p-2">
              <strong className="block text-sm">{plannedCount}</strong>
              Planned
            </div>
            <div className="rounded-md bg-muted p-2">
              <strong className="block text-sm">{blockedCount}</strong>
              Blocked
            </div>
          </div>
        </CardContent>
      </Card>
      {fillPlan ? (
        <Card>
          <CardHeader>
            <CardTitle>Review Next Field</CardTitle>
            <CardDescription>
              Accept a sourced value, edit with user-provided input, or leave blank.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FillPlanReviewControls
              fillPlan={fillPlan}
              formSchema={formSchema}
              onSaveReviewedAnswer={onSaveReviewedAnswer}
              onReviewField={onReviewField}
            />
          </CardContent>
        </Card>
      ) : null}
      {successResult ? (
        <Card>
          <CardHeader>
            <CardTitle>Detected Record</CardTitle>
            <CardDescription>
              Review the structured record after you submit manually.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {successDraft ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <ProfileLikeInput
                    label="Company"
                    value={successDraft.company_name}
                    onChange={(value) =>
                      onSuccessDraftChange({ ...successDraft, company_name: value })
                    }
                  />
                  <ProfileLikeInput
                    label="Position"
                    value={successDraft.job_title}
                    onChange={(value) =>
                      onSuccessDraftChange({ ...successDraft, job_title: value })
                    }
                  />
                  <ProfileLikeInput
                    label="Date"
                    value={successDraft.application_date ?? ""}
                    onChange={(value) =>
                      onSuccessDraftChange({ ...successDraft, application_date: value })
                    }
                  />
                  <ProfileLikeInput
                    label="ATS"
                    value={successDraft.ats}
                    onChange={(value) =>
                      onSuccessDraftChange({ ...successDraft, ats: value })
                    }
                  />
                </div>
                <ProfileLikeInput
                  label="Job URL"
                  value={successDraft.job_url}
                  onChange={(value) =>
                    onSuccessDraftChange({ ...successDraft, job_url: value })
                  }
                />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Confidence</span>
                  <Badge variant={successResult.detected ? "success" : "outline"}>
                    {Math.round(successResult.confidence * 100)}%
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {successResult.signals.map((signal) => (
                    <Badge key={signal} variant="outline">
                      {signal}
                    </Badge>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-md bg-muted p-3 text-muted-foreground">
                No saveable success proposal yet. Run Detect Success after the
                employer site shows its confirmation page.
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Event Stream</CardTitle>
              <CardDescription>
                Recent local history plus live backend events for manual verification.
              </CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {confirmClearEvents ? (
                <Button
                  onClick={() => setConfirmClearEvents(false)}
                  size="sm"
                  variant="outline"
                >
                  Cancel
                </Button>
              ) : null}
              <Button
                disabled={events.length === 0}
                onClick={clearEvents}
                size="sm"
                variant={confirmClearEvents ? "destructive" : "outline"}
              >
                {confirmClearEvents ? "Confirm Clear" : "Clear History"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {events.length === 0 ? (
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              No events yet. Open, inspect, or create a fill plan to start the stream.
            </div>
          ) : null}
          {events.map((event) => (
            <div
              className="flex items-start justify-between gap-3 rounded-md border border-border p-2 text-sm"
              key={event.id}
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{event.event_type}</div>
                <div className="text-xs text-muted-foreground">{event.message}</div>
              </div>
              <Badge variant={eventVariant[event.status]}>{event.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Current Step</CardTitle>
          <CardDescription>
            {active ? "Running automation" : automationMessage}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="text-sm text-muted-foreground">
            {formSchema
              ? `${formSchema.ats} form at ${formSchema.url || "current page"}`
              : "No form inspected yet"}
          </div>
          <Progress value={fillResult ? Math.min(100, fillResult.filled_count * 12) : 20} />
          <div className="rounded-md bg-muted p-3 text-sm">
            Only high-confidence fields with source references are written. Review-only
            and blocked fields stay untouched.
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Field Under Review</CardTitle>
          <CardDescription>Current Job Title</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span>Safe Fill Result</span>
            <Badge variant={fillResult?.error_count ? "danger" : "success"}>
              {fillResult ? fillResult.status : "Waiting"}
            </Badge>
          </div>
          <strong>{fillResult ? `${fillResult.filled_count} fields filled` : "No fields filled yet"}</strong>
          <div className="text-muted-foreground">
            {fillResult
              ? `${fillResult.review_count} need review, ${fillResult.error_count} errors`
              : "Create a plan and click Fill Safe."}
          </div>
          <Button variant="outline" size="sm">
            Open in Profile
          </Button>
        </CardContent>
      </Card>
      <Card className="bg-muted/40">
        <CardContent className="flex flex-col gap-2 p-4 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <ShieldCheck />
            Safety Reminder
          </div>
          <p>
            JobFlow does not submit applications. Please review all fields and submit
            manually on the employer site.
          </p>
        </CardContent>
      </Card>
      <div className="mt-auto flex flex-col gap-2">
        <div className="flex gap-2">
          <Input
            placeholder="Ask me to adjust this field..."
            value={chatMessage}
            onChange={(event) => setChatMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                sendChatMessage();
              }
            }}
          />
          <Button size="sm" onClick={sendChatMessage}>
            Send
          </Button>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Local AI • Private • Offline First</span>
          <span>{API_BASE}</span>
        </div>
      </div>
    </aside>
  );
}

function ProfileLikeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function FloatingAssistantButton({
  state,
  onRun,
}: {
  state: "idle" | "running" | "paused";
  onRun: () => void;
}) {
  return (
    <motion.button
      animate={{ scale: state === "running" ? 1.03 : 1 }}
      className="fixed bottom-5 right-5 hidden size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg max-[1180px]:flex"
      onClick={onRun}
      whileTap={{ scale: 0.96 }}
    >
      {state === "running" ? <Pause /> : <Play />}
    </motion.button>
  );
}

export default App;
