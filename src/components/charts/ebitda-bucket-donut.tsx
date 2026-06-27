import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { PieChart as PieIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--destructive))",
  "oklch(0.72 0.13 80)",
  "oklch(0.65 0.13 220)",
  "oklch(0.6 0.12 300)",
  "oklch(0.7 0.13 160)",
  "oklch(0.75 0.13 40)",
  "oklch(0.55 0.08 260)",
];

export function EbitdaBucketDonut({ byBucket }: { byBucket: Record<string, number> }) {
  const { t } = useI18n();
  const data = Object.entries(byBucket)
    .filter(([, v]) => Math.abs(v) > 0.001)
    .map(([k, v]) => ({ name: t(("fin.bucket." + k) as never), value: Math.abs(v), bucket: k }));

  return (
    <section className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2">
        <PieIcon className="size-4 text-primary" />
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {t("chart.bucket_mix")}
        </h2>
      </div>
      {data.length === 0 ? (
        <div className="mt-6 grid h-56 place-items-center rounded-xl bg-muted/30 text-xs text-muted-foreground">
          {t("chart.no_data")}
        </div>
      ) : (
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} strokeWidth={0} paddingAngle={2}>
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}