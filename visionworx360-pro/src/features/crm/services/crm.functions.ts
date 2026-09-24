import { createServerFn } from "@tanstack/react-start";
import { projectSortOrder } from "./projectSort";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createClientSchema,
  updateClientSchema,
  idWithOrgSchema,
  listClientsSchema,
  createPropertySchema,
  updatePropertySchema,
  listPropertiesSchema,
  listPropertyRecordsSchema,
  crmFilterOptionsSchema,
  createProjectSchema,
  updateProjectSchema,
  listProjectsSchema,
  OPEN_PROJECT_EXCLUDED_STATUSES,
  deleteRecordSchema,
  deleteClientSchema,
} from "./schemas";
import { mapClient, mapProperty, mapProject } from "./mappers";
import { readBallparkSummary } from "@/features/estimating/services/ballparkSummary";
import type {
  ClientDTO,
  PropertyDTO,
  ProjectDTO,
  ProjectListItem,
  PropertyListItem,
  CrmFilterOptions,
  ProjectDeletionAudit,
  ClientDeletionAudit,
} from "./types";

/** Ids of clients that currently have at least one open (not completed/archived) project. */
async function openProjectClientIds(supabase: unknown, organizationId: string): Promise<string[]> {
  const sb = supabase as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          col: string,
          v: string,
        ) => {
          not: (
            col: string,
            op: string,
            v: string,
          ) => Promise<{ data: unknown; error: { message?: string } | null }>;
        };
      };
    };
  };
  const { data, error } = await sb
    .from("projects")
    .select("client_id")
    .eq("organization_id", organizationId)
    .not("status", "in", `(${OPEN_PROJECT_EXCLUDED_STATUSES.join(",")})`);
  if (error) throw new Error(error.message ?? "Project lookup failed");
  const rows = (data as { client_id: string }[] | null) ?? [];
  return Array.from(new Set(rows.map((r) => r.client_id)));
}

/** Ids of properties that currently have at least one active project. */
async function activeProjectPropertyIds(
  supabase: unknown,
  organizationId: string,
): Promise<string[]> {
  const sb = supabase as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          col: string,
          v: string,
        ) => {
          not: (
            col: string,
            op: string,
            v: string,
          ) => Promise<{ data: unknown; error: { message?: string } | null }>;
        };
      };
    };
  };
  const { data, error } = await sb
    .from("projects")
    .select("property_id")
    .eq("organization_id", organizationId)
    .not("status", "in", `(${OPEN_PROJECT_EXCLUDED_STATUSES.join(",")})`);
  if (error) throw new Error(error.message ?? "Project lookup failed");
  const rows = (data as { property_id: string }[] | null) ?? [];
  return Array.from(new Set(rows.map((r) => r.property_id)));
}


/* ------------------------------------------------------------------ */
/* Membership guard: verifies caller has an active user_roles row for  */
/* the activeOrganizationId that the workspace context supplied.       */
/* ------------------------------------------------------------------ */
async function requireOrgMembership(
  supabase: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          col: string,
          v: string,
        ) => {
          eq: (
            col: string,
            v: string,
          ) => { limit: (n: number) => Promise<{ data: unknown; error: unknown }> };
        };
      };
    };
  },
  userId: string,
  organizationId: string,
): Promise<void> {
  if (!organizationId)
    throw Object.assign(new Error("No active organization selected"), { code: "NO_ACTIVE_ORG" });
  const { data, error } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .limit(1);
  if (error) throw new Error((error as { message?: string }).message ?? "Membership check failed");
  const rows = data as unknown[] | null;
  if (!rows || rows.length === 0) {
    throw Object.assign(new Error("You are not a member of the selected organization"), {
      code: "NOT_A_MEMBER",
    });
  }
}

/* --------------------------- CLIENTS ------------------------------ */

