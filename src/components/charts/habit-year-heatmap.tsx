import { useState, useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays } from "lucide-react";
import { getHabitsHeatmap } from "@/lib/productivity.functions";
import { useI18n } from "@/lib/i18n";
import { ChartLegend, RangeSelect } from "./chart-controls";

function buildWeeks(fromStr: string, months: number) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  // months window starts at today − months * 30 days, but clamped by data.from
  const minStart = new Date(today);
  minStart.setUTCDate(minStart.getUTCDate() - months * 30);
  const dataStart = new Date(fromStr + "T00:00:00Z");
  const start = minStart > dataStart ? minStart : dataStart;
  // back up to previous Sunday to align grid
  const day = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - day);
  const weeks: string[][] = [];
  let cur = new Date(start);
  while (cur <= today) {
    const w: string[] = [];
    for (let i = 0; i < 7; i++) {
      w.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    weeks.push(w);
  }
  return weeks;
}

export function HabitYearHeatmap() {
  const { t } = useI18n();
  const fn = useServerFn(getHabitsHeatmap);
  const { data } = useSuspenseQuery({ queryKey: ["pro", "heatmap"], queryFn: () => fn() });

  const [months, setMonths] = useState<number>(12);
  const [hidden, setHidden] = useState<Set<string>>(new Set()); // hidden habit ids

  const weeks = useMemo(() => buildWeeks(data.from, months), [data.from, months]);
  const visibleHabits = data.habits.filter((h) => !hidden.has(h.id));
  const visibleIds = new Set(visibleHabits.map((h) => h.id));
  const totalByDate = new Map<string, number>();
  for (const l of data.logs) {
    if (!visibleIds.has(l.habit_id)) continue;
    totalByDate.set(l.logged_on, (totalByDate.get(l.logged_on) ?? 0) + 1);
  }
  const habitCount = Math.max(visibleHabits.length, 1);
  const maxLevel = 4;

  function level(date: string) {
    const n = totalByDate.get(date) ?? 0;
    if (n === 0) return 0;
    const ratio = n / habitCount;
    return Math.min(maxLevel, Math.max(1, Math.ceil(ratio * maxLevel)));
  }

  const cellColor = ["bg-muted/30", "bg-primary/20", "bg-primary/40", "bg-primary/65", "bg-primary"];
  const palette = ["#22d3ee", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#60a5fa", "#fb923c", "#f87171"];
  const legendItems = data.habits.map((h, i) => ({
    key: h.id,
    label: h.name,
    color: h.color || palette[i % palette.length],
  }));
  const toggle = (k: string) =>
    setHidden((p) => {
      const n = new Set(p);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  const reset = () => { setHidden(new Set()); setMonths(12); };

  return (
    <section className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-primary" />
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            {t("chart.habit_year")}
          </h2>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span>{t("chart.less")}</span>
          {cellColor.map((c, i) => (
            <span key={i} className={"size-3 rounded-sm " + c} />
          ))}
          <span>{t("chart.more")}</span>
        </div>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto">
        <div className="flex flex-col gap-[3px] pt-0.5 text-[9px] text-muted-foreground">
          {["S","M","T","W","T","F","S"].map((d, i) => (
            <div key={i} className="size-3 leading-3">{i % 2 === 1 ? d : ""}</div>
          ))}
        </div>
        <div className="flex gap-[3px]">
          {weeks.map((w, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {w.map((d) => (
                <div
                  key={d}
                  className={"size-3 rounded-sm " + cellColor[level(d)]}
                  title={`${d}: ${totalByDate.get(d) ?? 0}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {data.habits.length > 0 && (
        <ChartLegend
          items={legendItems}
          hidden={hidden}
          onToggle={toggle}
          onReset={reset}
          rangeControl={
            <RangeSelect<number>
              label={t("chart.range")}
              value={months}
              onChange={setMonths}
              options={[
                { value: 3, label: t("chart.range.3m") },
                { value: 6, label: t("chart.range.6m") },
                { value: 12, label: t("chart.range.12m") },
              ]}
            />
          }
        />
      )}
    </section>
  );
}