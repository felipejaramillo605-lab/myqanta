
## Diagnóstico rápido

**Ya está listo:**
- Consola de plataforma (`/admin/platform`): lista de usuarios, orgs, bloquear/reactivar.
- Bitácora de seguridad (`/admin/security-log`): filtros por severidad/tipo/búsqueda, auto-refresh 30s.
- Roles `platform_owner` / `admin_manager` / `user`, RLS estricta, `security_events` con RPC `log_security_event`.
- Módulos base: Dashboard, Finanzas+EBITDA, Inventario/Compras, Hábitos, Agenda, Recordatorios (Email+WhatsApp), Equipo, Notificaciones, PWA, Asistente IA.

**Pendiente detectado del plan (`.lovable/plan.md`) y de tu petición:**
1. No hay panel de **tráfico/actividad por usuario** (rate de requests, picos, geo/IP repetida, ratio de fallos) — hoy solo se registran eventos discretos, no volumetría.
2. Faltan **módulos tipo ERP** para completar el uso personal/empresarial: CRM ligero, Ventas/Facturación, RRHH, Proyectos, Documentos, Reportería consolidada.

---

## Plan propuesto

### Fase A — Consola del owner: tráfico y detección de abuso

**A1. Métricas de tráfico por usuario (nueva pestaña "Actividad" en `/admin/platform`)**
- Tabla nueva `request_metrics` (user_id nullable, path, method, status, duration_ms, ip_hash, ua_hash, occurred_at) + índices por `user_id, occurred_at` y `ip_hash, occurred_at`.
- Middleware ligero en `src/start.ts` (functionMiddleware) + wrapper en rutas `api/*` que inserta la métrica async (fire-and-forget con `supabaseAdmin`).
- Vistas SQL materializadas cada 5 min:
  - `mv_requests_per_user_hour` → serie temporal por usuario.
  - `mv_top_ips_24h` → IPs con más peticiones y ratio de 4xx/5xx.
  - `mv_failed_logins_24h` → derivada de `security_events` tipo `login_failed`.

**A2. Panel "Seguridad y tráfico"** en `/admin/platform`
- KPIs: peticiones últimas 24h, usuarios activos, IPs únicas, ratio errores 4xx/5xx, logins fallidos, cuentas bloqueadas.
- Gráficos (recharts): requests/hora 24h, top 10 usuarios por volumen, top 10 IPs, heatmap login fallidos por hora.
- Tabla "sospechosos": usuarios/IPs con score > umbral (regla: >N req/min, >X 4xx consecutivos, logins fallidos ≥5 en 15 min, acceso desde >3 IPs en 1h).
- Acción rápida: bloquear usuario, marcar IP como observada (`ip_watchlist`).

**A3. Alertas automáticas**
- Trigger en `security_events` severity=critical → `notifications` para todos los `platform_owner`.
- Cron `pg_cron` cada 5 min recalcula MVs y evalúa reglas → inserta `security_events` sintéticos (`suspicious_activity`).

---

### Fase B — Módulos ERP faltantes

Priorizados por impacto vs. esfuerzo. Cada módulo hereda `org_id` + RLS + rol.

**B1. CRM (leads, clientes, oportunidades)**
- Tablas: `crm_contacts`, `crm_deals` (etapa kanban), `crm_activities` (llamadas/mails/notas).
- Ruta `/crm` con kanban de pipeline + ficha de contacto.
- Enlaza a `finance_transactions` (deal ganado → factura) y `team_members` (owner del deal).

**B2. Ventas y facturación**
- Tablas: `sales_quotes`, `sales_invoices`, `sales_invoice_items`, `sales_payments`.
- Generación PDF (jsPDF), numeración por org, estados (borrador/emitida/pagada/vencida).
- Integración con Inventario (descuenta stock al emitir) y Finanzas (crea transacción al cobrar).
- Ruta `/sales` con lista + editor.

