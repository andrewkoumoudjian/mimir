import "server-only";

import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { cache } from "react";
import { createMimirTRPCProxy } from "@/lib/mimir/trpc-adapter";
import { makeQueryClient } from "./query-client";

export const getQueryClient = cache(makeQueryClient);

export const trpc = createMimirTRPCProxy();

export function HydrateClient(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {props.children}
    </HydrationBoundary>
  );
}

export function prefetch(queryOptions: any) {
  const queryClient = getQueryClient();

  if (queryOptions.queryKey?.[1]?.type === "infinite") {
    void queryClient.prefetchInfiniteQuery(queryOptions).catch(() => {});
  } else {
    void queryClient.prefetchQuery(queryOptions).catch(() => {});
  }
}

export function batchPrefetch(queryOptionsArray: any[]) {
  for (const queryOptions of queryOptionsArray) {
    prefetch(queryOptions);
  }
}

export async function getTRPCClient() {
  return createMimirTRPCProxy();
}
