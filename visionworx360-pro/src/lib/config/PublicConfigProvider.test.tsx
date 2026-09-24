import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicConfigProvider, usePublicConfig } from "./PublicConfigProvider";

function StateProbe() {
  const config = usePublicConfig();
  return <span data-testid="state">{config.state}</span>;
}

describe("PublicConfigProvider", () => {
  // Before the Lovable exit this test passed with no configuration because
  // the provider silently fell back to the production backend. It now has to
  // supply explicit (non-production) values through the SSR runtime config.
  it("resolves configuration before children render", async () => {
    render(
      <PublicConfigProvider
        runtimeConfig={{
          VITE_SUPABASE_URL: "https://dev-project.supabase.co",
          VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_dev_placeholder",
        }}
      >
        <StateProbe />
      </PublicConfigProvider>,
    );
    expect(screen.getByTestId("state")).toHaveTextContent("ready");
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("ready"));
  });
});
