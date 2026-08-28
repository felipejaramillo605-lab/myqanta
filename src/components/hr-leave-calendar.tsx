import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

type Leave = {
  id: string;
  member_id: string | null;
  kind: string;
  status: string;
  start_date: string;
  end_date: string;
  days: number;
};
export type HolidayMark = { date: string; name: string };
type Member = { id: string; full_name: string; vacation_days_available?: number | null; archived?: boolean };

const KIND_DOT: Record<string, string> = {
  vacation: "bg-emerald-500",
  sick: "bg-rose-500",
  permission: "bg-amber-500",
  unpaid: "bg-slate-400",
};

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function HrLeaveCalendar({
  leaves,
  members,
  holidays = [],
}: {
  leaves: Leave[];
  members: Member[];
  holidays?: HolidayMark[];
}) {
  const { t } = useI18n();
  const today = new Date();
  const holidayByDate = useMemo(
    () => new Map(holidays.map((h) => [h.date.slice(0, 10), h.name])),
    [holidays],
  );
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const nameById = useMemo(() => new Map(members.map((m) => [m.id, m.full_name])), [members]);

  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const lead = (first.getDay() + 6) % 7; // semana empieza lunes
    const cells: Array<{ date: Date | null; key: string }> = [];
    for (let i = 0; i < lead; i++) cells.push({ date: null, key: `pad-${i}` });
    for (let d = 1; d <= last.getDate(); d++) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), d);
      cells.push({ date, key: ymd(date) });
    }
    return cells;
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = new Map<string, Leave[]>();
    for (const l of leaves) {
      if (l.status === "rejected") continue;
      const start = new Date(l.start_date + "T00:00:00");
      const end = new Date(l.end_date + "T00:00:00");
      for (const c of days) {
        if (!c.date) continue;
        if (c.date >= start && c.date <= end) {
          map.set(c.key, [...(map.get(c.key) ?? []), l]);
        }
      }
    }
    return map;
  }, [leaves, days]);

  const balances = useMemo(() => {
    const year = cursor.getFullYear();
    return members
      .filter((m) => !m.archived)
      .map((m) => {
        const used = leaves
          .filter(
            (l) =>
              l.member_id === m.id &&
              l.kind === "vacation" &&
              l.status === "approved" &&
              new Date(l.start_date).getFullYear() === year,
          )
          .reduce((s, l) => s + Number(l.days ?? 0), 0);
        const total = Number(m.vacation_days_available ?? 0);
        return { id: m.id, name: m.full_name, used, total, left: Math.max(total - used, 0) };
      });
  }, [members, leaves, cursor]);

  const monthLabel = cursor.toLocaleDateString("es", { month: "long", year: "numeric" });

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <div className="glass rounded-2xl p-4 lg:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium capitalize">{monthLabel}</h3>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Mes anterior"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Mes siguiente"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase text-muted-foreground">
          {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
            <div key={`${d}${i}`}>{d}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {days.map((c) => {
            const items = c.date ? (byDay.get(c.key) ?? []) : [];
            const isToday = c.date && ymd(c.date) === ymd(today);
            const holidayName = c.date ? holidayByDate.get(c.key) : undefined;
            return (
              <div
                key={c.key}
                className={
                  "min-h-16 rounded-lg border p-1 text-left text-[11px] " +
                  (c.date
                    ? holidayName
                      ? "border-sky-500/40 bg-sky-500/10 "
                      : "border-border/40 bg-background/40 "
                    : "border-transparent ") +
                  (isToday ? "ring-1 ring-primary" : "")
                }
              >
                {c.date && <div className="font-mono text-[10px] text-muted-foreground">{c.date.getDate()}</div>}
                <div className="space-y-0.5">
                  {holidayName && (
                    <div className="flex items-center gap-1 truncate text-sky-600 dark:text-sky-400" title={holidayName}>
                      <span className="size-1.5 shrink-0 rounded-full bg-sky-500" />
                      <span className="truncate">{holidayName}</span>
                    </div>
                  )}
                  {items.slice(0, 3).map((l) => (
                    <div key={l.id} className="flex items-center gap-1 truncate">
                      <span className={"size-1.5 shrink-0 rounded-full " + (KIND_DOT[l.kind] ?? "bg-primary")} />
                      <span className="truncate">{nameById.get(l.member_id ?? "") ?? "—"}</span>
                    </div>
                  ))}
                  {items.length > 3 && (
                    <div className="font-mono text-[9px] text-muted-foreground">+{items.length - 3}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          {Object.entries({ vacation: "Vacaciones", sick: "Baja médica", permission: "Permiso", unpaid: "Sin sueldo" }).map(
            ([k, label]) => (
              <span key={k} className="flex items-center gap-1">
                <span className={"size-1.5 rounded-full " + KIND_DOT[k]} /> {label}
              </span>
            ),
          )}
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-sky-500" /> {t("hr.holiday")}
          </span>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">{t("hr.business_days_note")}</p>
      </div>

      <div className="glass rounded-2xl p-4">
        <h3 className="text-sm font-medium">Vacaciones {cursor.getFullYear()}</h3>
        <p className="text-xs text-muted-foreground">Días disponibles vs. aprobados por persona.</p>
        <ul className="mt-3 space-y-2">
          {balances.length === 0 && <li className="text-xs text-muted-foreground">Sin personal registrado.</li>}
          {balances.map((b) => (
            <li key={b.id} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate">{b.name}</span>
                <span className="font-mono text-muted-foreground">
                  {b.left}/{b.total || 0} d
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${b.total > 0 ? Math.min((b.used / b.total) * 100, 100) : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
