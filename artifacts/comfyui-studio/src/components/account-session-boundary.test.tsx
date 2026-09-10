import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountSessionBoundary } from "./account-session-boundary";

const auth = vi.hoisted(() => ({
  isLoaded: true,
  userId: "test-user-a" as string | null | undefined,
}));
vi.mock("@clerk/react", () => ({ useAuth: () => auth }));
vi.mock("sonner", () => ({ toast: { dismiss: vi.fn() } }));

let activeClient: QueryClient;
function PrivatePage() {
  activeClient = useQueryClient();
  const [draft, setDraft] = useState("");
  return <input aria-label="Draft" value={draft} onChange={event => setDraft(event.target.value)} />;
}

describe("account session isolation", () => {
  beforeEach(() => {
    auth.isLoaded = true;
    auth.userId = "test-user-a";
    sessionStorage.clear();
  });
  afterEach(cleanup);

  it("clears drafts, cached queries, mutations and local page state when signing out", () => {
    sessionStorage.setItem("assistant-workflow", "private workflow");
    sessionStorage.setItem("comfyui-upload:workflow:image", "private.png");
    sessionStorage.setItem("unrelated-preference", "keep");
    const view = render(<AccountSessionBoundary><PrivatePage /></AccountSessionBoundary>);
    const previousClient = activeClient;
    previousClient.setQueryData(["jobs"], [{ id: "private-job" }]);
    previousClient.getMutationCache().build(previousClient, { mutationKey: ["private-mutation"] });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "private prompt" } });
    expect(screen.getByRole("textbox")).toHaveValue("private prompt");
    auth.userId = null;
    view.rerender(<AccountSessionBoundary><PrivatePage /></AccountSessionBoundary>);
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(activeClient).not.toBe(previousClient);
    expect(activeClient.getQueryData(["jobs"])).toBeUndefined();
    expect(previousClient.getQueryCache().getAll()).toHaveLength(0);
    expect(previousClient.getMutationCache().getAll()).toHaveLength(0);
    expect(sessionStorage.getItem("assistant-workflow")).toBeNull();
    expect(sessionStorage.getItem("comfyui-upload:workflow:image")).toBeNull();
    expect(sessionStorage.getItem("unrelated-preference")).toBe("keep");
  });

  it("preserves drafts during initial signed-in load and same-user rerenders", () => {
    sessionStorage.setItem("comfyui-upload:workflow:image", "private.png");
    const view = render(<AccountSessionBoundary><PrivatePage /></AccountSessionBoundary>);
    const previousClient = activeClient;
    view.rerender(<AccountSessionBoundary><PrivatePage /></AccountSessionBoundary>);
    expect(activeClient).toBe(previousClient);
    expect(sessionStorage.getItem("comfyui-upload:workflow:image")).toBe("private.png");
  });

  it("clears drafts on account switches and starts a separate cache", () => {
    const view = render(<AccountSessionBoundary><PrivatePage /></AccountSessionBoundary>);
    const previousClient = activeClient;
    sessionStorage.setItem("assistant-workflow", "user A workflow");
    auth.userId = "test-user-b";
    view.rerender(<AccountSessionBoundary><PrivatePage /></AccountSessionBoundary>);
    expect(sessionStorage.getItem("assistant-workflow")).toBeNull();
    expect(activeClient).not.toBe(previousClient);
  });

  it("removes leftover drafts when loading the public app signed out", () => {
    sessionStorage.setItem("assistant-workflow", "old workflow");
    auth.userId = null;
    render(<AccountSessionBoundary><PrivatePage /></AccountSessionBoundary>);
    expect(sessionStorage.getItem("assistant-workflow")).toBeNull();
  });

  it("waits for auth to load before cleaning browser storage", () => {
    sessionStorage.setItem("assistant-workflow", "saved workflow");
    auth.isLoaded = false;
    auth.userId = undefined;
    const view = render(<AccountSessionBoundary><PrivatePage /></AccountSessionBoundary>);
    expect(sessionStorage.getItem("assistant-workflow")).toBe("saved workflow");
    auth.isLoaded = true;
    auth.userId = "test-user-a";
    view.rerender(<AccountSessionBoundary><PrivatePage /></AccountSessionBoundary>);
    expect(sessionStorage.getItem("assistant-workflow")).toBe("saved workflow");
  });
});