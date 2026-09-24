import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicConfigProvider, usePublicConfig } from "./PublicConfigProvider";

function StateProbe() {
  const config = usePublicConfig();
  return <span data-testid="state">{config.state}</span>;
}

describe("PublicConfigProvider", () => {
  it("resolves configuration before children render", async () => {
    render(
      <PublicConfigProvider>
        <StateProbe />
      </PublicConfigProvider>,
    );
    expect(screen.getByTestId("state")).toHaveTextContent("ready");
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("ready"));
  });
});
