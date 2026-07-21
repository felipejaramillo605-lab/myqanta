import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { resolveActiveOrgId } from "./org-helpers";
import { resolveOrgWithRole , resolveOrgWithModuleAccess } from "./permissions";

// ===== Tasks =====
const TaskStatus = z.enum(["todo", "doing", "done", "archived"]);
const TaskPriority = z.enum(["low", "medium", "high", "urgent"]);

export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("tasks")
      .select("*")
      .eq("org_id", orgId)
      .neq("status", "archived")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const TaskInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  status: TaskStatus.default("todo"),
  priority: TaskPriority.default("medium"),
  due_date: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
});

export const upsertTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TaskInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/agenda", "member");
    const payload = {
      ...data,
      user_id: context.userId,
      org_id: orgId,
      completed_at: data.status === "done" ? new Date().toISOString() : null,
    };
    const { data: out, error } = await context.supabase
      .from("tasks").upsert(payload).select().single();
    if (error) throw new Error(error.message);
    return out;
  });

export const setTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: TaskStatus }).parse(d))
  .handler(async ({ context, data }) => {
    await resolveOrgWithModuleAccess(context.supabase, context.userId, "/agenda", "member");
    const { error } = await context.supabase
      .from("tasks")
      .update({ status: data.status, completed_at: data.status === "done" ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await resolveOrgWithModuleAccess(context.supabase, context.userId, "/agenda", "member");
    const { error } = await context.supabase.from("tasks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Habits =====
export const listHabits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const today = new Date().toISOString().slice(0, 10);
    const fromDate = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const [{ data: habits, error: e1 }, { data: logs, error: e2 }] = await Promise.all([
      context.supabase.from("habits").select("*").eq("org_id", orgId).eq("archived", false).order("created_at"),
      context.supabase.from("habit_logs").select("*").eq("org_id", orgId).gte("logged_on", fromDate),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    return { habits: habits ?? [], logs: logs ?? [], today };
  });

export const createHabit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().min(1),
      cadence: z.string().default("daily"),
      target_per_period: z.number().int().min(1).default(1),
      color: z.string().optional().nullable(),
      category: z.string().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/agenda", "member");
    const { data: out, error } = await context.supabase
      .from("habits").insert({ ...data, user_id: context.userId, org_id: orgId }).select().single();
    if (error) throw new Error(error.message);
    return out;
  });

export const updateHabit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).optional(),
      target_per_period: z.number().int().min(1).optional(),
      color: z.string().optional().nullable(),
      category: z.string().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await resolveOrgWithModuleAccess(context.supabase, context.userId, "/agenda", "member");
    const { id, ...patch } = data;
    const { data: out, error } = await context.supabase
      .from("habits").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return out;
  });

export const toggleHabitToday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      habit_id: z.string().uuid(),
      // ISO date YYYY-MM-DD; defaults to today when omitted.
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/agenda", "member");
    const target = data.date ?? new Date().toISOString().slice(0, 10);
    // Rechaza fechas futuras — con 1 día de tolerancia para diferencias de
    // zona horaria entre el navegador del usuario y UTC del servidor.
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    if (target > tomorrow.toISOString().slice(0, 10)) {
      throw new Error("No se puede marcar un hábito en el futuro");
    }
    const { data: existing } = await context.supabase
      .from("habit_logs").select("id").eq("habit_id", data.habit_id).eq("logged_on", target).maybeSingle();
    if (existing) {
      await context.supabase.from("habit_logs").delete().eq("id", existing.id);
      return { done: false };
    }
    await context.supabase.from("habit_logs").insert({
      user_id: context.userId, org_id: orgId, habit_id: data.habit_id, logged_on: target, count: 1,
    });
    return { done: true };
  });

export const deleteHabit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await resolveOrgWithModuleAccess(context.supabase, context.userId, "/agenda", "member");
    const { error } = await context.supabase.from("habits").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Events =====
export const listEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ from: z.string().optional(), to: z.string().optional() }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    let q = context.supabase.from("events").select("*").eq("org_id", orgId).order("starts_at");
    if (data.from) q = q.gte("starts_at", data.from);
    if (data.to) q = q.lt("starts_at", data.to);
    const { data: out, error } = await q;
    if (error) throw new Error(error.message);
    return out ?? [];
  });

const EventInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  starts_at: z.string(),
  ends_at: z.string(),
  all_day: z.boolean().default(false),
  color: z.string().optional().nullable(),
});

export const upsertEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => EventInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithModuleAccess(context.supabase, context.userId, "/agenda", "member");
    const { data: out, error } = await context.supabase
      .from("events").upsert({ ...data, user_id: context.userId, org_id: orgId }).select().single();
    if (error) throw new Error(error.message);
    return out;
  });

export const deleteEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await resolveOrgWithModuleAccess(context.supabase, context.userId, "/agenda", "member");
    const { error } = await context.supabase.from("events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Habit yearly heatmap =====
export const getHabitsHeatmap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - 364);
    const fromStr = from.toISOString().slice(0, 10);
    const [{ data: habits, error: e1 }, { data: logs, error: e2 }] = await Promise.all([
      context.supabase.from("habits").select("id,name,color,category").eq("org_id", orgId).eq("archived", false).order("created_at"),
      context.supabase.from("habit_logs").select("habit_id,logged_on").eq("org_id", orgId).gte("logged_on", fromStr),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    return { habits: habits ?? [], logs: logs ?? [], from: fromStr };
  });