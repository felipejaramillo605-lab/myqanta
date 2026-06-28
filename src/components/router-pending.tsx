import { Loader2 } from "lucide-react";

/**
 * Global pending indicator shown during route transitions.
 * Renders an inline skeleton + top progress bar so the UI never appears frozen
 * while a route loader is fetching data.
 */
export function RouterPending() {
  return (
    <div className="relative space-y-6">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-transparent"
      >
        <div className="h-full w-1/2 animate-[progress_1.1s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-primary to-transparent" />
      </div>

      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin text-primary" />
        Loading…
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass h-28 animate-pulse rounded-2xl" />
        ))}
      </div>

      <div className="glass h-64 animate-pulse rounded-2xl" />
      <div className="glass h-48 animate-pulse rounded-2xl" />
    </div>
  );
}