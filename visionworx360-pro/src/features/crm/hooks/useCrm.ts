import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useWorkspace } from "@/features/workspace/providers/WorkspaceProvider";
import { workspaceDiagnostic, workspaceDiagnosticError } from "@/lib/diagnostics/workspaceDiagnostics";
import {
  listClients,
  getClient,
  createClient,
  updateClient,
  archiveClient,
  restoreClient,
  listProperties,
  listPropertyRecords,
  listCrmFilterOptions,
  getProperty,
  createProperty,
  updateProperty,
  archiveProperty,
  restoreProperty,
  listProjects,
  getProject,
  createProject,
  updateProject,
  archiveProject,
  restoreProject,
  auditProjectDeletion,
  auditClientDeletion,
  deleteProjectPermanently,
  deleteClientPermanently,
} from "../services/crm.functions";
import type {
  ListClientsInput,
  ListProjectsInput,
  ListPropertyRecordsInput,
  ClientInput,
  PropertyInput,
  ProjectInput,
} from "../services/schemas";
import type { z } from "zod";
import type {
  updateClientSchema,
  updatePropertySchema,
  updateProjectSchema,
  idWithOrgSchema,
  deleteRecordSchema,
  deleteClientSchema,
} from "../services/schemas";

type UpdateClientInput = z.infer<typeof updateClientSchema>;
type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
type IdInput = z.infer<typeof idWithOrgSchema>;
type DeleteRecordInput = z.infer<typeof deleteRecordSchema>;
type DeleteClientInput = z.infer<typeof deleteClientSchema>;

export function useActiveOrgId(): string | null {
  const { organization } = useWorkspace();
  return organization?.id ?? null;
}

/* --------------------- CLIENTS --------------------- */

export function useClientsQuery(
  filters: Omit<ListClientsInput, "activeOrganizationId"> = {
    q: "",
    includeArchived: false,
    page: 1,
    pageSize: 20,
    sort: "newest",
  },
) {
  const orgId = useActiveOrgId();
  const fn = useServerFn(listClients);
  return useQuery({
    queryKey: ["clients", orgId, filters],
    enabled: !!orgId,
    queryFn: () => fn({ data: { ...filters, activeOrganizationId: orgId! } }),
  });
}

export function useClientQuery(id: string | undefined) {
  const orgId = useActiveOrgId();
  const fn = useServerFn(getClient);
  return useQuery({
    queryKey: ["client", orgId, id],
    enabled: !!orgId && !!id,
    queryFn: () => fn({ data: { activeOrganizationId: orgId!, id: id! } }),
  });
}

export function useClientMutations() {
  const orgId = useActiveOrgId();
  const qc = useQueryClient();
  const create = useServerFn(createClient);
  const update = useServerFn(updateClient);
  const archive = useServerFn(archiveClient);
  const restore = useServerFn(restoreClient);
  const remove = useServerFn(deleteClientPermanently);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["clients", orgId] });
    qc.invalidateQueries({ queryKey: ["crm-filter-options", orgId] });
    qc.invalidateQueries({ queryKey: ["client", orgId] });
  };
  return {
    orgId,
    create: useMutation({
      mutationFn: (d: ClientInput) => create({ data: d }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (d: UpdateClientInput) => update({ data: d }),
      onSuccess: invalidate,
    }),
    archive: useMutation({
      mutationFn: (d: IdInput) => archive({ data: d }),
      onSuccess: invalidate,
    }),
    restore: useMutation({
      mutationFn: (d: IdInput) => restore({ data: d }),
      onSuccess: invalidate,
    }),
    /* Permanent, irreversible delete — gated by a typed confirmation in the UI. */
    deletePermanently: useMutation({
      mutationFn: (d: DeleteClientInput) => remove({ data: d }),
      onSuccess: () => {
        invalidate();
        qc.invalidateQueries({ queryKey: ["projects"] });
        qc.invalidateQueries({ queryKey: ["properties", orgId] });
        qc.invalidateQueries({ queryKey: ["property-records", orgId] });
      },
    }),
  };
}

/** On-demand dependency audits used by the permanent-delete dialogs. */
export function useProjectDeletionAudit() {
  const orgId = useActiveOrgId();
  const fn = useServerFn(auditProjectDeletion);
  return useMutation({
    mutationFn: (id: string) => fn({ data: { id, activeOrganizationId: orgId! } }),
  });
}

export function useClientDeletionAudit() {
  const orgId = useActiveOrgId();
  const fn = useServerFn(auditClientDeletion);
  return useMutation({
    mutationFn: (id: string) => fn({ data: { id, activeOrganizationId: orgId! } }),
  });
}

/* -------------------- PROPERTIES ------------------- */

export function usePropertiesQuery(clientId?: string, includeArchived = false) {
  const orgId = useActiveOrgId();
  const fn = useServerFn(listProperties);
  return useQuery({
    queryKey: ["properties", orgId, clientId ?? "all", includeArchived],
    enabled: !!orgId,
    queryFn: () => fn({ data: { activeOrganizationId: orgId!, clientId, includeArchived } }),
  });
}

export function usePropertyRecordsQuery(
  filters: Omit<ListPropertyRecordsInput, "activeOrganizationId"> = {
    q: "",
    includeArchived: false,
    page: 1,
    pageSize: 20,
    sort: "newest",
  },
) {
  const orgId = useActiveOrgId();
  const fn = useServerFn(listPropertyRecords);
  return useQuery({
    queryKey: ["property-records", orgId, filters],
    enabled: !!orgId,
    queryFn: () => fn({ data: { ...filters, activeOrganizationId: orgId! } }),
  });
}

