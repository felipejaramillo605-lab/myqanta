import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { PieChart as PieIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { ChartLegend } from "./chart-controls";

const COLORS = [
  "#22d3ee", // cyan
  "#a78bfa", // violet
  "#f87171", // red
  "#fbbf24", // amber
  "#34d399", // emerald
  "#f472b6", // pink
  "#60a5fa", // blue
  "#fb923c", // orange
  "#94a3b8", // slate
];

export function EbitdaBucketDonut({ byBucket }: { byBucket: Record<string, number> }) {
  const { t } = useI18n();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const all = Object.entries(byBucket)
    .filter(([, v]) => Math.abs(v) > 0.001)
    .map(([k, v], i) => ({
      key: k,
      name: t(("fin.bucket." + k) as never),
      value: Math.abs(v),
      color: COLORS[i % COLORS.length],
    }));
  const data = all.filter((d) => !hidden.has(d.key));
  const toggle = (k: string) =>
    setHidden((p) => {
      const n = new Set(p);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  return (
    <section className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2">
        <PieIcon className="size-4 text-primary" />
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {t("chart.bucket_mix")}
        </h2>
      </div>
      {all.length === 0 ? (
        <div className="mt-6 grid h-56 place-items-center rounded-xl bg-muted/30 text-xs text-muted-foreground">
          {t("chart.no_data")}
        </div>
      ) : (
        <>
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 12,
                  fontSize: 12,
                  color: "hsl(var(--popover-foreground))",
                }}
              />
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} strokeWidth={0} paddingAngle={2}>
                {data.map((d) => (
                  <Cell key={d.key} fill={d.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ChartLegend
          items={all.map((d) => ({ key: d.key, label: d.name, color: d.color }))}
          hidden={hidden}
          onToggle={toggle}
          onReset={() => setHidden(new Set())}
        />
        </>
      )}
    </section>
  );
}