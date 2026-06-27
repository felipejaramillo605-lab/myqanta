// EBITDA monthly report PDF — generated entirely in the browser
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type KpiBlock = { revenue: number; costs: number; ebitda: number; net: number };
type Tx = { occurred_on: string; description: string; bucket: string; amount: number | string; currency: string };

function fmt(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

export function generateEbitdaReportPdf(opts: {
  month: string;
  current: KpiBlock;
  previous: KpiBlock;
  byBucket: Record<string, number>;
  transactions: Tx[];
  summary?: string;
  lang?: "es" | "en";
}) {
  const L = opts.lang === "es"
    ? { title: "Reporte EBITDA", period: "Periodo", revenue: "Ingresos", costs: "Costos", ebitda: "EBITDA", net: "Utilidad neta", vsPrev: "vs mes anterior", buckets: "Desglose por bucket", txs: "Transacciones", date: "Fecha", desc: "Descripción", bucket: "Bucket", amount: "Monto", margin: "Margen EBITDA", exec: "Resumen ejecutivo" }
    : { title: "EBITDA Report", period: "Period", revenue: "Revenue", costs: "Costs", ebitda: "EBITDA", net: "Net income", vsPrev: "vs previous month", buckets: "Bucket breakdown", txs: "Transactions", date: "Date", desc: "Description", bucket: "Bucket", amount: "Amount", margin: "EBITDA margin", exec: "Executive summary" };

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  let y = 48;

  // Header
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("Qanta", 40, y);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110);
  doc.text(L.title, 40, y + 16);
  doc.text(`${L.period}: ${opts.month}`, W - 40, y, { align: "right" });
  doc.setTextColor(0);
  y += 50;

  // KPI grid
  const margin = opts.current.revenue > 0 ? (opts.current.ebitda / opts.current.revenue) * 100 : 0;
  const cards: { label: string; value: string; delta?: number }[] = [
    { label: L.revenue, value: fmt(opts.current.revenue), delta: opts.previous.revenue ? ((opts.current.revenue - opts.previous.revenue) / Math.abs(opts.previous.revenue)) * 100 : 0 },
    { label: L.costs, value: fmt(opts.current.costs), delta: opts.previous.costs ? ((opts.current.costs - opts.previous.costs) / Math.abs(opts.previous.costs)) * 100 : 0 },
    { label: L.ebitda, value: fmt(opts.current.ebitda), delta: opts.previous.ebitda ? ((opts.current.ebitda - opts.previous.ebitda) / Math.abs(opts.previous.ebitda)) * 100 : 0 },
    { label: L.net, value: fmt(opts.current.net), delta: opts.previous.net ? ((opts.current.net - opts.previous.net) / Math.abs(opts.previous.net)) * 100 : 0 },
  ];
  const cw = (W - 80 - 24) / 4;
  cards.forEach((c, i) => {
    const x = 40 + i * (cw + 8);
    doc.setDrawColor(220);
    doc.setFillColor(245, 247, 251);
    doc.roundedRect(x, y, cw, 64, 6, 6, "FD");
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(c.label.toUpperCase(), x + 10, y + 16);
    doc.setFontSize(16);
    doc.setTextColor(20);
    doc.text(c.value, x + 10, y + 38);
    if (c.delta !== undefined) {
      doc.setFontSize(9);
      doc.setTextColor(c.delta >= 0 ? 30 : 180, c.delta >= 0 ? 130 : 50, 60);
      doc.text(`${c.delta >= 0 ? "+" : ""}${c.delta.toFixed(1)}% ${L.vsPrev}`, x + 10, y + 54);
    }
    doc.setTextColor(0);
  });
  y += 80;

  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`${L.margin}: ${margin.toFixed(1)}%`, 40, y);
  doc.setTextColor(0);
  y += 20;

  if (opts.summary) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(L.exec, 40, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(opts.summary, W - 80);
    doc.text(lines, 40, y);
    y += lines.length * 12 + 12;
  }

  // Bucket table
  autoTable(doc, {
    startY: y,
    head: [[L.buckets, L.amount]],
    body: Object.entries(opts.byBucket).map(([k, v]) => [k, fmt(v)]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 30, 35] },
    margin: { left: 40, right: 40 },
  });

  const afterBuckets = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;

  // Tx table
  autoTable(doc, {
    startY: afterBuckets + 20,
    head: [[L.date, L.desc, L.bucket, L.amount]],
    body: opts.transactions.slice(0, 200).map((t) => [t.occurred_on, t.description, t.bucket, fmt(Number(t.amount), t.currency)]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 30, 35] },
    margin: { left: 40, right: 40 },
  });

  const filename = `qanta-ebitda-${opts.month}.pdf`;
  doc.save(filename);
}