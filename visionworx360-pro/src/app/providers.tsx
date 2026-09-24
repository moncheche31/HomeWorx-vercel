import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { NetworkStatusProvider } from "@/lib/network/NetworkStatusProvider";
import { AppErrorBoundary } from "@/app/AppErrorBoundary";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          const status = (error as { status?: number } | undefined)?.status;
          if (status && [400, 401, 403, 404, 422].includes(status)) return false;
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}

interface AppProvidersProps {
  children: ReactNode;
  queryClient?: QueryClient;
}

export function AppProviders({ children, queryClient }: AppProvidersProps) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={client}>
        <NetworkStatusProvider>
          {children}
          <Toaster position="top-center" richColors />
        </NetworkStatusProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
