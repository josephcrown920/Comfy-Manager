import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useAuth } from "@clerk/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";

export function clearAccountDrafts(storage: Storage) {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  for (const key of keys) {
    if (key === "assistant-workflow" || key?.startsWith("comfyui-upload:")) {
      storage.removeItem(key);
    }
  }
}

/** Keep cached responses and mounted page state isolated between accounts. */
export function AccountSessionBoundary({ children }: { children: ReactNode }) {
  const { userId, isLoaded } = useAuth();
  const previousUser = useRef<string | null | undefined>(undefined);
  const identity = isLoaded ? userId ?? null : undefined;
  const client = useMemo(() => new QueryClient(), [identity]);

  useLayoutEffect(() => {
    if (identity === undefined) return;
    if (identity === null || (previousUser.current !== undefined && previousUser.current !== identity)) {
      try {
        clearAccountDrafts(window.sessionStorage);
      } catch {
        // Some privacy modes disable storage. No persisted drafts can be read there.
      }
      toast.dismiss();
    }
    previousUser.current = identity;
  }, [identity]);

  useEffect(() => () => client.clear(), [client]);

  return (
    <QueryClientProvider client={client}>
      <Fragment key={identity === undefined ? "auth-loading" : identity ?? "signed-out"}>
        {children}
      </Fragment>
    </QueryClientProvider>
  );
}