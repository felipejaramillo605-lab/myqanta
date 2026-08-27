# Bloque pendiente: Punto 3 (Onboarding con tour) + Punto 5 (NIIF en contabilidad)

De los 5 puntos solicitados, ya están hechos: 1 (Obsidian), 2 (marcar notificaciones como leídas) y 4 (análisis de hojas de vida). Quedan estos dos.

## Punto 3 — Onboarding: rediseño con tour de producto

Hoy el onboarding es el `OnboardingWizard` (configuración funcional) y la guía queda detrás del `AppGuideDialog`. Falta el tour visual de producto por usuario.

1. Migración: columna `has_seen_product_tour` (boolean, default false) en la tabla de perfiles de usuario — es por usuario, no por organización, para que cada miembro vea el tour una vez.
2. Componente `ProductTourDialog`: carrusel de 4-6 pasos con capturas/ilustraciones reales de los módulos (Dashboard, Agenda, Finanzas, CRM, Qanta), texto corto por paso, indicadores de progreso, botón "Saltar".
3. Disparo automático: tras completar (o saltar) el `OnboardingWizard`, si el usuario no ha visto el tour. Marca `has_seen_product_tour = true` al cerrar.
4. Reabrible: entrada "Ver tour de la app" en el menú de usuario / Configuración de perfil, y desde la tarjeta de "Primeros pasos" del dashboard.
5. Server function `markProductTourSeen` + query del estado, reutilizando el patrón de `onboarding.functions.ts`.

## Punto 5 — Contabilidad: skill de conocimiento NIIF

1. Base de conocimiento `src/lib/niif-knowledge.ts`: catálogo estático y curado de las normas NIIF más usadas en pymes colombianas (NIC 2 inventarios, NIC 16 PPE, NIIF 15 ingresos, NIIF 9 instrumentos financieros, NIC 12 impuestos, NIIF 16 arrendamientos, NIC 19 beneficios empleados), cada una con: código, nombre, resumen, cuentas PUC típicas y ejemplos de asientos.
2. Tool de Qanta `suggest_journal_entry`: el usuario describe una operación ("compré un computador a crédito", "vendí servicios con IVA") y la herramienta propone el asiento contable (cuentas PUC débito/crédito con montos) citando la norma NIIF aplicable. Solo sugiere — no registra; el asiento se confirma por el usuario en `/finance/journal`.
3. Integración en el prompt del sistema del asistente: resumen de que puede consultar NIIF y proponer asientos en borrador.
4. Opcional en la UI de Finanzas: botón "Sugerir con IA" en el formulario de asiento manual que abre Qanta con el contexto.

## Notas técnicas

- Migración única con la columna `has_seen_product_tour` (+ GRANT/RLS si aplica sobre la tabla de perfiles existente).
- La base NIIF es estática en repo (sin tabla ni RAG) — suficiente para el alcance pyme y sin costo de embeddings.
- El tool de asientos sigue el patrón existente: helpers en `src/lib/assistant-tools/*.server.ts`, ensamblados en el handler; nada destructivo (solo propone, no persiste).
- El tour usa imágenes generadas o capturas locales en `src/assets`, sin dependencias nuevas.

## Orden sugerido

1. Punto 5 (NIIF) — menor superficie, solo backend + tool.
2. Punto 3 (tour) — migración + UI del carrusel.
