/**
 * Base de conocimiento NIIF (estática, curada para pymes colombianas).
 * Sin tabla ni RAG: suficiente para el alcance pyme y cero costo de embeddings.
 * Cada norma incluye las cuentas PUC colombianas típicas y un ejemplo de asiento.
 */

export type NiifRule = {
  code: string;
  name: string;
  summary: string;
  /** Palabras clave (minúsculas) que activan esta norma. */
  keywords: string[];
  /** Cuentas PUC típicas: código → nombre. */
  accounts: Record<string, string>;
  example: { description: string; lines: Array<{ account: string; debit?: number; credit?: number }> };
};

export const NIIF_RULES: NiifRule[] = [
  {
    code: "NIC 2",
    name: "Inventarios",
    summary:
      "Los inventarios se reconocen al costo (compra + costos directamente atribuibles) y se llevan al resultado como costo de ventas cuando se venden. Se miden al menor entre costo y valor neto realizable.",
    keywords: ["inventario", "mercancía", "mercancia", "compra de productos", "stock", "materia prima", "almacén"],
    accounts: {
      "1435": "Mercancías no fabricadas por la empresa",
      "6135": "Costo de ventas - comercio al por mayor y por menor",
      "2205": "Proveedores nacionales",
      "2408": "IVA por pagar (descontable)",
    },
    example: {
      description: "Compra de mercancía a crédito con IVA descontable del 19%",
      lines: [
        { account: "1435", debit: 1000000 },
        { account: "2408", debit: 190000 },
        { account: "2205", credit: 1190000 },
      ],
    },
  },
  {
    code: "NIC 16",
    name: "Propiedad, planta y equipo",
    summary:
      "Los activos fijos se reconocen al costo y se deprecian de forma sistemática durante su vida útil. La depreciación es un gasto del período.",
    keywords: ["computador", "equipo", "maquinaria", "vehículo", "vehiculo", "mueble", "activo fijo", "depreciación", "depreciacion"],
    accounts: {
      "1524": "Equipo de oficina",
      "1528": "Equipo de computación y comunicación",
      "1592": "Depreciación acumulada",
      "5260": "Depreciaciones (gasto)",
      "2205": "Proveedores nacionales",
    },
    example: {
      description: "Compra de un computador a crédito por $3.000.000",
      lines: [
        { account: "1528", debit: 3000000 },
        { account: "2205", credit: 3000000 },
      ],
    },
  },
  {
    code: "NIIF 15",
    name: "Ingresos de contratos con clientes",
    summary:
      "El ingreso se reconoce cuando se transfiere el control del bien o servicio al cliente, por el monto que la entidad espera tener derecho a cobrar (modelo de 5 pasos).",
    keywords: ["venta", "ingreso", "facturé", "facture", "servicio prestado", "cobré", "cobre", "factura"],
    accounts: {
      "4135": "Comercio al por mayor y por menor",
      "4155": "Actividades de servicios",
      "2408": "IVA por pagar (generado)",
      "1305": "Clientes",
      "1105": "Caja",
    },
    example: {
      description: "Venta de servicios por $1.000.000 + IVA 19%, a crédito",
      lines: [
        { account: "1305", debit: 1190000 },
        { account: "4155", credit: 1000000 },
        { account: "2408", credit: 190000 },
      ],
    },
  },
  {
    code: "NIIF 9",
    name: "Instrumentos financieros",
    summary:
      "Clasificación y medición de activos y pasivos financieros (cuentas por cobrar, inversiones, obligaciones). Las cuentas por cobrar se deterioran con el modelo de pérdidas crediticias esperadas.",
    keywords: ["préstamo", "prestamo", "crédito bancario", "credito bancario", "obligación financiera", "obligacion financiera", "inversión", "inversion", "intereses", "cartera"],
    accounts: {
      "1305": "Clientes",
      "2105": "Obligaciones financieras nacionales",
      "5305": "Gastos financieros - intereses",
      "1110": "Bancos",
    },
    example: {
      description: "Desembolso de préstamo bancario de $10.000.000",
      lines: [
        { account: "1110", debit: 10000000 },
        { account: "2105", credit: 10000000 },
      ],
    },
  },
  {
    code: "NIC 12",
    name: "Impuesto a las ganancias",
    summary:
      "Reconoce el impuesto corriente del período y los impuestos diferidos por diferencias temporarias entre la base contable y fiscal.",
    keywords: ["impuesto", "renta", "iva", "retención", "retencion", "retefuente", "dian", "impoconsumo"],
    accounts: {
      "2404": "Impuesto de renta y complementarios",
      "2408": "Impuesto sobre las ventas por pagar (IVA)",
      "1355": "Anticipo de impuestos - retención en la fuente",
      "5404": "Impuesto de renta (gasto)",
    },
    example: {
      description: "Cobro de factura con retención en la fuente del 11% sobre servicios de $1.000.000",
      lines: [
        { account: "1105", debit: 1080000 },
        { account: "1355", debit: 110000 },
        { account: "1305", credit: 1190000 },
      ],
    },
  },
  {
    code: "NIIF 16",
    name: "Arrendamientos",
    summary:
      "El arrendatario reconoce un activo por derecho de uso y un pasivo por arrendamiento por casi todos los arrendamientos, con depreciación del activo e interés sobre el pasivo.",
    keywords: ["arriendo", "arrendamiento", "alquiler", "local", "oficina arrendada", "canon"],
    accounts: {
      "1620": "Derechos de uso (activos por arrendamiento)",
      "2510": "Pasivos por arrendamientos",
      "5120": "Arrendamientos (gasto, arriendos cortos o de bajo valor)",
      "1110": "Bancos",
    },
    example: {
      description: "Pago mensual de arriendo de oficina (contrato corto/bajo valor) por $2.000.000",
      lines: [
        { account: "5120", debit: 2000000 },
        { account: "1110", credit: 2000000 },
      ],
    },
  },
  {
    code: "NIC 19",
    name: "Beneficios a los empleados",
    summary:
      "Reconoce sueldos, prestaciones sociales (cesantías, prima, vacaciones) y aportes de seguridad social como gasto cuando el empleado presta el servicio.",
    keywords: ["nómina", "nomina", "sueldo", "salario", "cesantías", "cesantias", "prima", "vacaciones", "seguridad social", "empleado", "prestaciones"],
    accounts: {
      "5105": "Gastos de personal - sueldos",
      "5150": "Prestaciones sociales",
      "2370": "Retenciones y aportes de nómina por pagar",
      "2505": "Salarios por pagar",
      "1110": "Bancos",
    },
    example: {
      description: "Causación de nómina mensual: sueldo $2.500.000 con salud/pensión empleado (8%)",
      lines: [
        { account: "5105", debit: 2500000 },
        { account: "2370", credit: 200000 },
        { account: "2505", credit: 2300000 },
      ],
    },
  },
];

/** Devuelve las normas cuyas keywords aparecen en la descripción (máx. 3). */
export function matchNiifRules(description: string): NiifRule[] {
  const text = description.toLowerCase();
  const scored = NIIF_RULES.map((r) => ({
    rule: r,
    score: r.keywords.reduce((s, k) => s + (text.includes(k) ? 1 : 0), 0),
  }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((s) => s.rule);
}

/** Resumen compacto para inyectar en el prompt del sistema. */
export function niifSummaryForPrompt(): string {
  return NIIF_RULES.map((r) => `- ${r.code} ${r.name}: ${r.summary.split(".")[0]}.`).join("\n");
}
