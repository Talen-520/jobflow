import type { FillPlan, FillResult } from "@/lib/api";

export type ApplicationAnswersSnapshot = {
  version: 1;
  summary: {
    planned_count: number;
    blocked_count: number;
    review_required_count: number;
    filled_count: number;
    skipped_count: number;
    error_count: number;
  };
  fields: Array<{
    field_id: string;
    action: FillPlan["items"][number]["action"];
    status: string;
    confidence: number;
    needs_review: boolean;
    source_refs: string[];
    value_kind: "empty" | "boolean" | "document" | "text";
    value_preview: string;
    reason: string;
  }>;
  blocked_items: Array<{
    field_id: string;
    reason: string;
  }>;
};

export function uploadedDocumentIdsFromPlan(
  plan: FillPlan | null,
): {
  resume_document_id?: string;
  cover_letter_document_id?: string;
} {
  const documents: {
    resume_document_id?: string;
    cover_letter_document_id?: string;
  } = {};

  for (const item of plan?.items ?? []) {
    if (item.action !== "upload") {
      continue;
    }
    const documentId = item.source_refs
      .find((sourceRef) => sourceRef.startsWith("profile.documents."))
      ?.replace("profile.documents.", "");
    if (!documentId) {
      continue;
    }

    const fieldText = `${item.field_id} ${item.reason}`.toLowerCase();
    if (fieldText.includes("cover")) {
      documents.cover_letter_document_id = documentId;
    } else {
      documents.resume_document_id = documentId;
    }
  }

  return documents;
}

export function buildApplicationAnswersSnapshot(
  plan: FillPlan | null,
  result: FillResult | null,
): ApplicationAnswersSnapshot {
  const resultByField = new Map(
    (result?.items ?? []).map((item) => [item.field_id, item]),
  );
  const fields = (plan?.items ?? []).map((item) => {
    const resultItem = resultByField.get(item.field_id);
    return {
      field_id: item.field_id,
      action: item.action,
      status: resultItem?.status ?? (item.needs_review ? "needs_review" : "planned"),
      confidence: Math.round(item.confidence * 100) / 100,
      needs_review: item.needs_review,
      source_refs: item.source_refs,
      value_kind: valueKind(item),
      value_preview: valuePreview(item),
      reason: resultItem?.reason || item.reason,
    };
  });

  return {
    version: 1,
    summary: {
      planned_count: plan?.items.length ?? 0,
      blocked_count: plan?.blocked_items.length ?? 0,
      review_required_count:
        result?.review_count ?? plan?.items.filter((item) => item.needs_review).length ?? 0,
      filled_count: result?.filled_count ?? 0,
      skipped_count: result?.skipped_count ?? 0,
      error_count: result?.error_count ?? 0,
    },
    fields,
    blocked_items: plan?.blocked_items ?? [],
  };
}

export function applicationSnapshotFromRecord(
  snapshot: Record<string, unknown> | undefined,
): ApplicationAnswersSnapshot | null {
  if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.fields)) {
    return null;
  }
  return snapshot as ApplicationAnswersSnapshot;
}

export function applicationSnapshotAnswerCount(
  snapshot: Record<string, unknown> | undefined,
): number {
  const parsed = applicationSnapshotFromRecord(snapshot);
  if (parsed) {
    return parsed.fields.length;
  }
  return Object.keys(snapshot ?? {}).length;
}

function valueKind(
  item: FillPlan["items"][number],
): ApplicationAnswersSnapshot["fields"][number]["value_kind"] {
  if (item.action === "upload") {
    return "document";
  }
  if (typeof item.value === "boolean") {
    return "boolean";
  }
  if (item.value === null || item.value === "") {
    return "empty";
  }
  return "text";
}

function valuePreview(item: FillPlan["items"][number]): string {
  if (item.action === "upload") {
    return "[local document]";
  }
  if (typeof item.value === "boolean") {
    return item.value ? "Yes" : "No";
  }
  if (item.value === null || item.value === "") {
    return "";
  }
  const value = String(item.value).trim();
  if (value.includes("/") || value.includes("\\")) {
    return "[local file]";
  }
  return value.length > 140 ? `${value.slice(0, 137)}...` : value;
}
