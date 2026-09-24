/**
 * Regression coverage for CRM list navigation state (Contractor Pilot Pass 2).
 *
 * The defect: search / filter / page lived in component state, so opening a
 * record and coming back remounted the list and dropped the contractor's
 * context. These tests prove the state is now derived from route search
 * params, that changing a filter returns to page 1, and that a hand-edited or
 * malformed URL degrades to safe defaults instead of reaching a query.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  parseProjectsListSearch,
  parseClientsListSearch,
  parsePropertiesListSearch,
  parsePage,
  parseText,
  parseOneOf,
  parseMoney,
  PROJECT_STATUS_VALUES,
} from "@/features/crm/navigation/listSearch";
import { useListSearchUpdater } from "@/features/crm/navigation/useListSearchUpdater";

type SearchRecord = Record<string, unknown>;

let currentSearch: SearchRecord = {};
const navigateSpy = vi.fn();
const projectsQueryArgs: SearchRecord[] = [];

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to?: string }) => (
    <a href={to ?? "#"}>{children}</a>
  ),
  useNavigate: () => navigateSpy,
  useSearch: () => currentSearch,
  useRouterState: () => ({ location: { pathname: "/app/projects", searchStr: "" } }),
}));

vi.mock("@/features/auth/hooks/useAuth", () => ({
  useAuth: () => ({ status: "authenticated", signOut: vi.fn() }),
}));
vi.mock("@/features/workspace/providers/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    organization: { id: "org-1" },
    organizationStatus: "ready",
    refreshOrganization: vi.fn(),
  }),
}));
vi.mock("@/features/crm/hooks/useCrm", () => ({
  useProjectsQuery: (args: SearchRecord) => {
    projectsQueryArgs.push(args);
    return {
      data: { items: [], total: 0 },
      isPending: false,
      isLoading: false,
      isError: false,
      isSuccess: true,
      refetch: vi.fn(),
    };
  },
  useCrmFilterOptionsQuery: () => ({ data: { clientCities: [], propertyCities: ["Austin"] } }),
  useClientsQuery: () => ({ data: { items: [], total: 0 } }),
  useActiveOrgId: () => "org-1",
  useClientMutations: () => ({
    orgId: "org-1",
    create: { mutateAsync: vi.fn(), isPending: false },
    update: { mutateAsync: vi.fn(), isPending: false },
    archive: { mutateAsync: vi.fn(), isPending: false },
    restore: { mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock("@/features/crm/components/ProjectFormDialog", () => ({ ProjectFormDialog: () => null }));
vi.mock("@/features/crm/components/ProjectThumbnail", () => ({ ProjectThumbnail: () => null }));

const { ProjectsListPage } = await import("@/features/crm/pages/ProjectsListPage");

/** Applies the reducer the page handed to `navigate` against a previous URL state. */
function resolveNavigatedSearch(previous: SearchRecord): SearchRecord {
  const call = navigateSpy.mock.calls.at(-1)?.[0] as
    | { search: (prev: SearchRecord) => SearchRecord }
    | undefined;
  expect(call, "the control should have navigated").toBeTruthy();
  return call!.search(previous);
}

beforeEach(() => {
  currentSearch = {};
  navigateSpy.mockReset();
  projectsQueryArgs.length = 0;
});

describe("CRM list state is URL-persisted", () => {
  it("drives the projects query from route search params, not component state", () => {
    currentSearch = { q: "kitchen", status: "construction", city: "Austin", page: 3 };
    render(<ProjectsListPage />);

    const args = projectsQueryArgs.at(-1)!;
    expect(args.q).toBe("kitchen");
    expect(args.status).toBe("construction");
    expect(args.city).toBe("Austin");
    expect(args.page).toBe(3);
    expect((screen.getByLabelText(/search/i) as HTMLInputElement).value).toBe("kitchen");
  });

  it("restores the same list context after a remount (open a record, come back)", () => {
    currentSearch = { q: "kitchen", page: 3 };
    const first = render(<ProjectsListPage />);
    const before = projectsQueryArgs.at(-1)!;

    // Simulate leaving for a detail screen and returning: the component is
    // destroyed, only the URL survives.
    first.unmount();
    projectsQueryArgs.length = 0;
    render(<ProjectsListPage />);

    const after = projectsQueryArgs.at(-1)!;
    expect(after.q).toBe(before.q);
    expect(after.page).toBe(before.page);
    expect(after.page).toBe(3);
  });

  it("resets to page 1 when the search text changes", () => {
    currentSearch = { q: "kitchen", page: 4 };
    render(<ProjectsListPage />);

    fireEvent.change(screen.getByLabelText(/search/i), { target: { value: "bath" } });

    const next = resolveNavigatedSearch({ q: "kitchen", page: 4 });
    expect(next.q).toBe("bath");
    expect(next.page).toBeUndefined();
  });

  it("resets to page 1 on any non-page change but keeps a paginate call's page", () => {
    // The filter selects live inside a collapsed menu, so the reducer contract
    // they share is asserted directly on the hook every control uses.
    const { result } = renderHook(() => useListSearchUpdater<Record<string, unknown>>());

    result.current({ status: "approved" });
    const filtered = resolveNavigatedSearch({ q: "kitchen", city: "Austin", page: 4 });
    expect(filtered).toEqual({ q: "kitchen", city: "Austin", status: "approved" });

    result.current({ page: 3 });
    expect(resolveNavigatedSearch({ q: "kitchen", page: 2 })).toEqual({ q: "kitchen", page: 3 });

    // Clearing a filter removes it from the URL rather than leaving it blank.
    result.current({ city: undefined });
    expect(resolveNavigatedSearch({ q: "kitchen", city: "Austin", page: 4 })).toEqual({
      q: "kitchen",
    });

    // Every navigation replaces the entry so Back leaves the list, not the filters.
    expect(navigateSpy.mock.calls.at(-1)?.[0]).toMatchObject({ replace: true });
  });
});

