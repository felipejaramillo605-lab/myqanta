// Lista canónica de módulos que un manager puede habilitar/deshabilitar
// por rol personalizado. La `key` coincide exactamente con el `to`
// usado en app-shell.tsx para que sirva de identificador y de ruta.
export type ModuleDef = { key: string; label: string; group: string };

export const MODULE_REGISTRY: ModuleDef[] = [
  // Finanzas
  { key: "/finance", label: "Resumen financiero", group: "Finanzas" },
  { key: "/finance/journal", label: "Asientos contables", group: "Finanzas" },
  { key: "/finance/policies", label: "Políticas contables", group: "Finanzas" },
  { key: "/finance/parties", label: "Matriz de terceros", group: "Finanzas" },
  { key: "/finance/banks", label: "Bancos", group: "Finanzas" },
  { key: "/finance/taxes", label: "Impuestos", group: "Finanzas" },
  { key: "/finance/reconciliation", label: "Conciliación bancaria", group: "Finanzas" },
  { key: "/finance/balances", label: "Balances", group: "Finanzas" },
  { key: "/finance/statements", label: "Estados financieros", group: "Finanzas" },
  { key: "/finance/assets", label: "Activos fijos y depreciación", group: "Finanzas" },
  { key: "/finance/budgets", label: "Presupuestos y flujo de caja", group: "Finanzas" },
  { key: "/inventory", label: "Compras / Inventario", group: "Finanzas" },
  { key: "/sales", label: "Ventas", group: "Finanzas" },
  // RRHH
  { key: "/hr", label: "Personal / Ausencias / Nómina", group: "RRHH" },
  { key: "/hr/org-chart", label: "Organigrama", group: "RRHH" },
  { key: "/hr/attendance", label: "Asistencia", group: "RRHH" },
  { key: "/agenda", label: "Agenda", group: "RRHH" },
  { key: "/documents", label: "Documentos", group: "RRHH" },
  { key: "/team", label: "Equipo", group: "RRHH" },
  // Otros
  { key: "/crm", label: "CRM", group: "Otros" },
  { key: "/projects", label: "Proyectos", group: "Otros" },
  { key: "/approvals", label: "Aprobaciones", group: "Otros" },
  { key: "/reports", label: "Reportes", group: "Otros" },
];

export const MODULE_KEYS = MODULE_REGISTRY.map((m) => m.key);

export function groupedModules(): Array<{ group: string; items: ModuleDef[] }> {
  const groups = Array.from(new Set(MODULE_REGISTRY.map((m) => m.group)));
  return groups.map((group) => ({
    group,
    items: MODULE_REGISTRY.filter((m) => m.group === group),
  }));
}