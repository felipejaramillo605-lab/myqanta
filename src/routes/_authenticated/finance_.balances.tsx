import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Scale } from "lucide-react";
import {
  listAccountsCoa, listThirdParties,
  getLedger, getSubledger, getThirdPartyBalances,
  type LedgerRow,
} from "@/lib/finance-ext.functions";

export const Route = createFileRoute("/_authenticated/finance_/balances")({
  head: () => ({
    meta: [
      { title: "Qanta — Balances contables" },
      { name: "description", content: "Libro mayor, auxiliar por tercero y saldos por tercero de tu contabilidad." },
      { property: "og:title", content: "Qanta — Balances contables" },
      { property: "og:description", content: "Libro mayor, auxiliar y saldos por tercero." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BalancesPage,
});

function buildAccountTree(accounts: any[]) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const depthOf = (a: any) => {
    let d = 0; let cur = a;
    while (cur?.parent_id && byId.has(cur.parent_id) && d < 10) { cur = byId.get(cur.parent_id); d++; }
    return d;
  };
  return [...accounts]
    .sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }))
    .map((a) => ({ ...a, depth: depthOf(a) }));
}

const money = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 2 });

function LedgerTable({ rows, showDetail }: { rows: LedgerRow[]; showDetail?: boolean }) {
  if (!rows.length) return <div className="text-sm text-muted-foreground py-6 text-center">Sin movimientos contabilizados.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border/40">
            <th className="text-left py-2 pr-3">Fecha</th>
            <th className="text-left py-2 pr-3">Asiento</th>
            {showDetail && <th className="text-left py-2 pr-3">Descripción</th>}
            <th className="text-left py-2 pr-3">Cuenta</th>
            <th className="text-left py-2 pr-3">Tercero</th>
            <th className="text-right py-2 pr-3">Débito</th>
            <th className="text-right py-2 pr-3">Crédito</th>
            <th className="text-right py-2">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/20">
              <td className="py-2 pr-3 whitespace-nowrap">{r.entry_date}</td>
              <td className="py-2 pr-3 font-mono text-xs">#{r.entry_no ?? "—"}</td>
              {showDetail && <td className="py-2 pr-3 text-muted-foreground">{r.description ?? "—"}</td>}
              <td className="py-2 pr-3">{r.account_code ? `${r.account_code} · ` : ""}{r.account_name ?? "—"}</td>
              <td className="py-2 pr-3 text-muted-foreground">{r.third_party_name ?? "—"}</td>
              <td className="py-2 pr-3 text-right font-mono">{r.debit ? money(r.debit) : ""}</td>
              <td className="py-2 pr-3 text-right font-mono">{r.credit ? money(r.credit) : ""}</td>
              <td className="py-2 text-right font-mono font-medium">{money(r.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BalancesPage() {
  const coa = useQuery({ queryKey: ["coa"], queryFn: () => listAccountsCoa() });
  const parties = useQuery({ queryKey: ["third-parties"], queryFn: () => listThirdParties() });
  const accounts = useMemo(() => buildAccountTree(coa.data ?? []), [coa.data]);

  const [ledgerAccount, setLedgerAccount] = useState<string>("all");
  const [subAccount, setSubAccount] = useState<string>("");
  const [subParty, setSubParty] = useState<string>("all");
  const [sortAsc, setSortAsc] = useState(false);

  const ledgerQ = useQuery({
    queryKey: ["ledger", ledgerAccount],
    queryFn: () => getLedger({ data: ledgerAccount === "all" ? {} : { account_id: ledgerAccount } }),
  });
  const subQ = useQuery({
    queryKey: ["subledger", subAccount, subParty],
    queryFn: () => getSubledger({ data: { account_id: subAccount, ...(subParty !== "all" ? { third_party_id: subParty } : {}) } }),
    enabled: !!subAccount,
  });
  const tpQ = useQuery({ queryKey: ["third-party-balances"], queryFn: () => getThirdPartyBalances() });

  const tpRows = useMemo(() => {
    const rows = [...(tpQ.data ?? [])];
    rows.sort((a, b) => (sortAsc ? a.balance - b.balance : b.balance - a.balance));
    return rows;
  }, [tpQ.data, sortAsc]);

  const accountOptions = accounts.map((a) => (
    <SelectItem key={a.id} value={a.id}>
      {"\u00A0".repeat(a.depth * 3)}{a.code} · {a.name}
    </SelectItem>
  ));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Scale className="size-5 text-primary" />
        <h1 className="text-2xl font-semibold">Balances</h1>
      </div>

      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="subledger">Subledger</TabsTrigger>
          <TabsTrigger value="thirdparty">Third-party balance</TabsTrigger>
        </TabsList>

        <TabsContent value="ledger" className="space-y-4">
          <div className="glass rounded-2xl p-4 space-y-4">
            <Select value={ledgerAccount} onValueChange={setLedgerAccount}>
              <SelectTrigger className="max-w-md"><SelectValue placeholder="Cuenta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las cuentas</SelectItem>
                {accountOptions}
              </SelectContent>
            </Select>
            {ledgerQ.isLoading ? (
              <div className="text-sm text-muted-foreground">Cargando…</div>
            ) : (
              <LedgerTable rows={ledgerQ.data ?? []} />
            )}
          </div>
        </TabsContent>

        <TabsContent value="subledger" className="space-y-4">
          <div className="glass rounded-2xl p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Select value={subAccount} onValueChange={setSubAccount}>
                <SelectTrigger><SelectValue placeholder="Selecciona una cuenta" /></SelectTrigger>
                <SelectContent>{accountOptions}</SelectContent>
              </Select>
              <Select value={subParty} onValueChange={setSubParty}>
                <SelectTrigger><SelectValue placeholder="Tercero (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los terceros</SelectItem>
                  {(parties.data ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}{p.tax_id ? ` · ${p.tax_id}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!subAccount ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Selecciona una cuenta para ver el auxiliar.</div>
            ) : subQ.isLoading ? (
              <div className="text-sm text-muted-foreground">Cargando…</div>
            ) : (
              <LedgerTable rows={subQ.data ?? []} showDetail />
            )}
          </div>
        </TabsContent>

        <TabsContent value="thirdparty" className="space-y-4">
          <div className="glass rounded-2xl p-4 space-y-4">
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => setSortAsc((v) => !v)}>
                <ArrowUpDown className="size-4 mr-1" /> Saldo {sortAsc ? "ascendente" : "descendente"}
              </Button>
            </div>
            {tpQ.isLoading ? (
              <div className="text-sm text-muted-foreground">Cargando…</div>
            ) : !tpRows.length ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Sin saldos por tercero.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b border-border/40">
                      <th className="text-left py-2 pr-3">Tercero</th>
                      <th className="text-left py-2 pr-3">NIT</th>
                      <th className="text-right py-2 pr-3">Débito</th>
                      <th className="text-right py-2 pr-3">Crédito</th>
                      <th className="text-right py-2">Saldo neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tpRows.map((r) => (
                      <tr key={r.third_party_id} className="border-b border-border/20">
                        <td className="py-2 pr-3">{r.name}</td>
                        <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{r.tax_id ?? "—"}</td>
                        <td className="py-2 pr-3 text-right font-mono">{money(r.debit)}</td>
                        <td className="py-2 pr-3 text-right font-mono">{money(r.credit)}</td>
                        <td className="py-2 text-right font-mono font-medium">{money(r.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
