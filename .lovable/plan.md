# Estado de Qanta

## Fases completadas

**1. Arquitectura y seguridad** — completa
- RLS estricto en todas las tablas (finanzas, inventario, productividad, agenda, perfiles).
- Roles `user` y `admin_manager` en tabla separada `user_roles` + función `has_role` SECURITY DEFINER.
- Panel `/admin/theme` exclusivo para `admin_manager` con edición en vivo de variables CSS globales.

**2. Diseño high-tech** — completo
- Estética dark SpaceX-like, tarjetas/modales `liquid glass`, OKLCH tokens, Inter + JetBrains Mono.
- Bilingüe ES/EN, modo oscuro por defecto.

**3. Módulos principales** — completos
- **A. Dashboard** (`/dashboard`): KPIs vivos del mes vs anterior, alertas de stock mínimo con botón "Reponer".
- **B. Finanzas + EBITDA** (`/finance`): cuentas, transacciones, buckets EBITDA, análisis de extractos con Gemini 2.5 Flash.
- **C. Compras/Inventario** (`/inventory`): productos, movimientos auto-stock, OCR de facturas con Gemini, alertas de mínimo, órdenes de compra prellenadas.
- **D. Productividad/Agenda** (`/habits`, `/agenda`): Kanban de tareas, hábitos con racha + heatmap 7 días, timeline de eventos.

## Fase 2 propuesta — Inteligencia, reportes y colaboración

### 2.1 Visualizaciones avanzadas
- Gráficos en Dashboard y Finanzas con `recharts`: serie temporal de EBITDA por mes (12 últimos), waterfall ingresos → EBITDA → neto, donut por bucket.
- Heatmap anual de hábitos (estilo GitHub).
- Curva de stock por producto en Inventario.

### 2.2 Reportes y exportación
- Exportar transacciones, movimientos y facturas a CSV.
- Reporte EBITDA mensual descargable (PDF generado en el cliente con `jspdf`).
- Vista "Cierre de mes" con resumen ejecutivo redactado por Gemini.

### 2.3 Equipos B2B (multi-organización)
- Tabla `organizations` + `organization_members` con rol por organización (`owner`, `admin`, `member`, `viewer`).
- Selector de organización activa en el shell; todas las tablas existentes ganan `org_id` con políticas RLS basadas en membresía.
- Invitaciones por email mediante server function + Lovable Cloud Auth.

### 2.4 Notificaciones y agente IA
- Centro de notificaciones in-app (bandeja persistente): stock bajo, tareas vencidas, eventos próximos.
- Chatbot lateral "Qanta AI" con contexto del usuario (resumen financiero, tareas, stock) usando Gemini con tools para crear tareas / transacciones por lenguaje natural.

### 2.5 PWA + móvil
- Manifest + service worker (instalable, offline básico para lectura del dashboard).
- Atajos: "Nueva transacción", "Escanear factura", "Nueva tarea".

## Orden sugerido de ejecución

1. **2.1 Visualizaciones** — alto impacto visual, sin cambios de esquema.
2. **2.2 Reportes/exportación** — completa el ciclo financiero.
3. **2.4 Notificaciones + agente IA** — diferenciador clave.
4. **2.3 Equipos B2B** — más invasivo (migración con `org_id` en cada tabla); va después para no re-trabajar.
5. **2.5 PWA** — capa final.

## Detalles técnicos

- Dependencias nuevas previstas: `recharts` (ya común en shadcn), `jspdf` + `jspdf-autotable`, `vite-plugin-pwa`.
- IA: seguir usando Lovable AI Gateway con `google/gemini-2.5-flash` (gratis durante el periodo promocional) para resúmenes, agente y clasificación.
- B2B: migración en una sola transacción añadiendo `org_id uuid` a `finance_*`, `inv_*`, `tasks`, `habits`, `events`, con backfill a una org "personal" auto-creada por usuario y nuevas policies que combinan `auth.uid()` con `organization_members`.
- Notificaciones: tabla `notifications` (user_id, org_id, kind, payload jsonb, read_at) + realtime channel; generación server-side al crear movimientos/tareas.

## Próximo paso

Confirma este orden o reordena las sub-fases. Si te parece, arranco con **2.1 Visualizaciones avanzadas** en el siguiente turno.
