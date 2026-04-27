"use client";

import { useEffect, useMemo, useState } from "react";
import RequireAuth from "../../components/RequireAuth";
import { supabase } from "../../lib/supabaseClient";
import { format } from "date-fns";

function money(n) {
  const v = Number(n ?? 0);
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function monthStartISO(d) {
  const dt = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0);
  return format(dt, "yyyy-MM-dd");
}

function monthEndISO(d) {
  const dt = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
  return format(dt, "yyyy-MM-dd");
}

export default function RelatoriosPage() {
  const now = useMemo(() => new Date(), []);
  const [start, setStart] = useState(() => monthStartISO(now));
  const [end, setEnd] = useState(() => monthEndISO(now));

  // Prévia na tela (resumo)
  const [paidTotal, setPaidTotal] = useState(0);
  const [paidByMethod, setPaidByMethod] = useState({});
  const [serviceCount, setServiceCount] = useState({});
  const [apptCount, setApptCount] = useState(0);

  async function load() {
    const startISO = new Date(start + "T00:00:00").toISOString();
    const endISO = new Date(end + "T23:59:59").toISOString();

    // Pagamentos pagos no período (prévia)
    const { data: pays } = await supabase
      .from("payments")
      .select("amount, method, status, paid_at, appointment_id")
      .eq("status", "Pago")
      .gte("paid_at", startISO)
      .lte("paid_at", endISO);

    const sum = (pays ?? []).reduce((a, p) => a + Number(p.amount ?? 0), 0);
    setPaidTotal(sum);

    const byMethod = {};
    for (const p of pays ?? []) {
      const k = p.method ?? "—";
      byMethod[k] = (byMethod[k] ?? 0) + Number(p.amount ?? 0);
    }
    setPaidByMethod(byMethod);

    // Agendamentos no período (para contar serviços)
    const { data: appts } = await supabase
      .from("appointments")
      .select("id, start_time")
      .gte("start_time", startISO)
      .lte("start_time", endISO);

    const ids = (appts ?? []).map((a) => a.id);
    setApptCount(ids.length);

    const count = {};
    if (ids.length) {
      const { data: its, error } = await supabase
        .from("appointment_services")
        .select("appointment_id, services(name)")
        .in("appointment_id", ids);

      if (!error) {
        for (const it of its ?? []) {
          const name = it.services?.name ?? "—";
          count[name] = (count[name] ?? 0) + 1;
        }
      }
    }

    setServiceCount(count);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);

  const serviceEntries = useMemo(() => Object.entries(serviceCount).sort((a, b) => b[1] - a[1]), [serviceCount]);
  const methodEntries = useMemo(() => Object.entries(paidByMethod).sort((a, b) => b[1] - a[1]), [paidByMethod]);

  function downloadPDF() {
    const url = `/api/relatorios/pdf?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    // abre nova aba e baixa automaticamente
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <RequireAuth>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div className="h1">Relatórios</div>
          <div className="small">Resumo na tela + exportação em PDF</div>
        </div>

        <button className="btn primary" onClick={downloadPDF}>Baixar PDF</button>
      </div>

      <div style={{ height: 12 }} />

      <div className="row three">
        <div className="card">
          <div className="h2">Período</div>
          <div className="row two">
            <div>
              <label>Início</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label>Fim</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="small" style={{ marginTop: 8 }}>
            O PDF inclui: clientes (nome/telefone), serviços/valores, contas a pagar e a receber por período,
            balanço (entradas x saídas), top serviços e ticket médio.
          </div>
        </div>

        <div className="card">
          <div className="h2">Recebido (Pago)</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "var(--ok)" }}>{money(paidTotal)}</div>
          <div className="small">Somatório de pagamentos “Pago” (prévia)</div>
        </div>

        <div className="card">
          <div className="h2">Agendamentos</div>
          <div style={{ fontSize: 26, fontWeight: 900 }}>{apptCount}</div>
          <div className="small">Quantidade no período (prévia)</div>
        </div>
      </div>

      <div style={{ height: 14 }} />

      <div className="row two">
        <div className="card">
          <div className="h2">Recebido por forma</div>
          <table className="table">
            <thead>
              <tr>
                <th>Forma</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {methodEntries.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td style={{ fontWeight: 900 }}>{money(v)}</td>
                </tr>
              ))}
              {methodEntries.length === 0 ? (
                <tr><td colSpan={2} className="small">Sem pagamentos no período.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="h2">Serviços mais vendidos</div>
          <table className="table">
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Qtd</th>
              </tr>
            </thead>
            <tbody>
              {serviceEntries.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td style={{ fontWeight: 900 }}>{v}</td>
                </tr>
              ))}
              {serviceEntries.length === 0 ? (
                <tr><td colSpan={2} className="small">Sem dados de serviços no período.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </RequireAuth>
  );
}
