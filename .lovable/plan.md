# Cierre anual, historial de auditoría y conciliación sugerida

Tres funcionalidades independientes sobre el módulo de Finanzas.

## 1. Asiento de cierre anual

Traslada el resultado del ejercicio (ingresos, gastos y costos) a utilidades acumuladas.

- Nueva pestaña **Cierre anual** en Cierre mensual (`/finance/periods`), con selector de año.
- Muestra un resumen previo: total de ingresos, total de gastos/costos, resultado (utilidad o pérdida) y las cuentas que se van a cancelar.
- Un botón genera el asiento: cancela cada cuenta de resultado contra la cuenta de utilidades acumuladas (se crea automáticamente si no existe, código 3705 "Utilidades acumuladas" / 3705 pérdida según signo), con fecha 31 de diciembre del año elegido.
- El asiento queda marcado como asiento de cierre del año, visible y filtrable en Asientos por periodo, y se bloquea la generación de un segundo cierre para el mismo año (con opción de anularlo si el año sigue abierto).
- Validaciones antes de generar: diciembre no cerrado, sin borradores pendientes del año, diario cuadrado.

## 2. Historial de auditoría de periodos

- Cada cierre, reapertura y cierre anual queda registrado con usuario, fecha/hora, acción y motivo opcional.
- Al cerrar o reabrir se puede escribir un motivo (obligatorio al reabrir un periodo ya cerrado).
- Se muestra como línea de tiempo en `/finance/periods` (pestaña propia) y como bloque del mes en `/finance/period-entries`.

## 3. Reglas de conciliación sugeridas

En `/finance/reconciliation`, además del auto-conciliar existente:

- Para cada movimiento pendiente se calculan sugerencias puntuadas por coincidencia de **valor** (con tolerancia), **fecha** (con tolerancia en días) y **referencia/descripción** similar.
- Cada sugerencia se muestra con su porcentaje de confianza y el motivo del emparejamiento; se acepta con un clic (o se ignora).
- El auto-conciliar reutiliza el mismo puntaje y solo empareja automáticamente por encima de un umbral alto, evitando emparejamientos dudosos.

## Detalles técnicos

- **Migración**: columnas `is_closing`, `closing_year` en `fin_journal_entries`; tabla `accounting_period_audit` (org_id, year, month nullable, action, reason, actor, created_at) con RLS + GRANTs; índices por org/año.
- **Server functions** (`src/lib/finance-periods.functions.ts`): `getYearEndPreview`, `postYearEndClosing`, `revertYearEndClosing`, `listPeriodAudit`; `setAccountingPeriodStatus` y `closeBankReconciliation`/`reopenBankReconciliation` aceptan `reason` y escriben auditoría.
- **Conciliación** (`src/lib/finance-ext.functions.ts`): helper de puntaje compartido, nueva `suggestReconciliationMatches`, `autoReconcile` usa el umbral.
- **UI**: nuevas pestañas en `finance_.periods.tsx`, bloque de auditoría en `finance_.period-entries.tsx`, panel de sugerencias en `finance_.reconciliation.tsx`.
- El asiento de cierre se inserta con estado publicado y marca de sistema (sin exigir comprobante, ya que lo genera el sistema) y respeta `assertPeriodOpen`.
