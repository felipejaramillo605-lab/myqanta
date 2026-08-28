/**
 * Motor de nómina auditable.
 *
 * TODO (validación legal): los porcentajes por defecto siguen la normativa
 * colombiana vigente al momento de la implementación (salud 4% + 8.5%,
 * pensión 4% + 12%, ARL clase I 0.522%, caja 4%, SENA 2%, ICBF 3%,
 * provisiones cesantías 8.33% + intereses 1%, prima 8.33%, vacaciones 4.17%).
 * Deben revisarse cada año con un contador o revisor fiscal antes de usarse
 * para pagos reales; son parametrizables por empresa en `hr_payroll_settings`.
 */

export type PayrollSettings = {
  minimum_wage: number;
  transport_allowance: number;
  transport_allowance_max_smmlv: number;
  health_employee_rate: number;
  pension_employee_rate: number;
  solidarity_threshold_smmlv: number;
  solidarity_rate: number;
  health_employer_rate: number;
  pension_employer_rate: number;
  arl_rate: number;
  caja_rate: number;
  sena_rate: number;
  icbf_rate: number;
  cesantias_rate: number;
  intereses_cesantias_rate: number;
  prima_rate: number;
  vacaciones_rate: number;
};

export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  minimum_wage: 1423500,
  transport_allowance: 200000,
  transport_allowance_max_smmlv: 2,
  health_employee_rate: 0.04,
  pension_employee_rate: 0.04,
  solidarity_threshold_smmlv: 4,
  solidarity_rate: 0.01,
  health_employer_rate: 0.085,
  pension_employer_rate: 0.12,
  arl_rate: 0.00522,
  caja_rate: 0.04,
  sena_rate: 0.02,
  icbf_rate: 0.03,
  cesantias_rate: 0.0833,
  intereses_cesantias_rate: 0.01,
  prima_rate: 0.0833,
  vacaciones_rate: 0.0417,
};

export type PayrollMemberInput = {
  member_id: string;
  full_name: string;
  salary_base: number;
  contract_type?: string | null;
  worked_days?: number;
  other_deductions?: number;
};

export type PayrollItem = {
  member_id: string;
  full_name: string;
  worked_days: number;
  base_salary: number;
  transport_allowance: number;
  gross: number;
  health_employee: number;
  pension_employee: number;
  solidarity_fund: number;
  other_deductions: number;
  total_deductions: number;
  net: number;
  employer_health: number;
  employer_pension: number;
  employer_arl: number;
  employer_caja: number;
  employer_sena: number;
  employer_icbf: number;
  total_employer: number;
  prov_cesantias: number;
  prov_intereses_cesantias: number;
  prov_prima: number;
  prov_vacaciones: number;
  total_provisions: number;
};

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** ¿El contrato es de prestación de servicios (sin seguridad social a cargo del empleador)? */
export function isServiceContract(contractType?: string | null): boolean {
  const t = (contractType ?? "").toLowerCase();
  return t.includes("prestaci") || t.includes("service") || t.includes("contractor") || t.includes("freelance");
}

/** Liquida un empleado para un periodo mensual (base 30 días). */
export function computePayrollItem(m: PayrollMemberInput, s: PayrollSettings): PayrollItem {
  const workedDays = Math.min(Math.max(Math.round(m.worked_days ?? 30), 0), 30);
  const monthly = Math.max(Number(m.salary_base) || 0, 0);
  const base = round2((monthly * workedDays) / 30);
  const service = isServiceContract(m.contract_type);

  // Auxilio de transporte: solo salarios hasta N SMMLV, proporcional a días.
  const eligibleTransport =
    !service && monthly > 0 && monthly <= s.minimum_wage * s.transport_allowance_max_smmlv;
  const transport = eligibleTransport ? round2((s.transport_allowance * workedDays) / 30) : 0;

  const gross = round2(base + transport);

  // La seguridad social se calcula sobre el salario (sin auxilio de transporte).
  const ibc = base;
  const health = service ? 0 : round2(ibc * s.health_employee_rate);
  const pension = service ? 0 : round2(ibc * s.pension_employee_rate);
  const solidarity =
    !service && monthly >= s.minimum_wage * s.solidarity_threshold_smmlv
      ? round2(ibc * s.solidarity_rate)
      : 0;
  const other = round2(m.other_deductions ?? 0);
  const totalDeductions = round2(health + pension + solidarity + other);
  const net = round2(gross - totalDeductions);

  const employer_health = service ? 0 : round2(ibc * s.health_employer_rate);
  const employer_pension = service ? 0 : round2(ibc * s.pension_employer_rate);
  const employer_arl = service ? 0 : round2(ibc * s.arl_rate);
  const employer_caja = service ? 0 : round2(ibc * s.caja_rate);
  // SENA e ICBF: exonerados para salarios inferiores a 10 SMMLV (Art. 114-1 ET).
  const exonerated = !service && monthly < s.minimum_wage * 10;
  const employer_sena = service || exonerated ? 0 : round2(ibc * s.sena_rate);
  const employer_icbf = service || exonerated ? 0 : round2(ibc * s.icbf_rate);
  const totalEmployer = round2(
    employer_health + employer_pension + employer_arl + employer_caja + employer_sena + employer_icbf,
  );

  // Provisiones: base salarial + auxilio de transporte (excepto vacaciones).
  const provBase = round2(base + transport);
  const prov_cesantias = service ? 0 : round2(provBase * s.cesantias_rate);
  const prov_intereses_cesantias = service ? 0 : round2(prov_cesantias * 12 * s.intereses_cesantias_rate);
  const prov_prima = service ? 0 : round2(provBase * s.prima_rate);
  const prov_vacaciones = service ? 0 : round2(base * s.vacaciones_rate);
  const totalProvisions = round2(prov_cesantias + prov_intereses_cesantias + prov_prima + prov_vacaciones);

  return {
    member_id: m.member_id,
    full_name: m.full_name,
    worked_days: workedDays,
    base_salary: base,
    transport_allowance: transport,
    gross,
    health_employee: health,
    pension_employee: pension,
    solidarity_fund: solidarity,
    other_deductions: other,
    total_deductions: totalDeductions,
    net,
    employer_health,
    employer_pension,
    employer_arl,
    employer_caja,
    employer_sena,
    employer_icbf,
    total_employer: totalEmployer,
    prov_cesantias,
    prov_intereses_cesantias,
    prov_prima,
    prov_vacaciones,
    total_provisions: totalProvisions,
  };
}

