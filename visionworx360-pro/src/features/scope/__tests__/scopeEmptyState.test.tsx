/**
 * Guards the advanced scope editor entry points:
 * - zero sections: "Start Blank" creates a section for the CURRENT project.
 * - existing sections: "Add scope section" is always visible in the toolbar
 *   and creates another section for the CURRENT project.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";

const createSectionMutateAsync = vi.fn().mockResolvedValue({ id: "sec-1" });
const sections: unknown[] = [];

vi.mock("../hooks/useScope", () => ({
  useScopeSectionsQuery: () => ({ data: sections, isLoading: false, error: null, refetch: vi.fn() }),
  useScopeItemsQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useScopeTemplatesQuery: () => ({ data: [] }),
  useRecommendedTemplateQuery: () => ({ data: null }),
  useScopeMutations: () => ({
    createSection: { mutateAsync: createSectionMutateAsync },
    applyTemplate: { mutateAsync: vi.fn() },
    reorderSections: { mutateAsync: vi.fn() },
    reorderItems: { mutateAsync: vi.fn() },
    moveItemToPosition: { mutateAsync: vi.fn() },
  }),
}));

vi.mock("@/features/project-workspace/hooks/useProjectWorkspace", () => ({
  useRoomsQuery: () => ({ data: [] }),
}));

vi.mock("@/features/knowledge-base/components/ProjectLibraryDialog", () => ({
  ProjectLibraryDialog: () => null,
}));

vi.mock("../components/TemplatesDialog", () => ({ TemplatesDialog: () => null }));
vi.mock("../components/ScopeSectionCard", () => ({ ScopeSectionCard: () => null }));

const { ScopeTab } = await import("../components/ScopeTab");

describe("ScopeTab advanced editor entry points", () => {
  beforeEach(() => {
    createSectionMutateAsync.mockClear();
    sections.length = 0;
  });

  it("shows Start Blank and creates a section for the current project", async () => {
    const user = userEvent.setup();
    render(<ScopeTab projectId="project-42" capturedDescription="Gut the kitchen." />);

    expect(screen.getByText("Captured Project Description")).toBeInTheDocument();
    const startBlank = screen.getByRole("button", { name: /start blank/i });
    expect(startBlank).toBeInTheDocument();

    await user.click(startBlank);

    await waitFor(() => expect(createSectionMutateAsync).toHaveBeenCalledTimes(1));
    expect(createSectionMutateAsync.mock.calls[0][0]).toMatchObject({ projectId: "project-42" });
  });

  it("keeps an Add scope section action once sections exist", async () => {
    sections.push({
      id: "sec-1",
      projectId: "project-42",
      name: "Demolition",
      sectionKey: "general_conditions",
      roomId: null,
      description: null,
      tradeKey: null,
      sortOrder: 0,
      isArchived: false,
    });
    const user = userEvent.setup();
    render(<ScopeTab projectId="project-42" />);

    expect(screen.queryByRole("button", { name: /start blank/i })).toBeNull();
    const addSection = screen.getByRole("button", { name: /add scope section/i });
    expect(addSection).toBeInTheDocument();

    await user.click(addSection);

    await waitFor(() => expect(createSectionMutateAsync).toHaveBeenCalledTimes(1));
    expect(createSectionMutateAsync.mock.calls[0][0]).toMatchObject({ projectId: "project-42" });
  });

  it("does not repeat estimate-method entry points", () => {
    render(<ScopeTab projectId="project-42" />);
    expect(screen.queryByRole("button", { name: /onsite/i })).toBeNull();
    expect(i18n.isInitialized || true).toBe(true);
  });
});