export const listClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listClientsSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ items: ClientDTO[]; total: number }> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = context.supabase
      .from("clients")
      .select("*", { count: "exact" })
      .eq("organization_id", data.activeOrganizationId);
    if (data.status) q = q.eq("status", data.status);
    else if (!data.includeArchived) q = q.eq("status", "active");
    if (data.city) q = q.ilike("city", data.city);
    if (data.hasOpenProjects) {
      const ids = await openProjectClientIds(context.supabase, data.activeOrganizationId);
      if (data.hasOpenProjects === "yes") {
        if (ids.length === 0) return { items: [], total: 0 };
        q = q.in("id", ids);
      } else if (ids.length > 0) {
        q = q.not("id", "in", `(${ids.join(",")})`);
      }
    }
    if (data.q) {
      const like = `%${data.q}%`;
      q = q.or(
        [
          `first_name.ilike.${like}`,
          `last_name.ilike.${like}`,
          `company.ilike.${like}`,
          `email.ilike.${like}`,
          `phone.ilike.${like}`,
          `city.ilike.${like}`,
        ].join(","),
      );
    }
    const orderCol =
      data.sort === "alpha" || data.sort === "name_asc" || data.sort === "name_desc"
        ? "last_name"
        : data.sort === "city_asc"
          ? "city"
          : data.sort === "recent"
            ? "updated_at"
            : "created_at";
    const asc =
      data.sort === "oldest" ||
      data.sort === "alpha" ||
      data.sort === "name_asc" ||
      data.sort === "city_asc";
    q = q
      .order(orderCol, { ascending: asc, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return {
      items: (rows ?? []).map((r: Record<string, unknown>) => mapClient(r)),
      total: count ?? 0,
    };
  });

export const getClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idWithOrgSchema.parse(d))
  .handler(async ({ data, context }): Promise<ClientDTO | null> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    const { data: row, error } = await context.supabase
      .from("clients")
      .select("*")
      .eq("id", data.id)
      .eq("organization_id", data.activeOrganizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ? mapClient(row as Record<string, unknown>) : null;
  });

export const createClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createClientSchema.parse(d))
  .handler(async ({ data, context }): Promise<ClientDTO> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    const insert = {
      organization_id: data.activeOrganizationId,
      created_by: context.userId,
      first_name: data.firstName ?? null,
      last_name: data.lastName ?? null,
      company: data.company ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      secondary_phone: data.secondaryPhone ?? null,
      address_line1: data.addressLine1 ?? null,
      city: data.city ?? null,
      region: data.region ?? null,
      postal_code: data.postalCode ?? null,
      notes: data.notes ?? null,
      preferred_contact: data.preferredContact,
    };
    const { data: row, error } = await context.supabase
      .from("clients")
      .insert(insert as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapClient(row as Record<string, unknown>);
  });

export const updateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateClientSchema.parse(d))
  .handler(async ({ data, context }): Promise<ClientDTO> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    const patch = {
      first_name: data.firstName ?? null,
      last_name: data.lastName ?? null,
      company: data.company ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      secondary_phone: data.secondaryPhone ?? null,
      address_line1: data.addressLine1 ?? null,
      city: data.city ?? null,
      region: data.region ?? null,
      postal_code: data.postalCode ?? null,
      notes: data.notes ?? null,
      preferred_contact: data.preferredContact,
    };
    const { data: row, error } = await context.supabase
      .from("clients")
      .update(patch as never)
      .eq("id", data.id)
      .eq("organization_id", data.activeOrganizationId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapClient(row as Record<string, unknown>);
  });

export const archiveClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idWithOrgSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    const { error } = await context.supabase
      .from("clients")
      .update({ status: "archived" } as never)
      .eq("id", data.id)
      .eq("organization_id", data.activeOrganizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const restoreClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idWithOrgSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    const { error } = await context.supabase
      .from("clients")
      .update({ status: "active" } as never)
      .eq("id", data.id)
      .eq("organization_id", data.activeOrganizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------- PROPERTIES ---------------------------- */

async function assertClientInOrg(
  supabase: unknown,
  clientId: string,
  organizationId: string,
): Promise<void> {
  const sb = supabase as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          col: string,
          v: string,
        ) => {
          eq: (
            c: string,
            v: string,
          ) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
        };
      };
    };
  };
  const { data, error } = await sb
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error((error as { message?: string }).message ?? "Client lookup failed");
  if (!data)
    throw Object.assign(new Error("Client does not belong to the active organization"), {
      code: "CROSS_ORG",
    });
}

