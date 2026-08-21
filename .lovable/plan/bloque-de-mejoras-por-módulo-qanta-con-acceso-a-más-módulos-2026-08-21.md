# Bloque de mejoras por módulo + Qanta con acceso a más módulos

Dos partes independientes: (A) nuevas herramientas de IA para Qanta, (B) mejoras concretas de módulos.

## Parte A — Qanta: de 6 a 16 herramientas

Hoy Qanta puede: agendar evento, crear empleado, ajustar stock, buscar documento, listar bancos y registrar compra/gasto. Le faltan CRM, Ventas, Proyectos, RRHH, Recordatorios, Aprobaciones y consultas de reportes.

Nuevas herramientas (todas resuelven `org_id` en el servidor, siguen `resolveOrgWithModuleAccess` del módulo correspondiente, quedan auditadas en `ai_actions` y solo se exponen a owner/admin, igual que hoy):

CRM (`/crm`)
- `crm_create_contact` — crea contacto (nombre, email, teléfono, empresa).
- `crm_create_deal` — crea oportunidad (título, contacto, monto, etapa).
- `crm_move_deal` — mueve una oportunidad de etapa por nombre ("pasa el negocio X a negociación").
- `crm_log_activity` — registra nota/llamada/reunión sobre un contacto o negocio.

Ventas (`/sales`)
- `sales_create_invoice` — crea factura borrador para un cliente con líneas (descripción, cantidad, precio, IVA); resuelve o crea el cliente por nombre.
- `sales_register_payment` — registra pago sobre una factura por número.
- `sales_overdue_summary` — facturas vencidas y cartera pendiente (lectura).

Proyectos (`/projects`)
- `project_create_task` — crea tarea con prioridad, responsable (por nombre de empleado) y fecha límite.
- `project_log_time` — registra horas en un proyecto/tarea.

RRHH (`/hr`)
- `hr_request_leave` — crea solicitud de ausencia para un empleado por nombre.
- `hr_team_directory` — consulta directorio (nombre, cargo, id de empleado) (lectura).

Recordatorios y aprobaciones
- `create_reminder` — crea recordatorio con destino email del empleado seleccionado por nombre (`/agenda`).
- `create_approval` — abre una solicitud de aprobación (`/approvals`).

Reportes (lectura)
- `financial_indicators` — devuelve los 6 ratios ya calculados en `getFinancialIndicators` para que Qanta los interprete.

Reglas transversales:
- Resolución difusa por nombre (empleado, cliente, contacto, proyecto, cuenta): si hay ambigüedad la herramienta devuelve las opciones y Qanta pregunta, no adivina.
- Nada destructivo: sin herramientas de borrado ni de emisión definitiva de factura/nómina; las facturas se crean en borrador.
- El prompt del sistema se amplía con un resumen corto de CRM (pipeline por etapa), cartera de ventas y proyectos activos para que responda con datos sin llamar herramientas.

## Parte B — Mejoras de módulos

1. Dashboard: tarjetas accionables con cartera vencida, negocios por cerrar este mes, stock crítico y aprobaciones pendientes, cada una enlazando a su módulo.
2. CRM: valor ponderado del pipeline por etapa, filtro por responsable y aviso de negocios sin actividad en 14+ días.
3. Ventas: estado calculado de la factura (borrador / emitida / parcial / pagada / vencida) con badges, saldo pendiente por cliente y vista de antigüedad de cartera (0-30, 31-60, 61-90, +90).
4. Inventario: valorización de stock (cantidad × costo), rotación por producto en los últimos 90 días y sugerencia de cantidad a reordenar.
5. Proyectos: horas registradas vs. presupuesto con barra de progreso y margen estimado del proyecto.
6. RRHH: calendario de ausencias del mes y resumen de días disponibles por empleado.
7. Reportes: comparativo mes vs. mes anterior por bucket y exportación del set completo de indicadores a CSV/PDF con la utilidad existente.
8. Agenda: búsqueda unificada sobre eventos, tareas, hábitos y recordatorios.

## Notas técnicas

- Sin migraciones nuevas: todo se apoya en tablas existentes (`crm_*`, `sales_*`, `projects`, `tasks`, `time_entries`, `hr_leaves`, `team_members`, `reminders`, `approvals`, `fin_*`).
- Las herramientas nuevas reutilizan la lógica de las `*.functions.ts` existentes; la parte que hoy vive dentro de un `createServerFn` se extrae a helpers `*.server.ts` cuando haga falta compartirla, para no llamar stubs RPC desde el handler del asistente.
- `src/lib/assistant.functions.ts` ya es grande; las nuevas herramientas se agrupan en módulos `src/lib/assistant-tools/<modulo>.server.ts` y se ensamblan en el handler, manteniendo el archivo de server functions como envoltorio delgado.
- Cada mejora de la Parte B es solo UI + agregaciones sobre datos ya consultados.

## Orden sugerido

1. Parte A: CRM + Ventas + Recordatorios (mayor impacto conversacional).
2. Parte A: Proyectos + RRHH + Aprobaciones + indicadores.
3. Parte B: puntos 1-4, luego 5-8.
