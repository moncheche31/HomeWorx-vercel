/**
 * Pure helpers for the organization-wide recent activity feed.
 * Presentation/aggregation only — no data is created here.
 */

export interface OrgActivityItem {
  id: string;
  projectId: string;
  projectName: string | null;
  actorName: string | null;
  activityType: string;
  entityType: string;
  summary: string | null;
  createdAt: string;
}

type Row = Record<string, unknown>;

export interface ActorRecord {
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
}

export function actorDisplayName(actor: ActorRecord | null | undefined): string | null {
  if (!actor) return null;
  const full = [actor.first_name, actor.last_name].filter(Boolean).join(" ").trim();
  return actor.display_name?.trim() || full || null;
}

/**
 * Maps raw `project_activity` rows into feed items, newest first, capped at `limit`.
 * Rows from any project in the organization may be passed in.
 */
export function buildOrgActivityFeed(
  rows: Row[],
  projectNames: Map<string, string>,
  actors: Map<string, ActorRecord>,
  limit = 15,
): OrgActivityItem[] {
  return rows
    .map((r) => ({
      id: String(r.id),
      projectId: String(r.project_id),
      projectName: projectNames.get(String(r.project_id)) ?? null,
      actorName: actorDisplayName(actors.get(String(r.actor_user_id ?? ""))),
      activityType: String(r.activity_type ?? "updated"),
      entityType: String(r.entity_type ?? "project"),
      summary: r.summary == null ? null : String(r.summary),
      createdAt: String(r.created_at),
    }))
    .sort((a, b) => {
      const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    })
    .slice(0, limit);
}