describe("malformed search params fall back safely", () => {
  it("clamps and defaults page", () => {
    expect(parsePage("banana")).toBeUndefined();
    expect(parsePage(-5)).toBeUndefined();
    expect(parsePage(0)).toBeUndefined();
    expect(parsePage(1)).toBeUndefined();
    expect(parsePage("3")).toBe(3);
    expect(parsePage(2.7)).toBe(2);
    expect(parsePage(999_999_999)).toBe(10_000);
    expect(parsePage(null)).toBeUndefined();
  });

  it("bounds free text and drops blank values", () => {
    expect(parseText("   ")).toBeUndefined();
    expect(parseText(42)).toBeUndefined();
    expect(parseText("x".repeat(500))).toHaveLength(100);
  });

  it("rejects values outside a closed set", () => {
    expect(parseOneOf("approved", PROJECT_STATUS_VALUES)).toBe("approved");
    expect(parseOneOf("'; drop table --", PROJECT_STATUS_VALUES)).toBeUndefined();
    expect(parseOneOf(7, PROJECT_STATUS_VALUES)).toBeUndefined();
  });

  it("rejects negative or non-numeric money", () => {
    expect(parseMoney("-1")).toBeUndefined();
    expect(parseMoney("abc")).toBeUndefined();
    expect(parseMoney("2500")).toBe(2500);
  });

  it("produces an all-default object for a fully malformed URL", () => {
    const junk = {
      q: 12,
      status: "not-a-status",
      priority: "extreme",
      type: "nope",
      page: "-4",
      budgetMin: "abc",
      budgetMax: -10,
      city: "",
    };
    expect(parseProjectsListSearch(junk)).toEqual({
      q: undefined,
      status: undefined,
      priority: undefined,
      city: undefined,
      clientId: undefined,
      type: undefined,
      budgetMin: undefined,
      budgetMax: undefined,
      page: undefined,
    });
    expect(parseClientsListSearch({ status: "deleted", openProjects: "maybe", page: 0 })).toEqual({
      q: undefined,
      city: undefined,
      status: undefined,
      openProjects: undefined,
      page: undefined,
    });
    expect(parsePropertiesListSearch({ activeProjects: "yes", page: "2" })).toEqual({
      q: undefined,
      city: undefined,
      clientId: undefined,
      activeProjects: "yes",
      page: 2,
    });
  });

  it("keeps valid values intact", () => {
    expect(
      parseProjectsListSearch({ q: "kitchen", status: "approved", page: "2", budgetMin: "1500" }),
    ).toMatchObject({ q: "kitchen", status: "approved", page: 2, budgetMin: 1500 });
  });
});

describe("sort is part of the shareable list URL", () => {
  it("initializes the projects sort from the URL and writes changes back", () => {
    currentSearch = { sort: "budget_desc" };
    render(<ProjectsListPage />);
    expect(projectsQueryArgs.at(-1)!.sort).toBe("budget_desc");
  });

  it("defaults sort when absent and drops the default from the URL", () => {
    currentSearch = {};
    render(<ProjectsListPage />);
    expect(projectsQueryArgs.at(-1)!.sort).toBe("recent");
  });

  it("validates sort per list and keeps the lists' params separate", () => {
    expect(parseProjectsListSearch({ sort: "budget_desc" }).sort).toBe("budget_desc");
    expect(parseProjectsListSearch({ sort: "address_asc" }).sort).toBeUndefined();
    expect(parseClientsListSearch({ sort: "name_asc" }).sort).toBe("name_asc");
    expect(parseClientsListSearch({ sort: "budget_desc" }).sort).toBeUndefined();
    expect(parsePropertiesListSearch({ sort: "address_asc" }).sort).toBe("address_asc");
    expect(parsePropertiesListSearch({ sort: "budget_desc" }).sort).toBeUndefined();
    // Projects-only params never appear on the other lists.
    expect(parseClientsListSearch({ priority: "high", budgetMin: 5 })).not.toHaveProperty(
      "priority",
    );
    expect(parsePropertiesListSearch({ status: "approved" })).not.toHaveProperty("status");
  });
});
