import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmailConfirmationState } from "./EmailConfirmationState";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? "#"}>{children}</a>
  ),
}));

describe("EmailConfirmationState", () => {
  it("masks the email address in the visible UI", () => {
    render(<EmailConfirmationState email="maria@example.com" />);
    expect(screen.queryByText("maria@example.com")).not.toBeInTheDocument();
    expect(screen.getByText(/example\.com/)).toBeInTheDocument();
  });

  it("shows a disabled cooldown button initially", () => {
    render(<EmailConfirmationState email="j@e.co" onResend={vi.fn()} cooldownSeconds={60} />);
    const btn = screen.getByRole("button", { name: /resend available in/i });
    expect(btn).toBeDisabled();
  });

  it("invokes onResend when cooldown is zero and re-arms the cooldown", async () => {
    const onResend = vi.fn().mockResolvedValue(null);
    render(<EmailConfirmationState email="j@e.co" onResend={onResend} cooldownSeconds={0} />);
    const user = userEvent.setup();
    const btn = await screen.findByRole("button", { name: /resend confirmation email/i });
    expect(btn).not.toBeDisabled();
    await user.click(btn);
    await waitFor(() => expect(onResend).toHaveBeenCalledWith("j@e.co"));
  });
});
