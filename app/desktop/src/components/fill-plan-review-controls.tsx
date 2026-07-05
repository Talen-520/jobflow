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
) => void;

export function FillPlanReviewControls({
  fillPlan,
  formSchema,
  disabled = false,
  onReviewField,
}: {
  fillPlan: FillPlan | null;
  formSchema: FormSchema | null;
  disabled?: boolean;
  onReviewField: ReviewFieldHandler;
}) {
  const reviewItem =
    fillPlan?.items.find((item) => item.needs_review) ??
    fillPlan?.items.find((item) => item.confidence < 0.8) ??
    null;
  const blockedItem = reviewItem ? null : (fillPlan?.blocked_items[0] ?? null);
  const activeFieldId = reviewItem?.field_id ?? blockedItem?.field_id ?? "";
  const activeField = formSchema?.fields.find((field) => field.field_id === activeFieldId);
  const [editedValue, setEditedValue] = useState("");

  useEffect(() => {
    setEditedValue(formatInitialValue(reviewItem?.value, activeField));
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
          onClick={() => onReviewField(activeFieldId, "edit", editedValue)}
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
