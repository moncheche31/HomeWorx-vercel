import { describe, expect, it } from "vitest";
import { actorDisplayName, buildOrgActivityFeed } from "../services/orgActivity";

const rows = [
  {
    id: "a",
    project_id: "p1",
    actor_user_id: "u1",
    activity_type: "created",
    entity_type: "note",
    summary: "Added note",
    created_at: "2026-01-02T10:00:00Z",
  },
  {
    id: "b",
    project_id: "p2",
    actor_user_id: "u2",
    activity_type: "updated",
    entity_type: "project",
    summary: null,
    created_at: "2026-01-05T10:00:00Z",
  },
  {
    id: "c",
    project_id: "p1",
    actor_user_id: "u1",
    activity_type: "uploaded",
    entity_type: "photo",
    summary: "Photo",
    created_at: "2026-01-03T10:00:00Z",
  },
];

const projects = new Map([
  ["p1", "Garage Conversion"],
  ["p2", "Kitchen Remodel"],
]);
const actors = new Map([
  ["u1", { display_name: "Sam Builder" }],
  ["u2", { first_name: "Ana", last_name: "Lopez" }],
]);

describe("buildOrgActivityFeed", () => {
  it("aggregates activity across multiple projects in the organization", () => {
    const feed = buildOrgActivityFeed(rows, projects, actors);
    expect(feed).toHaveLength(3);
    expect(new Set(feed.map((i) => i.projectId))).toEqual(new Set(["p1", "p2"]));
    expect(feed.find((i) => i.id === "b")?.projectName).toBe("Kitchen Remodel");
    expect(feed.find((i) => i.id === "b")?.actorName).toBe("Ana Lopez");
  });

  it("orders items by descending recency and caps to the limit", () => {
    const feed = buildOrgActivityFeed(rows, projects, actors, 2);
    expect(feed.map((i) => i.id)).toEqual(["b", "c"]);
    const times = feed.map((i) => new Date(i.createdAt).getTime());
    expect(times[0]).toBeGreaterThan(times[1]!);
  });

  it("falls back gracefully for unknown project or actor", () => {
    const feed = buildOrgActivityFeed(
      [{ id: "z", project_id: "px", created_at: "2026-01-06T00:00:00Z" }],
      projects,
      actors,
    );
    expect(feed[0]).toMatchObject({
      projectName: null,
      actorName: null,
      activityType: "updated",
      entityType: "project",
      summary: null,
    });
  });

  it("derives actor display names", () => {
    expect(actorDisplayName(null)).toBeNull();
    expect(actorDisplayName({ first_name: "Ana" })).toBe("Ana");
    expect(actorDisplayName({ display_name: "Sam" })).toBe("Sam");
  });
});