export function useCrmFilterOptionsQuery() {
  const orgId = useActiveOrgId();
  const fn = useServerFn(listCrmFilterOptions);
  return useQuery({
    queryKey: ["crm-filter-options", orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: () => fn({ data: { activeOrganizationId: orgId! } }),
  });
}

export function usePropertyQuery(id: string | undefined) {
  const orgId = useActiveOrgId();
  const fn = useServerFn(getProperty);
  return useQuery({
    queryKey: ["property", orgId, id],
    enabled: !!orgId && !!id,
    queryFn: () => fn({ data: { activeOrganizationId: orgId!, id: id! } }),
  });
}

export function usePropertyMutations() {
  const orgId = useActiveOrgId();
  const qc = useQueryClient();
  const create = useServerFn(createProperty);
  const update = useServerFn(updateProperty);
  const archive = useServerFn(archiveProperty);
  const restore = useServerFn(restoreProperty);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["properties", orgId] });
    qc.invalidateQueries({ queryKey: ["property-records", orgId] });
    qc.invalidateQueries({ queryKey: ["crm-filter-options", orgId] });
    qc.invalidateQueries({ queryKey: ["property", orgId] });
  };
  return {
    orgId,
    create: useMutation({
      mutationFn: (d: PropertyInput) => create({ data: d }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (d: UpdatePropertyInput) => update({ data: d }),
      onSuccess: invalidate,
    }),
    archive: useMutation({
      mutationFn: (d: IdInput) => archive({ data: d }),
      onSuccess: invalidate,
    }),
    restore: useMutation({
      mutationFn: (d: IdInput) => restore({ data: d }),
      onSuccess: invalidate,
    }),
  };
}

/* --------------------- PROJECTS -------------------- */

export function useProjectsQuery(
  filters: Omit<ListProjectsInput, "activeOrganizationId"> = {
    q: "",
    includeArchived: false,
    page: 1,
    pageSize: 20,
    sort: "recent",
  },
) {
  const { organization, organizationStatus } = useWorkspace();
  const orgId = organizationStatus === "ready" ? organization?.id ?? null : null;
  const fn = useServerFn(listProjects);
  const enabled = organizationStatus === "ready" && Boolean(orgId);
  workspaceDiagnostic("projects.query", {
    lifecycleStage: "projects-query",
    organizationIdPresent: Boolean(orgId),
    workspaceState: organizationStatus,
    queryEnabledReason: enabled ? "verified-workspace" : `workspace-${organizationStatus}`,
  });
  return useQuery({
    queryKey: ["projects", orgId ?? "none", filters],
    enabled,
    retry: (failureCount, error) => {
      const code = error instanceof Error ? error.message.toLowerCase() : "";
      const transient = code.includes("unauthorized") || code.includes("network") || code.includes("fetch");
      return transient && failureCount < 2;
    },
    queryFn: async () => {
      if (!orgId) throw new Error("Workspace organization unavailable");
      workspaceDiagnostic("projects.lookup:start", {
        lifecycleStage: "project-retrieval",
        organizationIdPresent: true,
        workspaceState: organizationStatus,
      });
      try {
        const result = await fn({ data: { ...filters, activeOrganizationId: orgId } });
        workspaceDiagnostic("projects.lookup:success", {
          lifecycleStage: "project-retrieval",
          organizationIdPresent: true,
          workspaceState: organizationStatus,
          resultCount: result.items.length,
        });
        return result;
      } catch (error) {
        workspaceDiagnosticError("projects.lookup:error", error, {
          lifecycleStage: "project-retrieval",
          organizationIdPresent: true,
          workspaceState: organizationStatus,
        });
        throw error;
      }
    },
  });
}

export function useProjectQuery(id: string | undefined) {
  const orgId = useActiveOrgId();
  const fn = useServerFn(getProject);
  return useQuery({
    queryKey: ["project", orgId, id],
    enabled: !!orgId && !!id,
    queryFn: () => fn({ data: { activeOrganizationId: orgId!, id: id! } }),
  });
}

export function useProjectMutations() {
  const orgId = useActiveOrgId();
  const qc = useQueryClient();
  const create = useServerFn(createProject);
  const update = useServerFn(updateProject);
  const archive = useServerFn(archiveProject);
  const restore = useServerFn(restoreProject);
  const remove = useServerFn(deleteProjectPermanently);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["project", orgId] });
  };
  return {
    orgId,
    create: useMutation({
      mutationFn: (d: ProjectInput) => create({ data: d }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (d: UpdateProjectInput) => update({ data: d }),
      onSuccess: invalidate,
    }),
    archive: useMutation({
      mutationFn: (d: IdInput) => archive({ data: d }),
      onSuccess: invalidate,
    }),
    restore: useMutation({
      mutationFn: (d: IdInput) => restore({ data: d }),
      onSuccess: invalidate,
    }),
    /* Permanent, irreversible delete — gated by a typed confirmation in the UI. */
    deletePermanently: useMutation({
      mutationFn: (d: DeleteRecordInput) => remove({ data: d }),
      onSuccess: invalidate,
    }),
  };
}
