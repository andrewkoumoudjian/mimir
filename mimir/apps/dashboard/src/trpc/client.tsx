"use client";

import type { QueryClient } from "@tanstack/react-query";
import { isServer, QueryClientProvider } from "@tanstack/react-query";
import { useMemo } from "react";
import { createMimirTRPCProxy } from "@/lib/mimir/trpc-adapter";
import { makeQueryClient } from "./query-client";

let browserQueryClient: QueryClient;

function getQueryClient() {
  if (isServer) {
    return makeQueryClient();
  }

  if (!browserQueryClient) browserQueryClient = makeQueryClient();

  return browserQueryClient;
}

export function useTRPC() {
  return useMemo(() => createMimirTRPCProxy(), []);
}

export function TRPCReactProvider(
  props: Readonly<{
    children: React.ReactNode;
  }>,
) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {props.children}
    </QueryClientProvider>
  );
}
