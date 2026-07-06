import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type FillPlan,
  type FillPlanReviewDecision,
  type FormField,
  type FormSchema,
} from "@/lib/api";

type ReviewFieldHandler = (
  fieldId: string,
  decision: FillPlanReviewDecision,
  value?: string | boolean | null,
) => Promise<void> | void;

type SaveReviewedAnswerHandler = (request: {
  fieldId: string;
  title: string;
  body: string;
  questionType: string;
  tags: string[];
}) => Promise<void> | void;

export function FillPlanReviewControls({
  fillPlan,
  formSchema,
  disabled = false,
  onReviewField,
  onSaveReviewedAnswer,
}: {
  fillPlan: FillPlan | null;
  formSchema: FormSchema | null;
  disabled?: boolean;
  onReviewField: ReviewFieldHandler;
  onSaveReviewedAnswer?: SaveReviewedAnswerHandler;
}) {
  const reviewItem =
    fillPlan?.items.find((item) => item.needs_review) ??
    fillPlan?.items.find((item) => item.confidence < 0.8) ??
    null;
  const blockedItem = reviewItem ? null : (fillPlan?.blocked_items[0] ?? null);
  const activeFieldId = reviewItem?.field_id ?? blockedItem?.field_id ?? "";
  const activeField = formSchema?.fields.find((field) => field.field_id === activeFieldId);
  const [editedValue, setEditedValue] = useState("");
  const [saveAsReusableAnswer, setSaveAsReusableAnswer] = useState(false);

  useEffect(() => {
    setEditedValue(formatInitialValue(reviewItem?.value, activeField));
    setSaveAsReusableAnswer(false);
  }, [activeField, activeFieldId, reviewItem?.value]);

  if (!activeFieldId) {
    return (
      <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
        No fields currently require review.
      </div>
    );
  }

  const canAccept = Boolean(reviewItem);
  const canSubmitEdit = activeField?.type === "checkbox" || editedValue.trim().length > 0;
  const sourceRefs = reviewItem?.source_refs ?? [];
  const canSaveReusableAnswer =
    Boolean(onSaveReviewedAnswer) &&
    canSubmitEdit &&
    isReusableAnswerField(activeField, activeFieldId, editedValue);

  const useEdit = async () => {
    await onReviewField(activeFieldId, "edit", editedValue);
    if (!saveAsReusableAnswer || !onSaveReviewedAnswer || !canSaveReusableAnswer) {
      return;
    }
    await onSaveReviewedAnswer({
      fieldId: activeFieldId,
      title: activeField?.label || activeFieldId,
      body: editedValue.trim(),
      questionType: inferQuestionType(activeField, activeFieldId),
      tags: ["reviewed", "application"],
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {activeField?.label || activeFieldId}
          </div>
          <div className="truncate text-xs text-muted-foreground">{activeFieldId}</div>
        </div>
        <Badge variant={blockedItem ? "danger" : "warning"}>
          {blockedItem ? "Blocked" : "Review"}
        </Badge>
      </div>
      <ReviewValueInput
        field={activeField}
        value={editedValue}
        onChange={setEditedValue}
      />
      <div className="flex flex-wrap gap-1">
        {sourceRefs.length === 0 ? (
          <span className="text-xs text-muted-foreground">No source refs.</span>
        ) : null}
        {sourceRefs.map((sourceRef) => (
          <Badge key={sourceRef} variant="outline">
            {sourceRef}
          </Badge>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {blockedItem?.reason ?? reviewItem?.reason ?? "User review required."}
      </p>
      {canSaveReusableAnswer ? (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            checked={saveAsReusableAnswer}
            disabled={disabled}
            type="checkbox"
            onChange={(event) => setSaveAsReusableAnswer(event.target.checked)}
          />
          Save this edit as a reusable preset answer
        </label>
      ) : null}
      <div className="grid grid-cols-3 gap-2">
        <Button
          disabled={disabled || !canAccept}
          size="sm"
          variant="outline"
          onClick={() => onReviewField(activeFieldId, "accept")}
        >
          Accept
        </Button>
        <Button
          disabled={disabled || !canSubmitEdit}
          size="sm"
          onClick={() => void useEdit()}
        >
          Use Edit
        </Button>
        <Button
          disabled={disabled}
          size="sm"
          variant="outline"
          onClick={() => onReviewField(activeFieldId, "leave_blank")}
        >
          Leave Blank
        </Button>
      </div>
    </div>
  );
}

function isReusableAnswerField(
  field: FormField | undefined,
  fieldId: string,
  value: string,
): boolean {
  if (!field || field.sensitive || value.trim().length < 8) {
    return false;
  }
  if (!["text", "textarea", "unknown"].includes(field.type)) {
    return false;
  }
  const text = `${fieldId} ${field.label} ${field.placeholder} ${field.helper_text}`.toLowerCase();
  return ![
    "address",
    "authorized",
    "citizen",
    "disability",
    "diversity",
    "eeo",
    "email",
    "gender",
    "legal",
    "name",
    "phone",
    "race",
    "relocation",
    "salary",
    "sponsorship",
    "veteran",
    "visa",
  ].some((token) => text.includes(token));
}

function inferQuestionType(field: FormField | undefined, fieldId: string): string {
  const text = `${fieldId} ${field?.label ?? ""} ${field?.placeholder ?? ""}`.toLowerCase();
  if (text.includes("why") || text.includes("interest") || text.includes("motivation")) {
    return "motivation";
  }
  if (text.includes("cover")) {
    return "cover_letter";
  }
  if (text.includes("project")) {
    return "project";
  }
  if (text.includes("experience") || text.includes("background")) {
    return "experience";
  }
  return "general";
}

function ReviewValueInput({
  field,
  value,
  onChange,
}: {
  field: FormField | undefined;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field?.type === "select" || field?.type === "radio") {
    return (
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-muted-foreground">Reviewed value</span>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Choose value</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option || "Blank"}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field?.type === "checkbox") {
    return (
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-muted-foreground">Reviewed value</span>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={value || "true"}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="true">Checked</option>
          <option value="false">Unchecked</option>
        </select>
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-muted-foreground">Reviewed value</span>
      <Input
        placeholder="Type the user-approved value"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function formatInitialValue(
  value: string | boolean | null | undefined,
  field: FormField | undefined,
): string {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (value) {
    return value;
  }
  if (field?.type === "checkbox") {
    return "true";
  }
  return "";
}