export const listProperties = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listPropertiesSchema.parse(d))
  .handler(async ({ data, context }): Promise<PropertyDTO[]> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    let q = context.supabase
      .from("properties")
      .select("*")
      .eq("organization_id", data.activeOrganizationId);
    if (data.clientId) q = q.eq("client_id", data.clientId);
    if (!data.includeArchived) q = q.is("archived_at", null);
    q = q.order("created_at", { ascending: false });
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: Record<string, unknown>) => mapProperty(r));
  });

/**
 * Paged, filterable, org-scoped property listing for the dedicated Properties page.
 * Filtering and sorting run in the database so pagination stays correct.
 */
export const listPropertyRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listPropertyRecordsSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ items: PropertyListItem[]; total: number }> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    const activeIds = await activeProjectPropertyIds(
      context.supabase,
      data.activeOrganizationId,
    );
    let q = context.supabase
      .from("properties")
      .select("*, client:clients(first_name,last_name,company)", { count: "exact" })
      .eq("organization_id", data.activeOrganizationId);
    if (data.clientId) q = q.eq("client_id", data.clientId);
    if (data.city) q = q.ilike("city", data.city);
    if (!data.includeArchived) q = q.is("archived_at", null);
    if (data.q) {
      const like = `%${data.q}%`;
      q = q.or(
        [
          `nickname.ilike.${like}`,
          `street.ilike.${like}`,
          `city.ilike.${like}`,
          `postal_code.ilike.${like}`,
        ].join(","),
      );
    }
    if (data.hasActiveProjects === "yes") {
      if (activeIds.length === 0) return { items: [], total: 0 };
      q = q.in("id", activeIds);
    } else if (data.hasActiveProjects === "no" && activeIds.length > 0) {
      q = q.not("id", "in", `(${activeIds.join(",")})`);
    }
    const orderCol =
      data.sort === "address_asc"
        ? "street"
        : data.sort === "city_asc"
          ? "city"
          : data.sort === "recent"
            ? "updated_at"
            : "created_at";
    const asc = data.sort === "address_asc" || data.sort === "city_asc";
    q = q
      .order(orderCol, { ascending: asc, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to);
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    const activeSet = new Set(activeIds);
    const items = ((rows as Record<string, unknown>[]) ?? []).map((rec) => {
      const c = rec.client as { first_name?: string; last_name?: string; company?: string } | null;
      const clientName = c
        ? c.company || [c.first_name, c.last_name].filter(Boolean).join(" ") || null
        : null;
      const mapped = mapProperty(rec);
      const addressLabel =
        [mapped.street, mapped.city, mapped.region].filter(Boolean).join(", ") ||
        mapped.nickname ||
        "—";
      return {
        ...mapped,
        clientName,
        addressLabel,
        activeProjectCount: activeSet.has(mapped.id) ? 1 : 0,
      };
    });
    return { items, total: count ?? 0 };
  });

/** Distinct city values used to populate City/Town filter menus. */
export const listCrmFilterOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => crmFilterOptionsSchema.parse(d))
  .handler(async ({ data, context }): Promise<CrmFilterOptions> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    const [clientRes, propertyRes] = await Promise.all([
      context.supabase
        .from("clients")
        .select("city")
        .eq("organization_id", data.activeOrganizationId)
        .not("city", "is", null),
      context.supabase
        .from("properties")
        .select("city")
        .eq("organization_id", data.activeOrganizationId)
        .not("city", "is", null),
    ]);
    if (clientRes.error) throw new Error(clientRes.error.message);
    if (propertyRes.error) throw new Error(propertyRes.error.message);
    const uniqueSorted = (rows: unknown): string[] =>
      Array.from(
        new Set(
          (((rows as { city: string | null }[] | null) ?? [])
            .map((r) => (r.city ?? "").trim())
            .filter(Boolean)),
        ),
      ).sort((a, b) => a.localeCompare(b));
    return {
      clientCities: uniqueSorted(clientRes.data),
      propertyCities: uniqueSorted(propertyRes.data),
    };
  });



