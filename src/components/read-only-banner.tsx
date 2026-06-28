import { Lock } from "lucide-react";
import { usePermissions } from "@/lib/use-permissions";
import { useI18n } from "@/lib/i18n";

/**
 * Shown on any module page when the active user is a viewer (read-only).
 * Keep it lightweight; write controls are also disabled at the field level.
 */
export function ReadOnlyBanner() {
  const { isViewer, loading } = usePermissions();
  const { t } = useI18n();
  if (loading || !isViewer) return null;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
      <Lock className="size-3.5" />
      <span>{t("perm.viewer_banner")}</span>
    </div>
  );
}