**B3. Proyectos y tiempos**
- Tablas: `projects`, `project_members`, `time_entries`.
- Vista Gantt-lite + timesheet semanal. Enlaza tareas existentes (`tasks.project_id`).
- Ruta `/projects`.

**B4. RRHH / Nómina básica**
- Extiende `team_members` con: contrato, salario base, fecha ingreso, vacaciones disponibles.
- Tablas: `hr_leaves` (solicitudes vacaciones/permisos), `hr_payroll_runs`.
- Ruta `/hr` con calendario de ausencias + generador mensual de nómina (crea gasto en Finanzas).

**B5. Documentos**
- Bucket Storage `documents` + tabla `documents` (metadatos, org_id, tags, entidad relacionada).
- Drag&drop, previsualización PDF/imagen, búsqueda full-text con Gemini para OCR de PDFs escaneados.
- Ruta `/documents`.

**B6. Reportería consolidada**
- Ruta `/reports`: constructor de reportes (elige módulo → dimensiones → medidas → gráfico).
- Programación de envío por email (Gmail connector) semanal/mensual.
- Export PDF/CSV, guardar reportes favoritos.

**B7. Configuración de empresa (extensión de `/team` → `/settings/company`)**
- Datos fiscales, logo, series de facturación, tipos de IVA, monedas, plantillas de email.

---

## Detalles técnicos

- **Métricas**: para no penalizar latencia, `request_metrics` se inserta con `pg_net` async o batch cada 30s en memoria del worker. Retención 30 días (cron de limpieza).
- **IP hashing**: SHA-256 con salt por org — no se guarda IP en claro para GDPR.
- **RLS**: todas las nuevas tablas usan `can_write_org()` + `is_org_member()`. `request_metrics` solo lectura para `platform_owner` global; usuarios ven las suyas.
- **Rate limiting** (opcional, requiere confirmación): edge middleware con token bucket en KV — hoy no hay primitiva estándar, se documentaría el trade-off.
- **Dependencias nuevas**: ninguna crítica (jsPDF, recharts ya instalados). Storage bucket para documentos.
- **Migraciones**: una por fase para minimizar riesgo. B1→B7 pueden entregarse incrementalmente.

---

## Orden sugerido

1. **A1+A2+A3** ✅ entregado — consola `/admin/security` con métricas, sospechosos, watchlist.
2. **B2 Ventas** ✅ entregado — `/sales` con clientes, facturas (borrador → emitida → pagada/anulada), líneas con producto/IVA, cobros que crean transacción en Finanzas, descarga PDF y descuento automático de stock.
3. **B1 CRM** ✅ entregado — `/crm` con kanban de pipeline, contactos y actividades.
4. **B3 Proyectos** ✅ entregado — `/projects` con CRUD de proyectos, estados, presupuesto y timesheet por proyecto.
5. **B4 RRHH** ✅ entregado — `/hr` con fichas de contrato, ausencias con aprobación y generador mensual de nómina que crea gasto en Finanzas al cerrarse.
6. **B5 Documentos** ✅ entregado — `/documents` con bucket privado, subida drag&drop mediante URL firmada y descarga con URL firmada de 10 min.
7. **B6 Reportería** ✅ entregado — `/reports` con KPIs consolidados por rango (Finanzas, Ventas, Inventario, Proyectos, RRHH, CRM), top clientes y export CSV.
8. **B7 Configuración de empresa** ✅ entregado — `/settings/company` con datos fiscales, logo, contacto, prefijo de factura, IVA por defecto, moneda y pie de página.

---

## Preguntas antes de arrancar

1. ¿Empiezo por **Fase A** (seguridad + tráfico) y luego iteramos ERP módulo a módulo, o quieres que ejecute **A + B2 (Ventas)** en la misma entrega?
2. En A1, ¿ok con **hash de IP** (privacidad) o prefieres **IP en claro** para investigación forense?
3. Para ERP: ¿tu caso principal es **personal** (prioriza Documentos, Proyectos, Reportería) o **empresa** (prioriza Ventas, CRM, RRHH)?