export const getProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idWithOrgSchema.parse(d))
  .handler(async ({ data, context }): Promise<PropertyDTO | null> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    const { data: row, error } = await context.supabase
      .from("properties")
      .select("*")
      .eq("id", data.id)
      .eq("organization_id", data.activeOrganizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ? mapProperty(row as Record<string, unknown>) : null;
  });

export const createProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createPropertySchema.parse(d))
  .handler(async ({ data, context }): Promise<PropertyDTO> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    await assertClientInOrg(context.supabase, data.clientId, data.activeOrganizationId);
    const insert = {
      organization_id: data.activeOrganizationId,
      client_id: data.clientId,
      created_by: context.userId,
      nickname: data.nickname ?? null,
      street: data.street ?? null,
      city: data.city ?? null,
      region: data.region ?? null,
      postal_code: data.postalCode ?? null,
      county: data.county ?? null,
      year_built: data.yearBuilt ?? null,
      square_footage: data.squareFootage ?? null,
      bedrooms: data.bedrooms ?? null,
      bathrooms: data.bathrooms ?? null,
      stories: data.stories ?? null,
      construction_type: data.constructionType ?? null,
      occupied: data.occupied ?? null,
      notes: data.notes ?? null,
    };
    const { data: row, error } = await context.supabase
      .from("properties")
      .insert(insert as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapProperty(row as Record<string, unknown>);
  });

export const updateProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updatePropertySchema.parse(d))
  .handler(async ({ data, context }): Promise<PropertyDTO> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    await assertClientInOrg(context.supabase, data.clientId, data.activeOrganizationId);
    const patch = {
      client_id: data.clientId,
      nickname: data.nickname ?? null,
      street: data.street ?? null,
      city: data.city ?? null,
      region: data.region ?? null,
      postal_code: data.postalCode ?? null,
      county: data.county ?? null,
      year_built: data.yearBuilt ?? null,
      square_footage: data.squareFootage ?? null,
      bedrooms: data.bedrooms ?? null,
      bathrooms: data.bathrooms ?? null,
      stories: data.stories ?? null,
      construction_type: data.constructionType ?? null,
      occupied: data.occupied ?? null,
      notes: data.notes ?? null,
    };
    const { data: row, error } = await context.supabase
      .from("properties")
      .update(patch as never)
      .eq("id", data.id)
      .eq("organization_id", data.activeOrganizationId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapProperty(row as Record<string, unknown>);
  });

export const archiveProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idWithOrgSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    const { error } = await context.supabase
      .from("properties")
      .update({ archived_at: new Date().toISOString() } as never)
      .eq("id", data.id)
      .eq("organization_id", data.activeOrganizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const restoreProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idWithOrgSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    const { error } = await context.supabase
      .from("properties")
      .update({ archived_at: null } as never)
      .eq("id", data.id)
      .eq("organization_id", data.activeOrganizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* --------------------------- PROJECTS ----------------------------- */

async function assertProjectParents(
  supabase: unknown,
  clientId: string,
  propertyId: string,
  organizationId: string,
): Promise<void> {
  const sb = supabase as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          col: string,
          v: string,
        ) => {
          eq: (
            c: string,
            v: string,
          ) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
        };
      };
    };
  };
  const { data: property, error } = await sb
    .from("properties")
    .select("id, client_id, organization_id")
    .eq("id", propertyId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error((error as { message?: string }).message ?? "Property lookup failed");
  if (!property)
    throw Object.assign(new Error("Property does not belong to the active organization"), {
      code: "CROSS_ORG",
    });
  const p = property as { client_id: string };
  if (p.client_id !== clientId) {
    throw Object.assign(new Error("Property does not belong to the selected client"), {
      code: "PARENT_MISMATCH",
    });
  }
  await assertClientInOrg(supabase, clientId, organizationId);
}

