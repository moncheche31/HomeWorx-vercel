import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveOrgId } from "@/features/crm/hooks/useCrm";
import { useDocumentMutations, useUploadTicket } from "@/features/project-workspace/hooks/useProjectWorkspace";
import { DOCUMENT_MIME_TYPES, MAX_DOCUMENT_BYTES } from "@/features/project-workspace/types";
import { formatInches } from "@/domains/measurement";
import {
  parseMeasurementText,
  type MeasurementItem,
  type MeasurementSource,
} from "@/domains/measurementCapture";
import {
  deleteMeasurementItem,
  extractPlanMeasurements,
  listMeasurementCapture,
  saveMeasurementCapture,
  saveMeasurementItems,
  updateMeasurementItem,
} from "../services/measurementCapture.functions";

export type PlanState = "idle" | "uploading" | "reading" | "done" | "error";

function withDisplay(item: MeasurementItem): MeasurementItem {
  return {
    ...item,
    display:
      item.kind === "pair"
        ? `${formatInches(item.inches)} x ${formatInches(item.secondaryInches ?? 0)}`
        : formatInches(item.inches),
  };
}

/**
 * Durable measurement capture for the photo/video estimate workflow.
 *
 * Every source (spoken, typed, plan) lands in the same project-scoped tables,
 * so measurements survive reloads, project switches and new sessions, and a
 * project can never show another project's sheet.
 */
export function useMeasurementCapture(projectId: string | null) {
  const orgId = useActiveOrgId();
  const qc = useQueryClient();
  const list = useServerFn(listMeasurementCapture);
  const saveItems = useServerFn(saveMeasurementItems);
  const saveCapture = useServerFn(saveMeasurementCapture);
  const updateItem = useServerFn(updateMeasurementItem);
  const removeItem = useServerFn(deleteMeasurementItem);
  const extractPlan = useServerFn(extractPlanMeasurements);
  const ticket = useUploadTicket();
  const { finalize } = useDocumentMutations(projectId ?? "");

  const [planState, setPlanState] = useState<PlanState>("idle");
  const [planError, setPlanError] = useState<string | null>(null);

  const key = ["rv", "measurements", orgId, projectId];
  const query = useQuery({
    queryKey: key,
    enabled: !!orgId && !!projectId,
    queryFn: () => list({ data: { projectId: projectId! } }),
  });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: key });
  }, [qc, orgId, projectId]);

  const items = useMemo(
    () => (query.data?.items ?? []).map(withDisplay),
    [query.data],
  );
  const captures = useMemo(() => query.data?.captures ?? [], [query.data]);
  const confirmed = useMemo(() => items.filter((i) => i.status === "confirmed"), [items]);

  /** Parse a transcript / typed block and store both the source and the items. */
  const addFromText = useCallback(
    async (text: string, source: MeasurementSource) => {
      if (!projectId || !text.trim()) return [];
      const parsed = parseMeasurementText(text, { source });
      const capture = await saveCapture({
        data: { projectId, source, transcript: text.slice(0, 20_000) },
      });
      if (parsed.length > 0) {
        await saveItems({
          data: {
            projectId,
            items: parsed.map((i) => ({
              label: i.label,
              subject: i.subject,
              kind: i.kind,
              inches: i.inches,
              secondaryInches: i.secondaryInches,
              rawText: i.rawText,
              source,
              status: i.status,
              flag: i.flag,
              captureId: capture.id,
            })),
          },
        });
      }
      invalidate();
      return parsed;
    },
    [projectId, saveCapture, saveItems, invalidate],
  );

  /** Upload a plan/sheet, read its printed dimensions, store them as candidates. */
  const uploadPlan = useCallback(
    async (file: File) => {
      if (!projectId) return;
      setPlanError(null);
      setPlanState("uploading");
      try {
        if (file.size > MAX_DOCUMENT_BYTES) throw new Error("file_too_large");
        if (!(DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type))
          throw new Error("unsupported_type");
        const tk = await ticket.mutateAsync({
          kind: "document",
          projectId,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
        });
        const res = await fetch(tk.signedUrl, {
          method: "PUT",
          body: file,
          headers: { "content-type": file.type },
        });
        if (!res.ok) throw new Error("upload_failed");
        const doc = await finalize.mutateAsync({
          projectId,
          roomId: null,
          storagePath: tk.storagePath,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          documentType: "plan",
          description: "Measurement sheet / plan",
        });
        const documentId = (doc as { id?: string } | null)?.id ?? null;

        setPlanState("reading");
        const read = await extractPlan({
          data: { projectId, storagePath: tk.storagePath, mimeType: file.type },
        });
        const capture = await saveCapture({
          data: {
            projectId,
            source: "plan",
            transcript: read.text || null,
            documentId,
            fileName: file.name,
          },
        });
        if (read.error) {
          setPlanState("error");
          setPlanError(read.error);
          invalidate();
          return;
        }
        const parsed = parseMeasurementText(read.text, { source: "plan", documentId });
        if (parsed.length > 0) {
          await saveItems({
            data: {
              projectId,
              items: parsed.map((i) => ({
                label: i.label,
                subject: i.subject,
                kind: i.kind,
                inches: i.inches,
                secondaryInches: i.secondaryInches,
                rawText: i.rawText,
                source: "plan" as const,
                // Plan reads are never authoritative until a human confirms.
                status: "candidate" as const,
                flag: i.flag ?? "plan_extraction",
                captureId: capture.id,
                documentId,
              })),
            },
          });
        }
        setPlanState(parsed.length > 0 ? "done" : "error");
        if (parsed.length === 0) setPlanError("no_measurements");
        invalidate();
      } catch (err) {
        setPlanState("error");
        setPlanError((err as Error).message || "upload_failed");
      }
    },
    [projectId, ticket, finalize, extractPlan, saveCapture, saveItems, invalidate],
  );

  const confirmMutation = useMutation({
    mutationFn: (input: {
      id: string;
      label?: string;
      inches?: number;
      secondaryInches?: number | null;
      status?: MeasurementItem["status"];
      overridden?: boolean;
    }) => updateItem({ data: { projectId: projectId!, ...input } }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeItem({ data: { projectId: projectId!, id } }),
    onSuccess: invalidate,
  });

  return {
    items,
    captures,
    confirmed,
    isLoading: query.isLoading,
    planState,
    planError,
    addFromText,
    uploadPlan,
    updateItem: confirmMutation,
    deleteItem: deleteMutation,
  };
}
