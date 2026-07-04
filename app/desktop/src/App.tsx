import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  Database,
  ExternalLink,
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
  User,
} from "lucide-react";
import { motion } from "motion/react";

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
  API_BASE,
  applyFillPlan,
  createApplication,
  createFillPlan,
  detectSuccess,
  getHealth,
  inspectForm,
  listApplications,
  openBrowser,
  stopBrowser,
  type ApplicationRecord,
  type FillPlan,
  type FillResult,
  type FormSchema,
  type SuccessDetectionResult,
} from "@/lib/api";
import { applicationRows, fillSections } from "@/lib/sample-data";
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
} as const;

function App() {
  const [selectedNav, setSelectedNav] = useState("Applications");
  const [assistantState, setAssistantState] = useState<"idle" | "running" | "paused">(
    "idle",
  );
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">(
    "checking",
  );
  const [targetUrl, setTargetUrl] = useState("https://boards.greenhouse.io/example");
  const [automationMessage, setAutomationMessage] = useState("Ready to inspect this page.");
  const [formSchema, setFormSchema] = useState<FormSchema | null>(null);
  const [fillPlan, setFillPlan] = useState<FillPlan | null>(null);
  const [fillResult, setFillResult] = useState<FillResult | null>(null);
  const [successResult, setSuccessResult] = useState<SuccessDetectionResult | null>(null);
  const [savedApplications, setSavedApplications] = useState<ApplicationRecord[]>([]);

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
    return () => controller.abort();
  }, [backendStatus]);

  const reviewedCount = useMemo(
    () => fillSections.filter((section) => section.status === "Reviewed").length,
    [],
  );
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
        setAutomationMessage(state.status === "stopped" ? "Browser stopped." : state.message);
      }
      if (step === "inspect") {
        setAutomationMessage("Inspecting current browser page...");
        const inspected = await inspectForm();
        setFormSchema(inspected);
        setFillPlan(null);
        setFillResult(null);
        setSuccessResult(null);
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
        setAutomationMessage(
          result.detected
            ? `Success detected at ${Math.round(result.confidence * 100)}% confidence.`
            : "No success page detected yet.",
        );
      }
      if (step === "save") {
        const proposal = successResult?.proposed_record;
        if (!proposal) {
          setAutomationMessage("No success record proposal is ready to save.");
          return;
        }
        const saved = await createApplication({
          ...proposal,
          status: "applied",
          answers_snapshot: {
            fill_result: fillResult,
            fill_plan: fillPlan,
          },
        });
        setSavedApplications((current) => [saved, ...current]);
        setAutomationMessage(`Saved application record for ${saved.company_name}.`);
      }
    } catch (error) {
      setAutomationMessage(error instanceof Error ? error.message : "Automation failed.");
    } finally {
      setAssistantState((current) => (current === "paused" ? "paused" : "idle"));
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <TopBar backendStatus={backendStatus} />
      <div className="app-grid min-h-[calc(100vh-52px)]">
        <Sidebar selectedNav={selectedNav} onSelect={setSelectedNav} />
        <section className="flex min-w-0 flex-col gap-4 border-l border-border p-5">
          {selectedNav === "Dashboard" ? <DashboardPage /> : null}
          {selectedNav === "Profile" ? (
            <ProfilePage backendOnline={backendOnline} />
          ) : null}
          {selectedNav === "Applications" ? (
            <ApplicationWorkspace
              applications={savedApplications}
              reviewedCount={reviewedCount}
            />
          ) : null}
          {selectedNav === "Fill Plans" ? <FillPlansPage /> : null}
          {selectedNav === "Documents" ? (
            <DocumentsPage backendOnline={backendOnline} />
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
          fillPlan={fillPlan}
          fillResult={fillResult}
          formSchema={formSchema}
          onAutomationStep={runAutomationStep}
          state={assistantState}
          successResult={successResult}
          targetUrl={targetUrl}
          onTargetUrlChange={setTargetUrl}
          onRun={() => setAssistantState("running")}
          onPause={() => setAssistantState("paused")}
          onStop={() => void runAutomationStep("stop")}
        />
      </div>
      <FloatingAssistantButton
        state={assistantState}
        onRun={() => setAssistantState("running")}
      />
    </main>
  );
}

function ApplicationWorkspace({
  applications,
  reviewedCount,
}: {
  applications: ApplicationRecord[];
  reviewedCount: number;
}) {
  return (
    <>
      <StatsRow />
      <Card className="overflow-hidden">
        <WorkspaceHeader />
        <div className="grid grid-cols-[1fr_360px] border-t border-border max-[980px]:grid-cols-1">
          <FillPlanPanel reviewedCount={reviewedCount} />
          <FieldReviewPanel />
        </div>
      </Card>
      <ApplicationsTable applications={applications} />
    </>
  );
}

function TopBar({ backendStatus }: { backendStatus: "checking" | "online" | "offline" }) {
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
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option>Profile: Default</option>
        </select>
      </div>
    </header>
  );
}

