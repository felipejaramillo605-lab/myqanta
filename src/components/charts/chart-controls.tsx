import { RotateCcw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LegendItem = { key: string; label: string; color: string };

export function ChartLegend({
  items,
  hidden,
  onToggle,
  onReset,
  rangeControl,
}: {
  items: LegendItem[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
  onReset: () => void;
  rangeControl?: React.ReactNode;
}) {
  const { t } = useI18n();
  const dirty = hidden.size > 0;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {rangeControl}
      <div className="flex flex-wrap items-center gap-1.5">
        {items.map((it) => {
          const off = hidden.has(it.key);
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onToggle(it.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background/40 px-2.5 py-1 text-[11px] transition-opacity",
                off ? "opacity-40" : "opacity-100",
              )}
              aria-pressed={!off}
              title={off ? t("chart.show") : t("chart.hide")}
            >
              <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: it.color }} />
              <span className={cn("text-foreground", off && "line-through")}>{it.label}</span>
            </button>
          );
        })}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto h-7 gap-1 px-2 text-[11px] text-muted-foreground"
        onClick={onReset}
        disabled={!dirty}
      >
        <RotateCcw className="size-3" />
        {t("chart.reset")}
      </Button>
    </div>
  );
}

export function RangeSelect<T extends string | number>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label?: string;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background/40 px-2 py-1 text-[11px] text-muted-foreground">
      {label && <span>{label}</span>}
      <select
        className="bg-transparent text-foreground outline-none"
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          const next = (typeof value === "number" ? Number(raw) : raw) as T;
          onChange(next);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)} className="bg-popover text-popover-foreground">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}