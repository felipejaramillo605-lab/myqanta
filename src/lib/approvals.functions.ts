import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveOrgId } from "./org-helpers";
import { resolveOrgWithRole } from "./permissions";

/**
 * Generic approvals engine (Fase 1).
 * Any business module (purchase orders, legal contracts, journal entries, ...)
 * can create an `approval` record + linked task. Only the `assigned_to` user
 * (the approver) can change the decision. Everyone in the org can read and
 * comment.
 */

const ApprovalStatus = z.enum(["pending", "in_review", "approved", "rejected"]);

const CreateInput = z.object({
  module: z.string().min(1).max(64),
  entity_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  assigned_to: z.string().uuid(),
  due_date: z.string().nullable().optional(),
});

export const listApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("approvals")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listApprovalComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ approval_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("approval_comments")
      .select("*")
      .eq("approval_id", data.approval_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrgWithRole(context.supabase, context.userId, "member");

    // Verify assignee is a member of the org — prevents assigning outside the org.
    const { data: membership, error: mErr } = await context.supabase
      .from("organization_members")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("user_id", data.assigned_to)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!membership) throw new Error("El aprobador debe ser miembro de la organización.");

    const { data: approval, error } = await context.supabase
      .from("approvals")
      .insert({
        org_id: orgId,
        module: data.module,
        entity_id: data.entity_id ?? null,
        title: data.title,
        description: data.description ?? null,
        assigned_to: data.assigned_to,
        requested_by: context.userId,
        status: "pending",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Auto-create a linked task assigned to the approver — this is the
    // "bandeja de entrada universal" pattern from the plan.
    const { error: tErr } = await context.supabase.from("tasks").insert({
      org_id: orgId,
      user_id: context.userId,
      title: `[${data.module}] ${data.title}`,
      description: data.description ?? null,
      status: "todo",
      priority: "medium",
      due_date: data.due_date ?? null,
      assigned_to: data.assigned_to,
      approval_id: approval.id,
      approval_status: "pending",
      source_module: data.module,
    });
    if (tErr) throw new Error(tErr.message);

    return approval;
  });

export const decideApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      decision: z.enum(["in_review", "approved", "rejected"]),
      rejection_reason: z.string().trim().max(1000).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: approval, error: rErr } = await context.supabase
      .from("approvals")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!approval) throw new Error("Aprobación no encontrada.");

    // Solo el asignado puede decidir. Los demás pueden ver y comentar.
    if (approval.assigned_to !== context.userId) {
      throw new Error("Solo el aprobador asignado puede cambiar el estado.");
    }
    if (data.decision === "rejected" && !(data.rejection_reason && data.rejection_reason.trim().length > 0)) {
      throw new Error("Debes indicar el motivo del rechazo.");
    }

    const now = new Date().toISOString();
    const patch = {
      status: data.decision,
      rejection_reason: data.decision === "rejected" ? data.rejection_reason : null,
      decided_at: data.decision === "in_review" ? null : now,
    };
    const { error: uErr } = await context.supabase
      .from("approvals")
      .update(patch)
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);

    // Sync linked task
    const taskStatus =
      data.decision === "approved" ? "done" :
      data.decision === "rejected" ? "archived" :
      "doing";
    await context.supabase
      .from("tasks")
      .update({
        approval_status: data.decision,
        status: taskStatus,
        completed_at: data.decision === "approved" ? now : null,
      })
      .eq("approval_id", data.id);

    return { ok: true, status: data.decision };
  });

export const addApprovalComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      approval_id: z.string().uuid(),
      body: z.string().trim().min(1).max(2000),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    // Ensure the approval belongs to the caller's active org.
    const { data: approval, error } = await context.supabase
      .from("approvals")
      .select("org_id")
      .eq("id", data.approval_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!approval || approval.org_id !== orgId) throw new Error("Aprobación no encontrada.");

    const { data: row, error: cErr } = await context.supabase
      .from("approval_comments")
      .insert({
        approval_id: data.approval_id,
        org_id: orgId,
        author_id: context.userId,
        body: data.body,
      })
      .select()
      .single();
    if (cErr) throw new Error(cErr.message);
    return row;
  });

export const deleteApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("approvals")
      .delete()
      .eq("id", data.id)
      .eq("org_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type ApprovalStatusValue = z.infer<typeof ApprovalStatus>;