import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import type { ReactNode } from "react";

const navigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useSearch: () => ({}),
  Link: ({ children, to }: { children: ReactNode; to?: string }) => <a href={to ?? "#"}>{children}</a>,
}));

const createProjectMutate = vi.fn();
const clients = [
  {
    id: "client-1",
    organizationId: "org-1",
    firstName: "Dana",
    lastName: "Reyes",
    company: null,
    email: null,
    phone: null,
    secondaryPhone: null,
    addressLine1: null,
    city: null,
    region: null,
    postalCode: null,
    notes: null,
    preferredContact: "any",
    status: "active",
    createdAt: "",
    updatedAt: "",
  },
];
let properties: Array<Record<string, unknown>> = [];
let historyProjects: Array<Record<string, unknown>> = [];

vi.mock("@/features/crm/hooks/useCrm", () => ({
  useClientsQuery: () => ({ data: { items: clients }, isLoading: false }),
  usePropertiesQuery: () => ({ data: properties, isLoading: false }),
  useProjectsQuery: () => ({ data: { items: historyProjects }, isLoading: false }),
  useProjectMutations: () => ({
    orgId: "org-1",
    create: { mutateAsync: createProjectMutate, isPending: false },
  }),
}));

vi.mock("@/features/crm/components/ClientFormDialog", () => ({
  ClientFormDialog: ({
    open,
    onSaved,
  }: {
    open: boolean;
    onSaved?: (c: unknown) => void;
  }) =>
    open ? (
      <button type="button" onClick={() => onSaved?.({ ...clients[0], id: "client-new", firstName: "New", lastName: "Client" })}>
        save-client
      </button>
    ) : null,
}));

vi.mock("@/features/crm/components/PropertyFormDialog", () => ({
  PropertyFormDialog: ({
    open,
    clientId,
    onSaved,
  }: {
    open: boolean;
    clientId: string;
    onSaved?: (p: unknown) => void;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          onSaved?.({ id: "prop-new", clientId, nickname: "New Property", archivedAt: null })
        }
      >
        save-property
      </button>
    ) : null,
}));

import { CreateEstimateWizard } from "./CreateEstimateWizard";

const existingProperty = {
  id: "prop-1",
  organizationId: "org-1",
  clientId: "client-1",
  nickname: "Lakeside House",
  street: null,
  city: null,
  archivedAt: null,
};

async function openWizard() {
  const user = userEvent.setup();
  render(<CreateEstimateWizard />);
  await user.click(
    screen.getByRole("button", { name: /(create new estimate|crear nuevo presupuesto)/i }),
  );
  return user;
}