function Sidebar({
  selectedNav,
  onSelect,
}: {
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
          <button className="text-left hover:text-foreground">New Application</button>
          <button className="text-left hover:text-foreground">Import Form / PDF</button>
          <button className="text-left hover:text-foreground">Scan with OCR</button>
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

function StatsRow() {
  const cards = [
    {
      label: "Profile Completeness",
      value: "92%",
      hint: "All major sections complete",
      icon: CheckCircle2,
      variant: "success" as const,
    },
    {
      label: "Applications",
      value: "8",
      hint: "3 in progress",
      icon: BriefcaseBusiness,
      variant: "default" as const,
    },
    {
      label: "Ready to Submit",
      value: "2",
      hint: "Requires your review",
      icon: AlertTriangle,
      variant: "warning" as const,
    },
    {
      label: "Auto-Fill Accuracy",
      value: "94%",
      hint: "Based on reviewed fields",
      icon: ShieldCheck,
      variant: "success" as const,
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

function WorkspaceHeader() {
  return (
    <CardHeader className="gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle>Application Workspace</CardTitle>
          <select className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option>Senior Software Engineer - Acme AI</option>
          </select>
          <Badge variant="success">In Progress</Badge>
        </div>
        <Button variant="outline" size="sm">
          View Form
          <ExternalLink data-icon="inline-end" />
        </Button>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-6 text-sm">
          {["Fill Plan & Review", "Form Preview", "Profile Matches", "Attachments", "Notes"].map(
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
          Source: acme_career_portal.pdf
        </span>
      </div>
    </CardHeader>
  );
}

function FillPlanPanel({ reviewedCount }: { reviewedCount: number }) {
  return (
    <section className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Fill Plan & Review</h2>
          <p className="text-sm text-muted-foreground">
            Review each section and approve fields before filling.
          </p>
        </div>
        <div className="flex min-w-48 flex-col gap-1 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Overall Progress</span>
            <span>{reviewedCount} / 7</span>
          </div>
          <Progress value={75} />
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Section</th>
              <th className="px-3 py-2 font-medium">Fields</th>
              <th className="px-3 py-2 font-medium">Auto-Fill Coverage</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {fillSections.map((section) => (
              <tr className="border-t border-border" key={section.section}>
                <td className="px-3 py-3 font-medium">{section.section}</td>
                <td className="px-3 py-3 text-muted-foreground">{section.fields}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <Progress
                      className={section.confidence === "Low" ? "[&>div]:bg-amber-500" : ""}
                      value={section.coverage}
                    />
                    <span className="w-10 text-xs text-muted-foreground">
                      {section.coverage}%
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <Badge variant={statusVariant[section.status as keyof typeof statusVariant]}>
                    {section.status}
                  </Badge>
                </td>
                <td className="px-3 py-3">
                  <Badge
                    variant={
                      confidenceVariant[
                        section.confidence as keyof typeof confidenceVariant
                      ]
                    }
                  >
                    {section.confidence}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex gap-4">
          <span>High (80-100%)</span>
          <span>Medium (50-79%)</span>
          <span>Low (0-49%)</span>
        </div>
        <Button size="sm">
          <Play data-icon="inline-start" />
          Review All
        </Button>
      </div>
    </section>
  );
}

function FieldReviewPanel() {
  return (
    <aside className="flex flex-col gap-4 border-l border-border p-4 max-[980px]:border-l-0 max-[980px]:border-t">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Field Review</h2>
        <Badge variant="warning">Needs Review</Badge>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">Field Label</span>
        <span className="font-medium">Current Job Title</span>
        <span className="text-xs text-muted-foreground">Your Filled Value</span>
        <Input value="Senior Software Engineer" readOnly />
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Confidence</span>
        <Badge variant="warning">Medium (72%)</Badge>
      </div>
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Source</span>
          <button className="text-primary">View Source</button>
        </div>
        <p>Profile → Work Experience → Current Position</p>
      </div>
      <Card className="bg-muted/40">
        <CardContent className="flex flex-col gap-2 p-3 text-sm">
          <span className="font-medium">Why this match?</span>
          <p className="text-muted-foreground">
            The job title aligns with your most recent role based on keywords and
            recency.
          </p>
        </CardContent>
      </Card>
      <div className="flex flex-col gap-2">
        {["Senior Software Engineer", "Software Engineer II", "Lead Software Engineer"].map(
          (option, index) => (
            <label className="flex items-center gap-2 text-sm" key={option}>
              <input defaultChecked={index === 0} name="role" type="radio" />
              <span>{option}</span>
              {index === 0 ? (
                <span className="text-xs text-muted-foreground">(Current Position)</span>
              ) : null}
            </label>
          ),
        )}
      </div>
      <Button size="sm">Confirm & Next</Button>
      <Button variant="ghost" size="sm">
        Edit Value
      </Button>
    </aside>
  );
}

function ApplicationsTable({ applications }: { applications: ApplicationRecord[] }) {
  const rows =
    applications.length > 0
      ? applications.map((application) => ({
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
          answers: Object.keys(application.answers_snapshot ?? {}).length,
        }))
      : applicationRows.map((row) => ({
          role: row.role,
          company: row.company,
          status: row.status,
          date: row.lastActivity,
          url: "-",
          ats: row.source,
          answers: 0,
        }));

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
            <Input className="w-72 pl-9" placeholder="Search applications..." />
          </div>
          <Button variant="outline" size="icon">
            <SlidersHorizontal />
          </Button>
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
              <th className="px-4 py-2 font-medium">Answers</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-border" key={`${row.company}-${row.role}`}>
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

function AssistantRail({
  automationMessage,
  fillPlan,
  fillResult,
  formSchema,
  onAutomationStep,
  state,
  successResult,
  targetUrl,
  onTargetUrlChange,
  onRun,
  onPause,
  onStop,
}: {
  automationMessage: string;
  fillPlan: FillPlan | null;
  fillResult: FillResult | null;
  formSchema: FormSchema | null;
  onAutomationStep: (
    step: "open" | "inspect" | "plan" | "fill" | "success" | "save" | "stop",
  ) => void;
  state: "idle" | "running" | "paused";
  successResult: SuccessDetectionResult | null;
  targetUrl: string;
  onTargetUrlChange: (value: string) => void;
  onRun: () => void;
  onPause: () => void;
  onStop: () => void;
}) {
  const active = state === "running";
  const plannedCount = fillPlan?.items.length ?? 0;
  const blockedCount = fillPlan?.blocked_items.length ?? 0;
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
          <div className="grid grid-cols-2 gap-2">
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
              disabled={!successResult?.proposed_record}
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
        <Input placeholder="Ask me to adjust this field..." />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Local AI • Private • Offline First</span>
          <span>{API_BASE}</span>
        </div>
      </div>
    </aside>
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
