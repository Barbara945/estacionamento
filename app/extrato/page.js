"use client";

import { useEffect, useMemo, useState } from "react";
import RequireAuth from "/components/RequireAuth";
import { supabase } from "/lib/supabaseClient";

function money(n) {
  const v = Number(n ?? 0);
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));
}
function scopeLabel(m) {
  return m?.is_personal ? "Particular" : "Empresa";
}

function numberBR(n) {
  const v = Number(n ?? 0);
  return v.toFixed(2).replace(".", ",");
}

export default function Page() {
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [typeFilter, setTypeFilter] = useState("Todas"); // Todas | Entrada | Saída
  const [scopeFilter, setScopeFilter] = useState("Todas"); // Todas | Empresa | Particular
  const [catFilter, setCatFilter] = useState("Todas"); // Todas | categoria
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);


  async function load() {
    if (!isYMD(start) || !isYMD(end)) return;

    setLoading(true);

    let q = supabase
      .from("cash_movements")
      .select("id, created_at, type, description, amount, is_personal, category, cash_session_id")
      .order("created_at", { ascending: true })
      .gte("created_at", start + "T00:00:00")
      .lte("created_at", end + "T23:59:59");

    if (typeFilter !== "Todas") q = q.eq("type", typeFilter);

    if (scopeFilter !== "Todas") {
      q = q.eq("is_personal", scopeFilter === "Particular");
    }

    if (catFilter !== "Todas") {
      q = q.eq("category", catFilter);
    }

    const { data, error } = await q;
    setLoading(false);
    if (error) return alert(error.message);
    setRows(data ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    const entradas = rows.filter(r => r.type === "Entrada").reduce((a, r) => a + Number(r.amount ?? 0), 0);
    const saidas = rows.filter(r => r.type === "Saída").reduce((a, r) => a + Number(r.amount ?? 0), 0);
    return { entradas, saidas, saldo: entradas - saidas, count: rows.length };
  }, [rows]);

  const rowsWithRunning = useMemo(() => {
    let running = 0;
    return (rows ?? []).map(r => {
      running += (r.type === "Entrada" ? 1 : -1) * Number(r.amount ?? 0);
      return { ...r, running };
    });
  }, [rows]);
  function setThisMonth() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const first = `${y}-${m}-01`;
    const last = new Date(y, d.getMonth() + 1, 0).toISOString().slice(0, 10);
    setStart(first);
    setEnd(last);
  }

  function setLast7() {
    const now = new Date();
    const a = new Date(now);
    a.setDate(a.getDate() - 6);
    setStart(a.toISOString().slice(0, 10));
    setEnd(now.toISOString().slice(0, 10));
  }

  function exportCSV() {
    if (!rowsWithRunning.length) return;

    const header = ["Data", "Tipo", "Lançamento", "Descrição", "Categoria", "Valor", "Saldo acumulado"];
    const lines = [header];

    for (const r of rowsWithRunning) {
      const dt = new Date(r.created_at).toLocaleString("pt-BR");
      const tipo = r.type ?? "";
      const lanc = scopeLabel(r);
      const desc = (r.description ?? "").replace(/\s+/g, " ").trim();
      const cat = (r.category ?? "").replace(/\s+/g, " ").trim();
      const val = numberBR(r.amount);
      const run = numberBR(r.running);

      lines.push([dt, tipo, lanc, desc, cat, val, run]);
    }

    // CSV com separador ; (Excel pt-BR)
    const csv = lines
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell ?? "");
            const escaped = s.replace(/"/g, '""');
            return `"${escaped}"`;
          })
          .join(";")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `extrato_${start}_a_${end}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }



  return (
    <RequireAuth>
      
        <div className="h1">Extrato (por período)</div>
        <div className="small">Use para conciliar com o extrato do banco. Totais de entrada/saída e filtro por tipo de saída (categoria).</div>

        <div className="card" style={{ marginTop: 12 }}>
          <div className="row four">
            <div>
              <label>Início</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label>Fim</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div>
              <label>Tipo</label>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option>Todas</option>
                <option>Entrada</option>
                <option>Saída</option>
              </select>
            </div>
            <div>
              <label>Lançamento</label>
              <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)}>
                <option>Todas</option>
                <option>Empresa</option>
                <option>Particular</option>
              </select>
            </div>
          </div>

          <div className="row four" style={{ marginTop: 10, alignItems: "end" }}>
            <div>
              <label>Tipo de saída (categoria)</label>
              <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
                <option>Todas</option>
                <option value="">(sem categoria)</option>
                <option value="Fornecedor">Fornecedor</option>
                <option value="Salários">Salários</option>
                <option value="Aluguel">Aluguel</option>
                <option value="Impostos">Impostos</option>
                <option value="Marketing">Marketing</option>
                <option value="Manutenção">Manutenção</option>
                <option value="Compras">Compras</option>
                <option value="Outros">Outros</option>
              </select>
              <div className="small">Dica: isso funciona melhor quando o movimento foi lançado como “Saída”.</div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn" onClick={setThisMonth}>Mês atual</button>
              <button className="btn" onClick={setLast7}>Últimos 7 dias</button>
              <button className="btn primary" onClick={load} disabled={loading}>{loading ? "Consultando..." : "Consultar"}</button>
              <button className="btn" onClick={exportCSV} disabled={!rowsWithRunning.length}>Exportar CSV</button>
            </div>
          </div>
        </div>

        <div className="row three" style={{ marginTop: 12 }}>
          <div className="card">
            <div className="small">Entradas (período)</div>
            <div className="h2" style={{ color: "var(--good)" }}>{money(totals.entradas)}</div>
            <div className="small">{totals.count} lançamentos</div>
          </div>
          <div className="card">
            <div className="small">Saídas (período)</div>
            <div className="h2" style={{ color: "var(--bad)" }}>{money(totals.saidas)}</div>
            <div className="small">Filtro por categoria ajuda na conciliação</div>
          </div>
          <div className="card">
            <div className="small">Saldo líquido</div>
            <div className="h2">{money(totals.saldo)}</div>
            <div className="small">Entradas - Saídas</div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <div className="h2" style={{ marginBottom: 10 }}>Lançamentos</div>
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Lançamento</th>
                <th>Descrição</th>
                <th>Categoria</th>
                <th style={{ textAlign: "right" }}>Valor</th>
                <th style={{ textAlign: "right" }}>Saldo (acumulado)</th>
              </tr>
            </thead>
            <tbody>
              {rowsWithRunning.map((r) => (
                <tr key={r.id}>
                  <td className="small">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                  <td><span className="badge">{r.type}</span></td>
                  <td><span className="badge">{scopeLabel(r)}</span></td>
                  <td className="small">{r.description ?? "-"}</td>
                  <td className="small">{r.category ?? "-"}</td>
                  <td style={{ textAlign: "right" }}>
                    <b>{money(r.amount)}</b>
                  </td>
                  <td style={{ textAlign: "right" }} className="small">{money(r.running)}</td>
                </tr>
              ))}
              {!rowsWithRunning.length ? (
                <tr>
                  <td colSpan={7} className="small">Nenhum lançamento encontrado para o período.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
    </RequireAuth>
  );
}