export const listProjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listProjectsSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ items: ProjectListItem[]; total: number }> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = context.supabase
      .from("projects")
      .select(
        "*, client:clients(first_name,last_name,company), property:properties!inner(nickname,street,city), cover_photo:project_photos!projects_cover_photo_id_fkey(id,storage_path,alt_text,caption,photo_type,archived_at)",
        { count: "exact" },
      )
      .eq("organization_id", data.activeOrganizationId);
    if (!data.includeArchived) q = q.neq("status", "archived");
    if (data.status) q = q.eq("status", data.status);
    if (data.projectTypeKey) q = q.eq("project_type_key", data.projectTypeKey);
    else if (data.projectCategoryKey) q = q.eq("project_category_key", data.projectCategoryKey);
    else if (data.projectType) q = q.eq("project_type", data.projectType);
    if (data.priority) q = q.eq("priority", data.priority);
    if (data.clientId) q = q.eq("client_id", data.clientId);
    if (data.city) q = q.ilike("property.city", data.city);
    if (data.budgetMin != null) q = q.gte("budget", data.budgetMin);
    if (data.budgetMax != null) q = q.lte("budget", data.budgetMax);
    if (data.updatedWithinDays) {
      const since = new Date(Date.now() - data.updatedWithinDays * 86_400_000).toISOString();
      q = q.gte("updated_at", since);
    }
    if (data.q) {
      const like = `%${data.q}%`;
      q = q.or(
        [`name.ilike.${like}`, `description.ilike.${like}`, `project_type.ilike.${like}`].join(","),
      );
    }
    const { column: orderCol, ascending: asc } = projectSortOrder(data.sort);
    q = q
      .order(orderCol, { ascending: asc, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    const rawRows = (rows ?? []) as Record<string, unknown>[];

    // Batch fallback: fetch fallback photos for projects without a valid cover
    const needFallbackIds: string[] = [];
    for (const rec of rawRows) {
      const cp = rec.cover_photo as { id?: string; archived_at?: string | null } | null;
      const hasValidCover = !!cp && !cp.archived_at;
      if (!hasValidCover) needFallbackIds.push(rec.id as string);
    }
    const fallbackByProject = new Map<
      string,
      { storage_path: string; alt_text: string | null; caption: string | null; photo_type: string }
    >();
    if (needFallbackIds.length) {
      const { data: photoRows } = await context.supabase
        .from("project_photos")
        .select("project_id,storage_path,alt_text,caption,photo_type,created_at,archived_at")
        .in("project_id", needFallbackIds)
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      const PRIORITY: Record<string, number> = {
        rendering: 0,
        design: 1,
        existing: 2,
        progress: 3,
      };
      const grouped = new Map<string, Record<string, unknown>[]>();
      for (const row of (photoRows as Record<string, unknown>[]) ?? []) {
        const pid = row.project_id as string;
        const arr = grouped.get(pid) ?? [];
        arr.push(row);
        grouped.set(pid, arr);
      }
      for (const [pid, arr] of grouped.entries()) {
        arr.sort((a, b) => {
          const pa = PRIORITY[a.photo_type as string] ?? 99;
          const pb = PRIORITY[b.photo_type as string] ?? 99;
          if (pa !== pb) return pa - pb;
          return (b.created_at as string).localeCompare(a.created_at as string);
        });
        const pick = arr[0];
        fallbackByProject.set(pid, {
          storage_path: pick.storage_path as string,
          alt_text: (pick.alt_text as string) ?? null,
          caption: (pick.caption as string) ?? null,
          photo_type: pick.photo_type as string,
        });
      }
    }

    /*
     * Display-only band lookup. Mirrors how the Estimate tab picks its active
     * document (newest non-archived version) and reads the saved snapshot
     * through the single ballpark reader — no pricing is computed here.
     */
    const bandByProject = new Map<
      string,
      { low: number; high: number; currency: string }
    >();
    if (rawRows.length) {
      const { data: estimateRows } = await context.supabase
        .from("estimates")
        .select("project_id,version,range_snapshot")
        .eq("organization_id", data.activeOrganizationId)
        .in("project_id", rawRows.map((rec) => rec.id as string))
        .is("archived_at", null)
        .order("version", { ascending: false });
      const seenProjects = new Set<string>();
      for (const row of ((estimateRows as Record<string, unknown>[]) ?? [])) {
        const pid = row.project_id as string;
        /* Only the current document counts; older versions never stand in. */
        if (seenProjects.has(pid)) continue;
        seenProjects.add(pid);
        const summary = readBallparkSummary(row.range_snapshot);
        if (!summary) continue;
        bandByProject.set(pid, {
          low: summary.low,
          high: summary.high,
          currency: summary.currency,
        });
      }
    }

    const items: ProjectListItem[] = rawRows.map((rec) => {
      const c = rec.client as { first_name?: string; last_name?: string; company?: string } | null;
      const p = rec.property as { nickname?: string; street?: string; city?: string } | null;
      const clientName = c
        ? c.company || [c.first_name, c.last_name].filter(Boolean).join(" ") || null
        : null;
      const propertyLabel = p
        ? p.nickname || [p.street, p.city].filter(Boolean).join(", ") || null
        : null;
      const cover = rec.cover_photo as {
        id?: string;
        storage_path?: string;
        alt_text?: string | null;
        caption?: string | null;
        photo_type?: string;
        archived_at?: string | null;
      } | null;
      let coverStoragePath: string | null = null;
      let coverAlt: string | null = null;
      let coverPhotoType: string | null = null;
      if (cover && !cover.archived_at && cover.storage_path) {
        coverStoragePath = cover.storage_path;
        coverAlt = cover.alt_text ?? cover.caption ?? null;
        coverPhotoType = cover.photo_type ?? null;
      } else {
        const fb = fallbackByProject.get(rec.id as string);
        if (fb) {
          coverStoragePath = fb.storage_path;
          coverAlt = fb.alt_text ?? fb.caption ?? null;
          coverPhotoType = fb.photo_type;
        }
      }
      const band = bandByProject.get(rec.id as string) ?? null;
      return {
        ...mapProject(rec),
        clientName,
        propertyLabel,
        coverStoragePath,
        coverAlt,
        coverPhotoType,
        ballparkLow: band?.low ?? null,
        ballparkHigh: band?.high ?? null,
        ballparkCurrency: band?.currency ?? null,
      };
    });
    return { items, total: count ?? 0 };
  });

