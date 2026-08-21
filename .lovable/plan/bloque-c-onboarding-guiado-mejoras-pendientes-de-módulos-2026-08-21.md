# Bloque C — Onboarding guiado + mejoras pendientes de módulos

Dos partes: (A) rehacer el onboarding como un flujo único guiado, (B) cerrar las mejoras de módulos que quedaron pendientes y añadir funcionalidades nuevas.

## Parte A — Onboarding

Hoy, al entrar por primera vez, se abren dos diálogos a la vez: el de perfil de negocio (`BusinessOnboardingDialog autoOpenIfMissing`) y el de vista Empresarial/Personal (`ViewModeOnboardingDialog`), ambos montados en el app shell y ambos condicionados a `onboarded_at` vacío. Además la guía de la app queda escondida detrás de un botón.

Nuevo flujo: un solo asistente en pasos, con barra de progreso y opción de saltar.

1. Bienvenida — qué es Qanta, cuánto toma (1 min).
2. Modo de uso — Empresarial / Personal (reemplaza el diálogo actual y sigue guardando `view_mode` + `hidden_modules`).
3. Datos del negocio — nombre, industria, tipo, tamaño de equipo, moneda (los campos actuales).
4. Objetivos — descripción y metas, que ya alimentan el contexto de Qanta.
5. Módulos — checklist para activar/desactivar módulos sobre la sugerencia del paso 2, en lugar de aceptar la lista oculta por defecto a ciegas.
6. Primer paso sugerido — 3 accesos directos según el modo elegido (p. ej. crear primer cliente / cargar movimiento / crear evento) y opción de sembrar datos de ejemplo reutilizando `seedFinanceTestData`.

Complementos:
- Tarjeta de "Configuración inicial" en el Dashboard con checklist persistente (negocio nombrado, primer módulo usado, primer miembro invitado, primer movimiento) que desaparece al completarse; permite retomar el onboarding si se saltó.
- Reabrir el asistente desde Configuración de empresa.
- La guía de la app (`AppGuideDialog`) se ofrece al terminar el asistente, no como diálogo suelto.

## Parte B — Mejoras de módulos

Pendientes del bloque anterior:

1. RRHH: calendario de ausencias del mes y resumen de días disponibles por empleado.
2. Reportes: comparativo mes vs. mes anterior por bucket y exportación de los indicadores financieros a CSV/PDF con las utilidades existentes.
3. Agenda: búsqueda unificada sobre eventos, tareas, hábitos y recordatorios.

Funcionalidades nuevas:

4. Búsqueda global (Cmd/Ctrl+K) sobre clientes, contactos, negocios, productos, facturas, proyectos, documentos y empleados, con navegación directa al módulo.
5. Centro de notificaciones con historial: las alertas que hoy solo aparecen como toast (aprobaciones, stock crítico, cartera vencida, recordatorios enviados) quedan listadas y marcables como leídas en la campana existente.
6. Qanta con memoria de conversación: historial persistente por organización, para retomar hilos y auditar lo que ejecutó.
7. Estados vacíos accionables en cada módulo (CRM, Ventas, Inventario, Proyectos, Documentos): explicación breve + botón que crea el primer registro o siembra ejemplos.

## Notas técnicas

- Nuevo componente `src/components/onboarding-wizard.tsx` que absorbe `business-onboarding-dialog.tsx` y `view-mode-onboarding-dialog.tsx`; el app shell monta solo el asistente. El diálogo de perfil de negocio se conserva para edición posterior desde Configuración.
- El progreso del onboarding se guarda en `organizations` (columna nueva `onboarding_step`), para que el asistente resuma donde quedó; el resto usa campos existentes (`view_mode`, `hidden_modules`, `onboarded_at`).
- Notificaciones e historial de Qanta requieren migración: una tabla de notificaciones por organización y una de mensajes del asistente, ambas con RLS por organización, GRANT explícito y `resolveOrgWithModuleAccess`.
- Búsqueda global: un solo server function que consulta en paralelo por organización con límite por entidad y respeta el acceso por módulo (no devuelve resultados de módulos ocultos).
- RRHH, Reportes y Agenda son UI + agregaciones sobre datos ya consultados, sin migraciones.

## Orden sugerido

1. Parte A completa (onboarding + checklist de dashboard).
2. Parte B puntos 1-3 (cierre de pendientes).
3. Parte B puntos 4-7.
