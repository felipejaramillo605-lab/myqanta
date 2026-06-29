import { useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Calendar, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { getHabitsHeatmap } from "@/lib/productivity.functions";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RangeSelect } from "./chart-controls";

type Period = "day" | "week" | "month";
const PALETTE = ["#22d3ee", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#60a5fa", "#fb923c", "#f87171"];

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  const dow = (x.getUTCDay() + 6) % 7; // Mon = 0
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function startOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function daysInMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

export function HabitWeekChart() {
  const { t, lang } = useI18n();
  const fn = useServerFn(getHabitsHeatmap);
  const { data } = useSuspenseQuery({ queryKey: ["pro", "heatmap"], queryFn: () => fn() });

  const [period, setPeriod] = useState<Period>("week");
  const [anchor, setAnchor] = useState<Date>(() => {
    const t = new Date();
    t.setUTCHours(0, 0, 0, 0);
    return t;
  });
  const [category, setCategory] = useState<string>("__all__");

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const h of data.habits) s.add((h.category ?? "").trim() || "__none__");
    return Array.from(s);
  }, [data.habits]);

  const habitsFiltered = useMemo(() => {
    if (category === "__all__") return data.habits;
    return data.habits.filter((h) => ((h.category ?? "").trim() || "__none__") === category);
  }, [data.habits, category]);

  const logsByHabit = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of data.logs) {
      if (!m.has(l.habit_id)) m.set(l.habit_id, new Set());
      m.get(l.habit_id)!.add(l.logged_on);
    }
    return m;
  }, [data.logs]);

  const days = useMemo(() => {
    if (period === "day") return [iso(anchor)];
    if (period === "week") {
      const s = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, i) => iso(addDays(s, i)));
    }
    const s = startOfMonth(anchor);
    return Array.from({ length: daysInMonth(anchor) }, (_, i) => iso(addDays(s, i)));
  }, [period, anchor]);

  const navigate = (dir: -1 | 1) => {
    const d = new Date(anchor);
    if (period === "day") d.setUTCDate(d.getUTCDate() + dir);
    else if (period === "week") d.setUTCDate(d.getUTCDate() + 7 * dir);
    else d.setUTCMonth(d.getUTCMonth() + dir);
    setAnchor(d);
  };
  const goToday = () => {
    const x = new Date();
    x.setUTCHours(0, 0, 0, 0);
    setAnchor(x);
  };

  const dowKeys = ["chart.dow.mon","chart.dow.tue","chart.dow.wed","chart.dow.thu","chart.dow.fri","chart.dow.sat","chart.dow.sun"] as const;
  const fmtRange = () => {
    const lc = lang === "es" ? "es-ES" : "en-US";
    if (period === "day") return new Date(days[0] + "T00:00:00Z").toLocaleDateString(lc, { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" });
    if (period === "week") return `${new Date(days[0] + "T00:00:00Z").toLocaleDateString(lc, { day: "2-digit", month: "short", timeZone: "UTC" })} – ${new Date(days[6] + "T00:00:00Z").toLocaleDateString(lc, { day: "2-digit", month: "short", timeZone: "UTC" })}`;
    return new Date(days[0] + "T00:00:00Z").toLocaleDateString(lc, { month: "long", year: "numeric", timeZone: "UTC" });
  };

  const todayStr = iso(new Date());

  return (
    <section className="glass rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-primary" />
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{t("chart.habit_week")}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangeSelect<Period>
            label={t("chart.range")}
            value={period}
            onChange={(v) => setPeriod(v)}
            options={[
              { value: "day", label: t("chart.range.day") },
              { value: "week", label: t("chart.range.week") },
              { value: "month", label: t("chart.range.month") },
            ]}
          />
          <RangeSelect<string>
            label={t("chart.filter_category")}
            value={category}
            onChange={setCategory}
            options={[
              { value: "__all__", label: t("chart.all_categories") },
              ...categories.map((c) => ({ value: c, label: c === "__none__" ? t("pro.habit.no_category") : c })),
            ]}
          />
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="size-7" onClick={() => navigate(-1)} aria-label={t("chart.prev")}><ChevronLeft className="size-4" /></Button>
            <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={goToday}>{t("chart.today")}</Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => navigate(1)} aria-label={t("chart.next")}><ChevronRight className="size-4" /></Button>
          </div>
        </div>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{fmtRange()}</div>

      {habitsFiltered.length === 0 ? (
        <div className="mt-6 text-center text-xs text-muted-foreground">—</div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          {/* Day-of-week header for week view */}
          {period === "week" && (
            <div className="grid grid-cols-[minmax(140px,1fr)_repeat(7,minmax(28px,1fr))] gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <div />
              {days.map((d, i) => (
                <div key={d} className="flex flex-col items-center">
                  <span>{t(dowKeys[i])}</span>
                  <span className={cn("font-mono text-[10px]", d === todayStr && "text-primary")}>{Number(d.slice(8, 10))}</span>
                </div>
              ))}
            </div>
          )}
          {period === "month" && (
            <div className="mb-2 grid gap-1 text-[10px] text-muted-foreground" style={{ gridTemplateColumns: `minmax(140px,1fr) repeat(${days.length}, minmax(18px,1fr))` }}>
              <div />
              {days.map((d) => (
                <div key={d} className={cn("text-center font-mono", d === todayStr && "text-primary")}>{Number(d.slice(8, 10))}</div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            {habitsFiltered.map((h, idx) => {
              const set = logsByHabit.get(h.id) ?? new Set();
              const color = h.color || PALETTE[idx % PALETTE.length];
              const cols = period === "day" ? 1 : days.length;
              return (
                <div
                  key={h.id}
                  className="grid items-center gap-1"
                  style={{ gridTemplateColumns: `minmax(140px,1fr) repeat(${cols}, minmax(${period === "month" ? "18px" : "28px"},1fr))` }}
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">{h.name}</div>
                      {h.category && <div className="truncate text-[10px] text-muted-foreground">{h.category}</div>}
                    </div>
                  </div>
                  {days.map((d) => {
                    const done = set.has(d);
                    const isToday = d === todayStr;
                    return (
                      <div
                        key={d}
                        title={`${d}${done ? " ✓" : ""}`}
                        className={cn(
                          "flex aspect-square items-center justify-center rounded border text-[10px] transition",
                          done ? "border-transparent text-background" : "border-border/40 bg-muted/20 text-muted-foreground/40",
                          isToday && !done && "ring-1 ring-primary/60",
                        )}
                        style={done ? { backgroundColor: color } : undefined}
                      >
                        {done && period !== "month" && <Check className="size-3" strokeWidth={3} />}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}