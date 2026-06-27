import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays } from "lucide-react";
import { getHabitsHeatmap } from "@/lib/productivity.functions";
import { useI18n } from "@/lib/i18n";

function buildWeeks(fromStr: string) {
  const start = new Date(fromStr + "T00:00:00Z");
  // back up to previous Sunday to align grid
  const day = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - day);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
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

  const weeks = buildWeeks(data.from);
  const totalByDate = new Map<string, number>();
  for (const l of data.logs) {
    totalByDate.set(l.logged_on, (totalByDate.get(l.logged_on) ?? 0) + 1);
  }
  const habitCount = Math.max(data.habits.length, 1);
  const maxLevel = 4;

  function level(date: string) {
    const n = totalByDate.get(date) ?? 0;
    if (n === 0) return 0;
    const ratio = n / habitCount;
    return Math.min(maxLevel, Math.max(1, Math.ceil(ratio * maxLevel)));
  }

  const cellColor = ["bg-muted/30", "bg-primary/20", "bg-primary/40", "bg-primary/65", "bg-primary"];

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
      <div className="mt-4 overflow-x-auto">
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
    </section>
  );
}