describe("Create Estimate wizard", () => {
  beforeEach(async () => {
    navigate.mockReset();
    createProjectMutate.mockReset();
    createProjectMutate.mockResolvedValue({ id: "project-1", name: "Main Bathroom Remodel" });
    properties = [existingProperty];
    historyProjects = [];
    await i18n.changeLanguage("en-US");
  });

  it("existing client + existing property creates the project and routes to Onsite Walkthrough", async () => {
    const user = await openWizard();

    expect(
      screen.getByText(/Are you working with a new client or an existing client\?/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Existing Client/i }));
    await user.click(screen.getByRole("button", { name: /Dana Reyes/i }));

    expect(await screen.findByText(/Which property are you working at\?/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Lakeside House/i }));

    expect(await screen.findByText(/What are you estimating today\?/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Describe the work/i), "Main Bathroom Remodel");
    await user.click(screen.getByRole("button", { name: /^Continue$/i }));

    await waitFor(() =>
      expect(createProjectMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          activeOrganizationId: "org-1",
          clientId: "client-1",
          propertyId: "prop-1",
          name: "Main Bathroom Remodel",
        }),
      ),
    );

    expect(await screen.findByText(/How would you like to build the estimate\?/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Onsite Walkthrough/i }));

    expect(navigate).toHaveBeenCalledWith({
      to: "/app/walkthrough",
      search: { projectId: "project-1", projectName: "Main Bathroom Remodel" },
    });
  });

  it("existing client + new property uses the CRM property dialog", async () => {
    properties = [];
    const user = await openWizard();
    await user.click(screen.getByRole("button", { name: /Existing Client/i }));
    await user.click(screen.getByRole("button", { name: /Dana Reyes/i }));
    expect(await screen.findByText(/No properties yet for this client/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Add New Property/i }));
    await user.click(screen.getByRole("button", { name: "save-property" }));

    expect(await screen.findByText(/What are you estimating today\?/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Describe the work/i), "Deck Rebuild");
    await user.click(screen.getByRole("button", { name: /^Continue$/i }));
    await waitFor(() =>
      expect(createProjectMutate).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: "client-1", propertyId: "prop-new" }),
      ),
    );
  });

  it("new client + new property flows straight through to the estimate method", async () => {
    properties = [];
    const user = await openWizard();
    await user.click(screen.getByRole("button", { name: /New Client/i }));
    await user.click(screen.getByRole("button", { name: "save-client" }));
    await user.click(screen.getByRole("button", { name: "save-property" }));

    await user.type(await screen.findByLabelText(/Describe the work/i), "Kitchen Refresh");
    await user.click(screen.getByRole("button", { name: /^Continue$/i }));

    await waitFor(() =>
      expect(createProjectMutate).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: "client-new", propertyId: "prop-new" }),
      ),
    );
    expect(await screen.findByText(/How would you like to build the estimate\?/i)).toBeInTheDocument();
  });

  it("routes to Photos or Video and Describe Your Project with the project preselected", async () => {
    for (const [label, to] of [
      [/Photos or Video/i, "/app/remote-vision"],
      [/Describe Your Project/i, "/app/capture"],
    ] as const) {
      navigate.mockReset();
      const user = await openWizard();
      await user.click(screen.getByRole("button", { name: /Existing Client/i }));
      await user.click(screen.getByRole("button", { name: /Dana Reyes/i }));
      await user.click(await screen.findByRole("button", { name: /Lakeside House/i }));
      await user.type(await screen.findByLabelText(/Describe the work/i), "Job");
      await user.click(screen.getByRole("button", { name: /^Continue$/i }));
      await user.click(await screen.findByRole("button", { name: label }));
      expect(navigate).toHaveBeenCalledWith({
        to,
        search: { projectId: "project-1", projectName: "Main Bathroom Remodel" },
      });
      cleanup();
    }
  });

  it("preserves entered data when moving backward", async () => {
    const user = await openWizard();
    await user.click(screen.getByRole("button", { name: /Existing Client/i }));
    await user.click(screen.getByRole("button", { name: /Dana Reyes/i }));
    await user.click(await screen.findByRole("button", { name: /Lakeside House/i }));
    await user.type(await screen.findByLabelText(/Describe the work/i), "Main Bathroom Remodel");
    await user.click(screen.getByRole("button", { name: /Back/i }));
    expect(await screen.findByText(/Which property are you working at\?/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Lakeside House/i }));
    expect(await screen.findByLabelText(/Describe the work/i)).toHaveValue("Main Bathroom Remodel");
  });

  it("shows a generic prior-history acknowledgment without invented specifics", async () => {
    historyProjects = [{ id: "old-1", clientId: "client-1", propertyId: "prop-1" }];
    const user = await openWizard();
    await user.click(screen.getByRole("button", { name: /Existing Client/i }));
    await user.click(screen.getByRole("button", { name: /Dana Reyes/i }));
    await user.click(await screen.findByRole("button", { name: /Lakeside House/i }));
    const note = await screen.findByText(/previous project history at this property/i);
    expect(note).toBeInTheDocument();
    expect(note.textContent ?? "").not.toMatch(/paint|color|style/i);
  });

  it("prevents duplicate project creation from repeated taps", async () => {
    let resolveCreate: (v: unknown) => void = () => {};
    createProjectMutate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const user = await openWizard();
    await user.click(screen.getByRole("button", { name: /Existing Client/i }));
    await user.click(screen.getByRole("button", { name: /Dana Reyes/i }));
    await user.click(await screen.findByRole("button", { name: /Lakeside House/i }));
    await user.type(await screen.findByLabelText(/Describe the work/i), "Job");
    const submit = screen.getByRole("button", { name: /^Continue$/i });
    await user.click(submit);
    await user.click(submit).catch(() => {});
    resolveCreate({ id: "project-1", name: "Job" });
    await waitFor(() => expect(createProjectMutate).toHaveBeenCalledTimes(1));
  });

  it("renders as a centered, comfortably sized modal on desktop widths", async () => {
    await openWizard();
    const panel = screen.getByTestId("create-estimate-wizard");
    const cls = panel.className;
    // Mobile behaviour preserved: bottom sheet with capped height.
    expect(cls).toContain("max-h-[92vh]");
    // Desktop: centered modal ~720px with internal scrolling, not a phone strip.
    expect(cls).toContain("sm:inset-0");
    expect(cls).toContain("sm:m-auto");
    expect(cls).toContain("sm:w-[min(720px,92vw)]");
    expect(cls).toContain("sm:max-h-[86vh]");
    // Laptop/desktop: substantially larger, ~960px wide and ~82vh tall.
    expect(cls).toContain("md:w-[min(960px,94vw)]");
    expect(cls).toContain("md:h-[82vh]");
    expect(cls).toContain("md:max-h-[84vh]");
    expect(cls).toContain("md:p-10");
    expect(cls).not.toContain("sm:max-w-lg");
    expect(panel.querySelector(".sm\\:grid-cols-2")).not.toBeNull();
  });

  it("renders Spanish copy", async () => {
    await i18n.changeLanguage("es-US");
    await openWizard();
    expect(
      screen.getByText(/¿Trabajas con un cliente nuevo o con un cliente existente\?/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cliente existente/i })).toBeInTheDocument();
  });
});

