import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountControl } from "./account-control";

const mocks = vi.hoisted(() => ({
  auth: {
    isLoaded: true,
    isSignedIn: true,
    user: {
      fullName: "Aurora Tester",
      firstName: "Aurora",
      lastName: "Tester",
      username: null as string | null,
      primaryEmailAddress: { emailAddress: "aurora@example.com" },
      imageUrl: "",
    },
  },
  signOut: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@clerk/react", () => ({
  useUser: () => mocks.auth,
  useClerk: () => ({ signOut: mocks.signOut }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

async function openMenu() {
  const user = userEvent.setup();
  screen.getByRole("button", { name: /open account menu/i }).focus();
  await user.keyboard("{Enter}");
  return user;
}

describe("account control", () => {
  beforeEach(() => {
    mocks.auth.isLoaded = true;
    mocks.auth.isSignedIn = true;
    mocks.auth.user.fullName = "Aurora Tester";
    mocks.signOut.mockReset();
    mocks.toast.mockReset();
  });
  afterEach(cleanup);

  it("shows identity and supports keyboard opening and Escape", async () => {
    render(<AccountControl onSettings={vi.fn()} />);
    expect(screen.getByText("Aurora Tester")).toBeVisible();
    const user = await openMenu();
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /open account menu/i })).toHaveFocus();
  });

  it("uses Clerk sign-out with the public artifact home and blocks repeat submissions", async () => {
    mocks.signOut.mockReturnValue(new Promise(() => {}));
    render(<AccountControl compact onSettings={vi.fn()} />);
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(mocks.signOut).toHaveBeenCalledWith({ redirectUrl: import.meta.env.BASE_URL || "/" });
    expect(screen.getByRole("menuitem", { name: "Signing out…" })).toHaveAttribute("data-disabled");
    fireEvent.click(screen.getByRole("menuitem", { name: "Signing out…" }));
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("shows a safe error and allows retry on sign-out failure", async () => {
    mocks.signOut.mockRejectedValueOnce(new Error("private provider detail"));
    render(<AccountControl onSettings={vi.fn()} />);
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({
      title: "Sign out failed",
      description: "An error occurred while signing out. Please try again.",
      variant: "destructive",
    }));
    expect(screen.getByRole("menuitem", { name: "Sign out" })).not.toHaveAttribute("data-disabled");
    mocks.signOut.mockReturnValue(new Promise(() => {}));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(mocks.signOut).toHaveBeenCalledTimes(2);
  });

  it("calls the existing Settings action", async () => {
    const onSettings = vi.fn();
    render(<AccountControl onSettings={onSettings} />);
    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
    expect(onSettings).toHaveBeenCalledTimes(1);
  });

  it("hides account actions until loaded and when signed out", () => {
    mocks.auth.isLoaded = false;
    const view = render(<AccountControl onSettings={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    mocks.auth.isLoaded = true;
    mocks.auth.isSignedIn = false;
    view.rerender(<AccountControl onSettings={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("falls back to the email when a name is absent", () => {
    mocks.auth.user.fullName = "";
    render(<AccountControl onSettings={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Open account menu for aurora@example.com" })).toBeVisible();
  });
});