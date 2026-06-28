import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { RouterPending } from "@/components/router-pending";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Keep cached data fresh between tab navigations so we don't refetch on every visit.
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preload route chunks + loader data on link hover/intent.
    defaultPreload: "intent",
    defaultPreloadDelay: 50,
    // Let React Query control freshness instead of the router's preload cache.
    defaultPreloadStaleTime: 0,
    // Show the pending indicator immediately on navigation (no 1s hidden delay).
    defaultPendingMs: 0,
    defaultPendingMinMs: 150,
    defaultPendingComponent: RouterPending,
  });

  return router;
};
