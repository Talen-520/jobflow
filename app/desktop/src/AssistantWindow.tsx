import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Pause,
  Play,
  Send,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FillPlanReviewControls } from "@/components/fill-plan-review-controls";
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
  API_BASE,
  applyFillPlan,
  chatAdjust,
  createApplication,
  createFillPlan,
  detectSuccess,
  getDemoApplicationUrl,
  getEventsUrl,
  getHealth,
  inspectForm,
  openBrowser,
  pauseAutomation,
  resumeAutomation,
  reviewFillPlanField,
  saveAnswerBankEntry,
  stopBrowser,
  testApplicationLinks,
  type ApplicationRecord,
  type AutomationEvent,
  type FillPlan,
  type FillPlanReviewDecision,
  type FillResult,
  type FormSchema,
  type SuccessDetectionResult,
} from "@/lib/api";
import { hideFloatingAssistant, showMainWindow } from "@/lib/desktop";
import {
  buildApplicationAnswersSnapshot,
  uploadedDocumentIdsFromPlan,
} from "@/lib/fill-plan";

const eventVariant = {
  info: "outline",
  running: "default",
  success: "success",
  warning: "warning",
  error: "danger",
} as const;

export function AssistantWindow() {
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">(
    "checking",
  );
  const [running, setRunning] = useState(false);
  const [targetUrl, setTargetUrl] = useState(getDemoApplicationUrl);
  const [message, setMessage] = useState("Ready for a safe apply run.");
  const [formSchema, setFormSchema] = useState<FormSchema | null>(null);
  const [fillPlan, setFillPlan] = useState<FillPlan | null>(null);
  const [fillResult, setFillResult] = useState<FillResult | null>(null);
  const [successResult, setSuccessResult] = useState<SuccessDetectionResult | null>(null);
  const [successDraft, setSuccessDraft] = useState<ApplicationRecord | null>(null);
  const [events, setEvents] = useState<AutomationEvent[]>([]);
  const [chatMessage, setChatMessage] = useState("");

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

    const socket = new WebSocket(getEventsUrl());
    socket.onmessage = (eventMessage) => {
      try {
        const event = JSON.parse(eventMessage.data) as AutomationEvent;
        setEvents((current) => [event, ...current].slice(0, 4));
        if (event.message) {
          setMessage(event.message);
        }
      } catch {
        setMessage("Received an unreadable automation event.");
      }
    };
    socket.onerror = () => setMessage("Automation event stream disconnected.");
    return () => socket.close();
  }, [backendStatus]);

  const safeFillCount =
    fillPlan?.items.filter(
      (item) =>
        item.action !== "skip" &&
        !item.needs_review &&
        item.confidence >= 0.8 &&
        item.source_refs.length > 0 &&
        item.value !== null,
    ).length ?? 0;
  const reviewQueueCount =
    (fillPlan?.items.filter((item) => item.needs_review || item.confidence < 0.8)
      .length ?? 0) + (fillPlan?.blocked_items.length ?? 0);
  const sourceBackedCount =
    fillPlan?.items.filter((item) => item.source_refs.length > 0).length ?? 0;

  const runSafeFlow = async () => {
    if (backendStatus !== "online") {
      setMessage("Backend is offline. Start JobFlow locally first.");
      return;
    }

    setRunning(true);
    setSuccessResult(null);
    setSuccessDraft(null);
    try {
      setMessage("Opening controlled browser...");
      await openBrowser(targetUrl);

      setMessage("Inspecting application form...");
      const inspected = await inspectForm();
      setFormSchema(inspected);

      setMessage("Creating source-backed fill plan...");
      const plan = await createFillPlan(inspected);
      setFillPlan(plan);

      setMessage("Filling safe fields only...");
      const result = await applyFillPlan(plan, inspected, false);
      setFillResult(result);
      setMessage(
        `Filled ${result.filled_count}; ${result.review_count} need review; ${result.error_count} errors.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Safe flow failed.");
    } finally {
      setRunning(false);
    }
  };

  const inspectOnly = async () => {
    setRunning(true);
    try {
      const inspected = await inspectForm();
      setFormSchema(inspected);
      setFillPlan(null);
      setFillResult(null);
      setMessage(`Found ${inspected.fields.length} fields on ${inspected.ats}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Inspection failed.");
    } finally {
      setRunning(false);
    }
  };

  const detectSubmitted = async () => {
    setRunning(true);
    try {
      const result = await detectSuccess(formSchema ?? undefined);
      setSuccessResult(result);
      setSuccessDraft(result.proposed_record);
      setMessage(
        result.detected
          ? `Success detected at ${Math.round(result.confidence * 100)}% confidence.`
          : "No success page detected yet.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Success detection failed.");
    } finally {
      setRunning(false);
    }
  };

  const saveRecord = async () => {
    if (!successDraft) {
      setMessage("No success record proposal is ready to save.");
      return;
    }

    setRunning(true);
    try {
      const saved = await createApplication({
        ...successDraft,
        ...uploadedDocumentIdsFromPlan(fillPlan),
        status: "applied",
        answers_snapshot: buildApplicationAnswersSnapshot(fillPlan, fillResult),
      });
      setMessage(`Saved application record for ${saved.company_name || "this role"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Application save failed.");
    } finally {
      setRunning(false);
    }
  };

  const pause = async () => {
    try {
      await pauseAutomation();
      setRunning(false);
      setMessage("Automation paused.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pause failed.");
    }
  };

  const resume = async () => {
    try {
      await resumeAutomation();
      setMessage("Automation resumed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Resume failed.");
    }
  };

  const stop = async () => {
    setRunning(false);
    try {
      await stopBrowser();
      setMessage("Controlled browser stopped.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Stop failed.");
    }
  };

  const sendChatMessage = async () => {
    const text = chatMessage.trim();
    if (!text) {
      return;
    }
    if (!fillPlan) {
      setMessage("Create a fill plan before using chat adjustments.");
      return;
    }

    setChatMessage("");
    try {
      const result = await chatAdjust({ message: text, current_plan: fillPlan });
      if (result.updated_plan) {
        setFillPlan(result.updated_plan);
      }
      setMessage(`Chat adjustment parsed as ${result.command}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Chat adjustment failed.");
    }
  };

  const reviewField = async (
    fieldId: string,
    decision: FillPlanReviewDecision,
    value?: string | boolean | null,
  ) => {
    if (!fillPlan) {
      setMessage("Create a fill plan before reviewing fields.");
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
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Field review failed.");
    }
  };

  const saveReviewedAnswer = async (request: {
    fieldId: string;
    title: string;
    body: string;
    questionType: string;
    tags: string[];
  }) => {
    try {
      const saved = await saveAnswerBankEntry({
        question_type: request.questionType,
        title: request.title,
        body: request.body,
        tags: request.tags,
      });
      setMessage(`Saved "${saved.title || request.fieldId}" as a reusable answer.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Answer save failed.");
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-card text-foreground">
      <header
        className="flex items-center justify-between border-b border-border px-3 py-2"
        data-tauri-drag-region
      >
        <div className="flex items-center gap-2" data-tauri-drag-region>
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck />
          </div>
          <div className="leading-tight" data-tauri-drag-region>
            <div className="text-sm font-semibold">JobFlow Assistant</div>
            <div className="text-xs text-muted-foreground">{API_BASE}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => void showMainWindow()}>
            <ArrowUpRight data-icon="inline-start" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => void hideFloatingAssistant()}>
            <X data-icon="inline-start" />
          </Button>
        </div>
      </header>

      <section className="flex flex-1 flex-col gap-3 overflow-auto p-3">
        <div className="flex items-center justify-between gap-2">
          <Badge variant={backendStatus === "online" ? "success" : "outline"}>
            {backendStatus === "online" ? "Backend online" : backendStatus}
          </Badge>
          <Badge variant={running ? "default" : "outline"}>
            {running ? "Running" : "Ready"}
          </Badge>
        </div>

        <Card>
          <CardHeader className="p-3">
            <CardTitle>Safe Apply Run</CardTitle>
            <CardDescription>{message}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 p-3 pt-0">
            <div className="flex gap-2">
              <Input
                className="min-w-0 flex-1"
                value={targetUrl}
                onChange={(event) => setTargetUrl(event.target.value)}
              />
              <Button variant="outline" onClick={() => setTargetUrl(getDemoApplicationUrl())}>
                Demo
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {testApplicationLinks.map((link) => (
                <Button
                  key={link.provider}
                  size="sm"
                  variant="outline"
                  onClick={() => setTargetUrl(link.url)}
                >
                  {link.provider}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={running} onClick={() => void runSafeFlow()}>
                <Play data-icon="inline-start" />
                Play
              </Button>
              <Button disabled={running} variant="outline" onClick={() => void inspectOnly()}>
                Inspect
              </Button>
              <Button variant="outline" onClick={() => void (running ? pause() : resume())}>
                <Pause data-icon="inline-start" />
                {running ? "Pause" : "Resume"}
              </Button>
              <Button variant="outline" onClick={() => void stop()}>
                <Square data-icon="inline-start" />
                Stop
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <Metric label="Fields" value={`${formSchema?.fields.length ?? 0}`} />
          <Metric label="Safe" value={`${fillResult?.filled_count ?? safeFillCount}`} />
          <Metric label="Review" value={`${reviewQueueCount}`} />
        </div>
        <Progress value={fillResult ? Math.min(100, fillResult.filled_count * 12) : 20} />

        <Card>
          <CardHeader className="p-3">
            <CardTitle>Current Form</CardTitle>
            <CardDescription>
              {formSchema
                ? `${formSchema.ats} at ${formSchema.url || "current page"}`
                : "No form inspected yet."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 p-3 pt-0 text-sm">
            <InfoLine label="Planned" value={`${fillPlan?.items.length ?? 0}`} />
            <InfoLine label="Source-backed" value={`${sourceBackedCount}`} />
            <InfoLine label="Needs review" value={`${reviewQueueCount}`} />
            <InfoLine label="Errors" value={`${fillResult?.error_count ?? 0}`} />
          </CardContent>
        </Card>

        {fillPlan ? <PlanAuditCard fillPlan={fillPlan} formSchema={formSchema} /> : null}

        {fillPlan ? (
          <Card>
            <CardHeader className="p-3">
              <CardTitle>Review Next Field</CardTitle>
              <CardDescription>Approve, edit, or leave blank before refilling.</CardDescription>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <FillPlanReviewControls
                fillPlan={fillPlan}
                formSchema={formSchema}
                onSaveReviewedAnswer={saveReviewedAnswer}
                onReviewField={reviewField}
              />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="p-3">
            <CardTitle>Manual Submit Check</CardTitle>
            <CardDescription>
              Submit on the employer site yourself, then detect and save the record.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 p-3 pt-0">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => void detectSubmitted()}>
                Detect Success
              </Button>
              <Button disabled={!successDraft} onClick={() => void saveRecord()}>
                <CheckCircle2 data-icon="inline-start" />
                Save
              </Button>
            </div>
            {successDraft ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <CompactInput
                  label="Company"
                  value={successDraft.company_name}
                  onChange={(value) =>
                    setSuccessDraft({ ...successDraft, company_name: value })
                  }
                />
                <CompactInput
                  label="Position"
                  value={successDraft.job_title}
                  onChange={(value) => setSuccessDraft({ ...successDraft, job_title: value })}
                />
                <CompactInput
                  label="Date"
                  value={successDraft.application_date ?? ""}
                  onChange={(value) =>
                    setSuccessDraft({ ...successDraft, application_date: value })
                  }
                />
                <CompactInput
                  label="ATS"
                  value={successDraft.ats}
                  onChange={(value) => setSuccessDraft({ ...successDraft, ats: value })}
                />
              </div>
            ) : null}
            {successResult ? (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{successResult.signals.join(", ") || "No success signal yet"}</span>
                <Badge variant={successResult.detected ? "success" : "outline"}>
                  {Math.round(successResult.confidence * 100)}%
                </Badge>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3">
            <CardTitle>Chat Adjust</CardTitle>
            <CardDescription>Use bounded commands like shorten or leave blank.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2 p-3 pt-0">
            <Input
              placeholder="Make it shorter..."
              value={chatMessage}
              onChange={(event) => setChatMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void sendChatMessage();
                }
              }}
            />
            <Button size="icon" onClick={() => void sendChatMessage()}>
              <Send data-icon="inline-start" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3">
            <CardTitle>Recent Events</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 p-3 pt-0">
            {events.length === 0 ? (
              <div className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                No events yet.
              </div>
            ) : null}
            {events.map((event) => (
              <div
                className="flex items-start justify-between gap-2 rounded-md border border-border p-2 text-xs"
                key={event.id}
              >
                <div>
                  <div className="font-medium">{event.event_type}</div>
                  <div className="text-muted-foreground">{event.message}</div>
                </div>
                <Badge variant={eventVariant[event.status]}>{event.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted p-2">
      <strong className="block text-sm">{value}</strong>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function PlanAuditCard({
  fillPlan,
  formSchema,
}: {
  fillPlan: FillPlan;
  formSchema: FormSchema | null;
}) {
  const reviewItems = fillPlan.items.filter(
    (item) => item.needs_review || item.confidence < 0.8,
  );
  const sourceBackedItems = fillPlan.items.filter(
    (item) => item.source_refs.length > 0,
  );
  const fillWithoutSources = fillPlan.items.filter(
    (item) =>
      item.action !== "skip" &&
      item.value !== null &&
      item.value !== "" &&
      item.source_refs.length === 0,
  );

  return (
    <Card>
      <CardHeader className="p-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Plan Audit</CardTitle>
          <Badge variant={fillWithoutSources.length ? "danger" : "success"}>
            {fillWithoutSources.length ? "Check sources" : "Source gated"}
          </Badge>
        </div>
        <CardDescription>
          Review why fields pause and which proposed values have local sources.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 p-3 pt-0 text-sm">
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <Metric label="Sources" value={`${sourceBackedItems.length}`} />
          <Metric label="Review" value={`${reviewItems.length}`} />
          <Metric label="Blocked" value={`${fillPlan.blocked_items.length}`} />
        </div>

        {fillWithoutSources.length > 0 ? (
          <div className="rounded-md border border-border p-2 text-xs">
            <div className="font-medium">Values without source refs</div>
            <div className="mt-1 text-muted-foreground">
              {fillWithoutSources
                .slice(0, 3)
                .map((item) => item.field_id)
                .join(", ")}
            </div>
          </div>
        ) : null}

        <AuditList
          emptyText="No blocked fields."
          items={fillPlan.blocked_items.slice(0, 3).map((item) => ({
            id: item.field_id,
            title: fieldLabel(formSchema, item.field_id),
            detail: item.reason,
            badge: "Blocked",
            badgeVariant: "danger" as const,
            sourceRefs: [],
          }))}
          overflowCount={Math.max(0, fillPlan.blocked_items.length - 3)}
        />

        <AuditList
          emptyText="No fields currently require review."
          items={reviewItems.slice(0, 3).map((item) => ({
            id: item.field_id,
            title: fieldLabel(formSchema, item.field_id),
            detail: item.reason,
            badge: `${Math.round(item.confidence * 100)}%`,
            badgeVariant: "warning" as const,
            sourceRefs: item.source_refs,
          }))}
          overflowCount={Math.max(0, reviewItems.length - 3)}
        />
      </CardContent>
    </Card>
  );
}

function AuditList({
  emptyText,
  items,
  overflowCount,
}: {
  emptyText: string;
  items: Array<{
    id: string;
    title: string;
    detail: string;
    badge: string;
    badgeVariant: "danger" | "warning";
    sourceRefs: string[];
  }>;
  overflowCount: number;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div className="rounded-md border border-border p-2 text-xs" key={item.id}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-medium">{item.title}</div>
              <div className="truncate text-muted-foreground">{item.detail}</div>
            </div>
            <Badge variant={item.badgeVariant}>{item.badge}</Badge>
          </div>
          {item.sourceRefs.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {item.sourceRefs.slice(0, 2).map((sourceRef) => (
                <Badge key={sourceRef} variant="outline">
                  {sourceRef}
                </Badge>
              ))}
              {item.sourceRefs.length > 2 ? (
                <Badge variant="outline">+{item.sourceRefs.length - 2}</Badge>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
      {overflowCount > 0 ? (
        <div className="text-xs text-muted-foreground">
          {overflowCount} more items hidden in this compact view.
        </div>
      ) : null}
    </div>
  );
}

function fieldLabel(formSchema: FormSchema | null, fieldId: string): string {
  const field = formSchema?.fields.find((item) => item.field_id === fieldId);
  return field?.label || fieldId;
}

function CompactInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
