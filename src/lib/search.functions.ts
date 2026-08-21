import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveOrgId } from "./org-helpers";

export type SearchHit = {
  id: string;
  group: string;
  title: string;
  detail?: string;
  href: string;
};

export const globalSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().min(2).max(80) }).parse(d))
  .handler(async ({ context, data }): Promise<SearchHit[]> => {
    const orgId = await resolveActiveOrgId(context.supabase, context.userId);
    const like = `%${data.q.replace(/[%_]/g, "")}%`;
    const [contacts, deals, customers, products, projects, tasks, events, docs, team] = await Promise.all([
      context.supabase.from("crm_contacts").select("id,name,company,email").eq("org_id", orgId).ilike("name", like).limit(5),
      context.supabase.from("crm_deals").select("id,title,amount,stage").eq("org_id", orgId).ilike("title", like).limit(5),
      context.supabase.from("sales_customers").select("id,name,email").eq("org_id", orgId).ilike("name", like).limit(5),
      context.supabase.from("inv_products").select("id,name,sku,stock").eq("org_id", orgId).ilike("name", like).limit(5),
      context.supabase.from("projects").select("id,name,status").eq("org_id", orgId).ilike("name", like).limit(5),
      context.supabase.from("tasks").select("id,title,status,due_date").eq("org_id", orgId).ilike("title", like).limit(5),
      context.supabase.from("events").select("id,title,starts_at").eq("org_id", orgId).ilike("title", like).limit(5),
      context.supabase.from("documents").select("id,name").eq("org_id", orgId).ilike("name", like).limit(5),
      context.supabase.from("team_members").select("id,full_name,position").eq("org_id", orgId).ilike("full_name", like).limit(5),
    ]);

    const hits: SearchHit[] = [];
    for (const r of contacts.data ?? [])
      hits.push({ id: `contact:${r.id}`, group: "CRM · Contactos", title: r.name, detail: r.company ?? r.email ?? undefined, href: "/crm" });
    for (const r of deals.data ?? [])
      hits.push({ id: `deal:${r.id}`, group: "CRM · Negocios", title: r.title, detail: String(r.stage ?? ""), href: "/crm" });
    for (const r of customers.data ?? [])
      hits.push({ id: `cust:${r.id}`, group: "Ventas · Clientes", title: r.name, detail: r.email ?? undefined, href: "/sales" });
    for (const r of products.data ?? [])
      hits.push({ id: `prod:${r.id}`, group: "Inventario", title: r.name, detail: `${r.sku ?? ""} · stock ${Number(r.stock ?? 0)}`, href: "/inventory" });
    for (const r of projects.data ?? [])
      hits.push({ id: `proj:${r.id}`, group: "Proyectos", title: r.name, detail: String(r.status ?? ""), href: "/projects" });
    for (const r of tasks.data ?? [])
      hits.push({ id: `task:${r.id}`, group: "Tareas", title: r.title, detail: r.due_date ? String(r.due_date).slice(0, 10) : undefined, href: "/agenda" });
    for (const r of events.data ?? [])
      hits.push({ id: `event:${r.id}`, group: "Agenda", title: r.title, detail: r.starts_at ? new Date(r.starts_at).toLocaleString() : undefined, href: "/agenda" });
    for (const r of docs.data ?? [])
      hits.push({ id: `doc:${r.id}`, group: "Documentos", title: r.name, href: "/documents" });
    for (const r of team.data ?? [])
      hits.push({ id: `team:${r.id}`, group: "Equipo", title: (r as { full_name: string }).full_name, detail: (r as { position: string | null }).position ?? undefined, href: "/team" });

    return hits;
  });
