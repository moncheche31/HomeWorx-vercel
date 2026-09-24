import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicConfigProvider, usePublicConfig } from "./PublicConfigProvider";

function StateProbe() {
  const config = usePublicConfig();
  return <span data-testid="state">{config.state}</span>;
}

// Separate file: runtime config is module state, so this must run in a fresh
// module graph with nothing supplied.
describe("PublicConfigProvider without configuration", () => {
  it("fails closed instead of selecting a built-in backend", () => {
    render(
      <PublicConfigProvider>
        <StateProbe />
      </PublicConfigProvider>,
    );
    expect(screen.getByTestId("state")).toHaveTextContent("failed");
  });
});