export const getProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idWithOrgSchema.parse(d))
  .handler(async ({ data, context }): Promise<ProjectListItem | null> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    const { data: row, error } = await context.supabase
      .from("projects")
      .select(
        "*, client:clients(first_name,last_name,company), property:properties(nickname,street,city), cover_photo:project_photos!projects_cover_photo_id_fkey(id,storage_path,alt_text,caption,photo_type,archived_at)",
      )
      .eq("id", data.id)
      .eq("organization_id", data.activeOrganizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const rec = row as Record<string, unknown>;
    const c = rec.client as { first_name?: string; last_name?: string; company?: string } | null;
    const p = rec.property as { nickname?: string; street?: string; city?: string } | null;
    const clientName = c
      ? c.company || [c.first_name, c.last_name].filter(Boolean).join(" ") || null
      : null;
    const propertyLabel = p
      ? p.nickname || [p.street, p.city].filter(Boolean).join(", ") || null
      : null;
    const cover = rec.cover_photo as {
      id?: string;
      storage_path?: string;
      alt_text?: string | null;
      caption?: string | null;
      photo_type?: string;
      archived_at?: string | null;
    } | null;
    let coverStoragePath: string | null = null;
    let coverAlt: string | null = null;
    let coverPhotoType: string | null = null;
    if (cover && !cover.archived_at && cover.storage_path) {
      coverStoragePath = cover.storage_path;
      coverAlt = cover.alt_text ?? cover.caption ?? null;
      coverPhotoType = cover.photo_type ?? null;
    } else {
      const PRIORITY_TYPES = ["rendering", "design", "existing", "progress"];
      const { data: fbRows } = await context.supabase
        .from("project_photos")
        .select("storage_path,alt_text,caption,photo_type,created_at")
        .eq("project_id", data.id)
        .eq("organization_id", data.activeOrganizationId)
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      const list = ((fbRows as Record<string, unknown>[]) ?? []).slice();
      list.sort((a, b) => {
        const pa = PRIORITY_TYPES.indexOf(a.photo_type as string);
        const pb = PRIORITY_TYPES.indexOf(b.photo_type as string);
        const na = pa === -1 ? 99 : pa;
        const nb = pb === -1 ? 99 : pb;
        if (na !== nb) return na - nb;
        return (b.created_at as string).localeCompare(a.created_at as string);
      });
      const pick = list[0];
      if (pick) {
        coverStoragePath = pick.storage_path as string;
        coverAlt = ((pick.alt_text as string) ?? (pick.caption as string)) ?? null;
        coverPhotoType = pick.photo_type as string;
      }
    }
    return {
      ...mapProject(rec),
      clientName,
      propertyLabel,
      coverStoragePath,
      coverAlt,
      coverPhotoType,
    };
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createProjectSchema.parse(d))
  .handler(async ({ data, context }): Promise<ProjectDTO> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    await assertProjectParents(
      context.supabase,
      data.clientId,
      data.propertyId,
      data.activeOrganizationId,
    );
    const insert = {
      organization_id: data.activeOrganizationId,
      client_id: data.clientId,
      property_id: data.propertyId,
      created_by: context.userId,
      name: data.name,
      project_type: data.projectType ?? null,
      project_category_key: data.projectCategoryKey ?? null,
      project_type_key: data.projectTypeKey ?? null,
      project_type_custom: data.projectTypeCustom ?? null,
      project_subtype_key: data.projectSubtypeKey ?? null,
      project_subtype_custom: data.projectSubtypeCustom ?? null,
      project_scale_key: data.projectScaleKey ?? null,
      status: data.status,
      priority: data.priority,
      budget: data.budget ?? null,
      target_gross_margin: data.targetGrossMargin ?? null,
      target_completion: data.targetCompletion ?? null,
      description: data.description ?? null,
      internal_notes: data.internalNotes ?? null,
    };
    const { data: row, error } = await context.supabase
      .from("projects")
      .insert(insert as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapProject(row as Record<string, unknown>);
  });

export const updateProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateProjectSchema.parse(d))
  .handler(async ({ data, context }): Promise<ProjectDTO> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    await assertProjectParents(
      context.supabase,
      data.clientId,
      data.propertyId,
      data.activeOrganizationId,
    );
    const patch = {
      client_id: data.clientId,
      property_id: data.propertyId,
      name: data.name,
      project_type: data.projectType ?? null,
      project_category_key: data.projectCategoryKey ?? null,
      project_type_key: data.projectTypeKey ?? null,
      project_type_custom: data.projectTypeCustom ?? null,
      project_subtype_key: data.projectSubtypeKey ?? null,
      project_subtype_custom: data.projectSubtypeCustom ?? null,
      project_scale_key: data.projectScaleKey ?? null,
      status: data.status,
      priority: data.priority,
      budget: data.budget ?? null,
      target_gross_margin: data.targetGrossMargin ?? null,
      target_completion: data.targetCompletion ?? null,
      description: data.description ?? null,
      internal_notes: data.internalNotes ?? null,
    };
    const { data: row, error } = await context.supabase
      .from("projects")
      .update(patch as never)
      .eq("id", data.id)
      .eq("organization_id", data.activeOrganizationId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapProject(row as Record<string, unknown>);
  });

