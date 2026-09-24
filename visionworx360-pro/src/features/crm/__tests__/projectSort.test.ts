import { describe, it, expect } from "vitest";
import {
  DEFAULT_PROJECT_SORT,
  PROJECT_ACTIVITY_COLUMN,
  projectSortOrder,
  sortProjectsInMemory,
} from "../services/projectSort";
import { listProjectsSchema } from "../services/schemas";

const base = { updatedAt: "2026-01-01T00:00:00Z" };

const projects = [
  {
    ...base,
    name: "Alpha Remodel",
    budget: 50_000,
    createdAt: "2026-08-01T00:00:00Z",
    lastActivityAt: "2026-08-01T00:00:00Z",
  },
  {
    ...base,
    name: "Garage Conversion",
    budget: 38_000,
    createdAt: "2026-01-05T00:00:00Z",
    lastActivityAt: "2026-08-07T12:00:00Z",
  },
  {
    ...base,
    name: "Bathroom Refresh",
    budget: 12_000,
    createdAt: "2026-05-05T00:00:00Z",
    lastActivityAt: "2026-05-06T00:00:00Z",
  },
];

describe("project sorting", () => {
  it("defaults to recently worked on", () => {
    expect(DEFAULT_PROJECT_SORT).toBe("recent");
    expect(listProjectsSchema.shape.sort.parse(undefined)).toBe("recent");
  });

  it("orders 'recent' by the project activity column, descending", () => {
    expect(projectSortOrder("recent")).toEqual({
      column: PROJECT_ACTIVITY_COLUMN,
      ascending: false,
    });
    expect(PROJECT_ACTIVITY_COLUMN).toBe("last_activity_at");
  });

  it("sorts a worked-on project above a newer, untouched project", () => {
    const sorted = sortProjectsInMemory(projects, "recent");
    expect(sorted.map((p) => p.name)).toEqual([
      "Garage Conversion",
      "Alpha Remodel",
      "Bathroom Refresh",
    ]);
  });

  it("keeps 'newest' on creation time", () => {
    expect(projectSortOrder("newest")).toEqual({ column: "created_at", ascending: false });
    expect(sortProjectsInMemory(projects, "newest")[0].name).toBe("Alpha Remodel");
  });

  it("supports explicit alternate sorts", () => {
    expect(projectSortOrder("oldest")).toEqual({ column: "created_at", ascending: true });
    expect(projectSortOrder("name_asc")).toEqual({ column: "name", ascending: true });
    expect(projectSortOrder("budget_asc")).toEqual({ column: "budget", ascending: true });
    expect(projectSortOrder("budget_desc")).toEqual({ column: "budget", ascending: false });
    expect(projectSortOrder("city_asc")).toEqual({ column: "property(city)", ascending: true });
    expect(projectSortOrder("city_desc")).toEqual({ column: "property(city)", ascending: false });
    expect(sortProjectsInMemory(projects, "budget_desc")[0].name).toBe("Alpha Remodel");
    expect(sortProjectsInMemory(projects, "name_asc")[0].name).toBe("Alpha Remodel");
  });

  it("falls back to updated_at when activity is unknown", () => {
    const sorted = sortProjectsInMemory(
      [
        { name: "A", createdAt: "2026-01-01", updatedAt: "2026-02-01T00:00:00Z" },
        { name: "B", createdAt: "2026-01-01", updatedAt: "2026-06-01T00:00:00Z" },
      ],
      "recent",
    );
    expect(sorted[0].name).toBe("B");
  });

  it("does not change filter parsing", () => {
    const parsed = listProjectsSchema.parse({
      activeOrganizationId: "11111111-1111-4111-8111-111111111111",
      status: "lead",
      city: "Austin",
      budgetMin: 100,
      budgetMax: 900,
    });
    expect(parsed.status).toBe("lead");
    expect(parsed.city).toBe("Austin");
    expect(parsed.budgetMin).toBe(100);
    expect(parsed.budgetMax).toBe(900);
    expect(parsed.sort).toBe("recent");
  });
});

describe("project city/town sorting", () => {
  const withCities = [
    { name: "No City", createdAt: "2026-01-01", updatedAt: "2026-01-01", propertyCity: null },
    { name: "Boulder Job", createdAt: "2026-01-01", updatedAt: "2026-01-01", propertyCity: "Boulder" },
    { name: "Aspen Job", createdAt: "2026-01-01", updatedAt: "2026-01-01", propertyCity: "Aspen" },
  ];

  it("sorts A–Z by the property city/town and puts missing cities last", () => {
    const sorted = sortProjectsInMemory(withCities, "city_asc").map((p) => p.name);
    expect(sorted).toEqual(["Aspen Job", "Boulder Job", "No City"]);
  });

  it("sorts Z–A and still puts missing cities last", () => {
    const sorted = sortProjectsInMemory(withCities, "city_desc").map((p) => p.name);
    expect(sorted).toEqual(["Boulder Job", "Aspen Job", "No City"]);
  });

  it("keeps Recently Worked On as the default sort", () => {
    expect(DEFAULT_PROJECT_SORT).toBe("recent");
  });
});