export type PayrollTotals = {
  total_gross: number;
  total_net: number;
  total_deductions: number;
  total_employer: number;
  total_provisions: number;
};

export function sumPayroll(items: PayrollItem[]): PayrollTotals {
  return {
    total_gross: round2(items.reduce((a, i) => a + i.gross, 0)),
    total_net: round2(items.reduce((a, i) => a + i.net, 0)),
    total_deductions: round2(items.reduce((a, i) => a + i.total_deductions, 0)),
    total_employer: round2(items.reduce((a, i) => a + i.total_employer, 0)),
    total_provisions: round2(items.reduce((a, i) => a + i.total_provisions, 0)),
  };
}

// ==================== Liquidación (finiquito) ====================

export type SeveranceInput = {
  full_name?: string;
  salary_base: number;
  transport_allowance?: number;
  hire_date: string;
  end_date: string;
  pending_vacation_days?: number;
  reason?: "resignation" | "mutual" | "without_cause" | "with_cause";
};

export type SeveranceResult = {
  days_worked: number;
  base_monthly: number;
  cesantias: number;
  intereses_cesantias: number;
  prima: number;
  vacaciones: number;
  indemnizacion: number;
  total: number;
  notes: string[];
};

function daysBetween(from: string, to: string): number {
  const d = Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
  return Math.max(d, 0);
}

/**
 * Liquidación laboral colombiana (base 360 días/año).
 * TODO (validación legal): revisar con un contador; la indemnización por
 * despido sin justa causa usa la regla general de 30 días por el primer año
 * y 20 días por año adicional para salarios inferiores a 10 SMMLV.
 */
export function computeSeverance(input: SeveranceInput, settings: PayrollSettings): SeveranceResult {
  const notes: string[] = [];
  const salary = Math.max(Number(input.salary_base) || 0, 0);
  const transport =
    input.transport_allowance ??
    (salary > 0 && salary <= settings.minimum_wage * settings.transport_allowance_max_smmlv
      ? settings.transport_allowance
      : 0);
  const baseMonthly = round2(salary + transport);
  const totalDays = daysBetween(input.hire_date, input.end_date);

  const cesantias = round2((baseMonthly * totalDays) / 360);
  const intereses = round2((cesantias * totalDays * 0.12) / 360);

  // Prima: proporcional al semestre en curso.
  const end = new Date(input.end_date);
  const semesterStart = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() < 6 ? 0 : 6, 1));
  const primaFrom = Date.parse(input.hire_date) > semesterStart.getTime()
    ? input.hire_date
    : semesterStart.toISOString().slice(0, 10);
  const primaDays = daysBetween(primaFrom, input.end_date);
  const prima = round2((baseMonthly * primaDays) / 360);

  // Vacaciones: 15 días hábiles por año sobre salario (sin auxilio).
  const vacDays = input.pending_vacation_days ?? (totalDays * 15) / 360;
  const vacaciones = round2((salary / 30) * vacDays);

  let indemnizacion = 0;
  if (input.reason === "without_cause") {
    const years = totalDays / 360;
    const dias = years <= 1 ? 30 * years : 30 + 20 * (years - 1);
    indemnizacion = round2((salary / 30) * dias);
    notes.push("Indemnización estimada por despido sin justa causa (regla general < 10 SMMLV).");
  }

  notes.push("Cálculo estimado con base 360 días/año. Validar con contador antes del pago.");

  return {
    days_worked: totalDays,
    base_monthly: baseMonthly,
    cesantias,
    intereses_cesantias: intereses,
    prima,
    vacaciones,
    indemnizacion,
    total: round2(cesantias + intereses + prima + vacaciones + indemnizacion),
    notes,
  };
}