export const archiveProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idWithOrgSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    const { error } = await context.supabase
      .from("projects")
      .update({ status: "archived" } as never)
      .eq("id", data.id)
      .eq("organization_id", data.activeOrganizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const restoreProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idWithOrgSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    const { error } = await context.supabase
      .from("projects")
      .update({ status: "lead" } as never)
      .eq("id", data.id)
      .eq("organization_id", data.activeOrganizationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ----------------------- PERMANENT DELETE ------------------------- */
/*
  Permanent delete is intentionally server-side and transactional: the RPCs
  re-check org membership plus owner/administrator role, refuse to destroy
  records that must be retained (accepted/approved estimates, accepted client
  proposals), and rely on the project's own ON DELETE CASCADE graph so shared
  company pricing/catalog/configuration data is never touched.
*/

/** Maps a Postgres RPC error onto a stable, translatable error code. */
export function mapDeleteError(message: string): {
  code: string;
  detail: string | null;
} {
  const raw = message ?? "";
  if (raw.includes("NOT_AUTHORIZED_TO_DELETE")) return { code: "NOT_AUTHORIZED_TO_DELETE", detail: null };
  if (raw.includes("NOT_ORG_MEMBER")) return { code: "NOT_ORG_MEMBER", detail: null };
  if (raw.includes("PROJECT_NOT_FOUND")) return { code: "NOT_FOUND", detail: null };
  if (raw.includes("CLIENT_NOT_FOUND")) return { code: "NOT_FOUND", detail: null };
  if (raw.includes("CLIENT_HAS_DEPENDENTS")) {
    return { code: "CLIENT_HAS_DEPENDENTS", detail: raw.split("CLIENT_HAS_DEPENDENTS:")[1] ?? null };
  }
  if (raw.includes("DELETE_BLOCKED")) {
    return { code: "DELETE_BLOCKED", detail: raw.split("DELETE_BLOCKED:")[1] ?? null };
  }
  return { code: "DELETE_FAILED", detail: raw || null };
}

function throwMapped(message: string): never {
  const mapped = mapDeleteError(message);
  throw Object.assign(new Error(mapped.code), { code: mapped.code, detail: mapped.detail });
}

export const auditProjectDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idWithOrgSchema.parse(d))
  .handler(async ({ data, context }): Promise<ProjectDeletionAudit> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    const { data: row, error } = await context.supabase.rpc("audit_project_deletion" as never, {
      p_project_id: data.id,
    } as never);
    if (error) throwMapped(error.message);
    return row as unknown as ProjectDeletionAudit;
  });

export const auditClientDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idWithOrgSchema.parse(d))
  .handler(async ({ data, context }): Promise<ClientDeletionAudit> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    const { data: row, error } = await context.supabase.rpc("audit_client_deletion" as never, {
      p_client_id: data.id,
    } as never);
    if (error) throwMapped(error.message);
    return row as unknown as ClientDeletionAudit;
  });

export const deleteProjectPermanently = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteRecordSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    const { error } = await context.supabase.rpc("delete_project_permanently" as never, {
      p_project_id: data.id,
    } as never);
    if (error) throwMapped(error.message);
    return { ok: true };
  });

export const deleteClientPermanently = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteClientSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await requireOrgMembership(
      context.supabase as never,
      context.userId,
      data.activeOrganizationId,
    );
    const { error } = await context.supabase.rpc("delete_client_permanently" as never, {
      p_client_id: data.id,
      p_delete_dependents: data.deleteDependents,
    } as never);
    if (error) throwMapped(error.message);
    return { ok: true };
  });
