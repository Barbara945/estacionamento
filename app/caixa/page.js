"use client";

import { useEffect, useMemo, useState } from "react";
import RequireAuth from "../../components/RequireAuth";
import Modal from "../../components/Modal";
import { supabase } from "../../lib/supabaseClient";
import { format } from "date-fns";

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


function defaultBankName(banks) {
  const mp = (banks ?? []).find((b) => /mercado\s*pago/i.test(String(b?.name ?? "")))?.name;
  return mp || (banks?.[0]?.name ?? "") || "MERCADO PAGO";
}

function monthStartYMD(d) {
  const dt = new Date(d.getFullYear(), d.getMonth(), 1);
  return format(dt, "yyyy-MM-dd");
}

function monthEndYMD(d) {
  const dt = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return format(dt, "yyyy-MM-dd");
}

function isoStart(ymd) {
  return new Date(ymd + "T00:00:00").toISOString();
}
function isoEnd(ymd) {
  return new Date(ymd + "T23:59:59.999").toISOString();
}

export default function CaixaPage() {
  // Caixa aberto (sessão)
  const [session, setSession] = useState(null);
  const [movs, setMovs] = useState([]);
  const [banks, setBanks] = useState([]);
  const todayYMD = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [openTransfer, setOpenTransfer] = useState(false);
  const [tForm, setTForm] = useState({ scope: "Empresa", date: todayYMD, from: "", to: "", amount: 0, notes: "" });


  // Consulta por período (conciliação)
  const now = useMemo(() => new Date(), []);
  const [view, setView] = useState("caixa"); // "caixa" | "periodo"
  const [pStart, setPStart] = useState(() => monthStartYMD(now));
  const [pEnd, setPEnd] = useState(() => monthEndYMD(now));
  const [pMovs, setPMovs] = useState([]);

  const [scopeFilter, setScopeFilter] = useState("Todas");
  const [periodScopeFilter, setPeriodScopeFilter] = useState("Todas");

  const [openOpen, setOpenOpen] = useState(false);
  const [openMove, setOpenMove] = useState(false);
  const [openClose, setOpenClose] = useState(false);

  const [initialAmount, setInitialAmount] = useState(0);
  const [moveForm, setMoveForm] = useState({ type: "Entrada", description: "", amount: 0, scope: "Empresa", category: "", bank_account: "" });
  const [finalAmount, setFinalAmount] = useState(0);

  
const filteredMovs = useMemo(() => {
  if (scopeFilter === "Todas") return movs;
  const wantPersonal = scopeFilter === "Particular";
  return movs.filter(m => Boolean(m.is_personal) === wantPersonal);
}, [movs, scopeFilter]);

const totals = useMemo(() => {
  const entradas = filteredMovs.filter(m => m.type === "Entrada").reduce((a, m) => a + Number(m.amount ?? 0), 0);
  const saidas = filteredMovs.filter(m => m.type === "Saída").reduce((a, m) => a + Number(m.amount ?? 0), 0);
  return { entradas, saidas, saldo: Number(session?.initial_amount ?? 0) + entradas - saidas };
}, [filteredMovs, session]);

  
const filteredPMovs = useMemo(() => {
  if (periodScopeFilter === "Todas") return pMovs;
  const wantPersonal = periodScopeFilter === "Particular";
  return pMovs.filter(m => Boolean(m.is_personal) === wantPersonal);
}, [pMovs, periodScopeFilter]);

const periodTotals = useMemo(() => {
  const entradas = filteredPMovs.filter(m => m.type === "Entrada").reduce((a, m) => a + Number(m.amount ?? 0), 0);
  const saidas = filteredPMovs.filter(m => m.type === "Saída").reduce((a, m) => a + Number(m.amount ?? 0), 0);
  return { entradas, saidas, saldo: entradas - saidas };
}, [filteredPMovs]);

  async function loadCaixaAberto() {
    // pega caixa aberto (o mais recente)
    const { data: sessions, error } = await supabase
      .from("cash_sessions")
      .select("*")
      .eq("status", "Aberto")
      .order("opened_at", { ascending: false })
      .limit(1);

    if (error) return alert(error.message);

    const s = sessions?.[0] ?? null;
    setSession(s);

    if (s?.id) {
      const { data: mv, error: errMv } = await supabase
        .from("cash_movements")
        .select("*")
        .eq("cash_session_id", s.id)
        .order("created_at", { ascending: false });

      if (errMv) return alert(errMv.message);

      setMovs(mv ?? []);
    } else {
      setMovs([]);
    }
  }

  async function loadPeriodo() {
    // Evita erro de data vazia
    if (!isYMD(pStart) || !isYMD(pEnd)) return;

    const { data, error } = await supabase
      .from("cash_movements")
      .select("*, cash_sessions(opened_at, closed_at, status)")
      .gte("created_at", isoStart(pStart))
      .lte("created_at", isoEnd(pEnd))
      .order("created_at", { ascending: false });

    if (error) return alert(error.message);
    setPMovs(data ?? []);
  }

  

async function loadBanksOnce() {
  const { data } = await supabase.from("bank_accounts").select("*").order("name", { ascending: true });
  setBanks(data ?? []);
  // define banco padrão (Mercado Pago) para novos lançamentos
  const def = defaultBankName(data ?? []);
  setMoveForm((prev) => ({ ...prev, bank_account: prev.bank_account || def }));
}

  useEffect(() => {
    loadBanksOnce();
    loadCaixaAberto();
    loadPeriodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openCash() {
  const def = defaultBankName(banks);
  const payload = { initial_amount: Number(initialAmount ?? 0), status: "Aberto" };

  const { data: inserted, error } = await supabase.from("cash_sessions").insert([payload]).select("*").single();
  if (error) return alert(error.message);

  // Garante que o saldo inicial apareça no Banco (Mercado Pago por padrão)
  const ia = Number(payload.initial_amount ?? 0);
  if (ia > 0 && inserted?.id) {
    const { data: already } = await supabase
      .from("cash_movements")
      .select("id")
      .eq("cash_session_id", inserted.id)
      .ilike("description", "SALDO INICIAL")
      .limit(1);

    if (!already?.length) {
      await supabase.from("cash_movements").insert([
        {
          cash_session_id: inserted.id,
          type: "Entrada",
          description: "SALDO INICIAL",
          amount: ia,
          is_personal: false,
          category: "Abertura",
          bank_account: def,
        },
      ]);
    }
  }

  setOpenOpen(false);
  setInitialAmount(0);
  loadCaixaAberto();
  loadPeriodo();
}

  async function addMovement() {
    if (!session?.id) return alert("Abra o caixa primeiro.");
    const payload = {
      cash_session_id: session.id,
      type: moveForm.type,
      description: moveForm.description,
      amount: Number(moveForm.amount ?? 0),
      is_personal: moveForm.scope === "Particular",
      category: (moveForm.category || null),
      bank_account: (moveForm.bank_account || defaultBankName(banks) || null),
    };
    if (!payload.amount || payload.amount <= 0) return alert("Informe um valor válido.");
    const { error } = await supabase.from("cash_movements").insert([payload]);
    if (error) return alert(error.message);
    setOpenMove(false);
    setMoveForm({ type: "Entrada", description: "", amount: 0, scope: "Empresa", category: "", bank_account: defaultBankName(banks) });
    loadCaixaAberto();
    loadPeriodo(); // atualiza também a conciliação
  }

  async function closeCash() {
    if (!session?.id) return alert("Não existe caixa aberto.");
    const payload = {
      status: "Fechado",
      closed_at: new Date().toISOString(),
      final_amount: Number(finalAmount ?? totals.saldo ?? 0),
    };
    const { error } = await supabase.from("cash_sessions").update(payload).eq("id", session.id);
    if (error) return alert(error.message);
    setOpenClose(false);
    setFinalAmount(0);
    loadCaixaAberto();
    loadPeriodo();
  }

  async function removeMovement(id) {
    if (!confirm("Excluir movimento?")) return;
    const { error } = await supabase.from("cash_movements").delete().eq("id", id);
    if (error) return alert(error.message);
    loadCaixaAberto();
    loadPeriodo();
  }

  function setMesAtual() {
    const d = new Date();
    setPStart(monthStartYMD(d));
    setPEnd(monthEndYMD(d));
  }

  function setUltimos7Dias() {
    const d = new Date();
    const end = format(d, "yyyy-MM-dd");
    const startDate = new Date(d);
    startDate.setDate(startDate.getDate() - 6);
    const start = format(startDate, "yyyy-MM-dd");
    setPStart(start);
    setPEnd(end);
  }

  
function openTransferModal() {
  const def = defaultBankName(banks);
  setTForm((p) => ({
    ...p,
    scope: p.scope ?? "Empresa",
    date: p.date ?? todayYMD,
    from: p.from || def,
    to: p.to || "",
    amount: p.amount ?? 0,
    notes: p.notes ?? "",
  }));
  setOpenTransfer(true);
}

function isoFromYMD(ymd) {
  // meio-dia para evitar "voltar um dia" por fuso
  return new Date(ymd + "T12:00:00").toISOString();
}

async function saveTransferInCaixa() {
  if (!tForm.from) return alert("Selecione a conta de origem.");
  if (!tForm.to) return alert("Selecione a conta de destino.");
  if (tForm.from === tForm.to) return alert("Origem e destino não podem ser iguais.");
  const amount = Number(tForm.amount ?? 0);
  if (!amount || amount <= 0) return alert("Informe um valor válido.");
  if (!isYMD(tForm.date)) return alert("Informe a data (AAAA-MM-DD).");

  const is_personal = tForm.scope === "Particular";
  const created_at = isoFromYMD(tForm.date);
  const notes = (tForm.notes || "").trim();
  const descBase = `Transferência: ${tForm.from} → ${tForm.to}${notes ? " - " + notes : ""}`;

  const sid = session?.id ?? null; // se caixa aberto, aparece na lista do caixa

  const rows = [
    {
      cash_session_id: sid,
      type: "Saída",
      description: descBase,
      amount,
      is_personal,
      category: "Transferência",
      bank_account: tForm.from,
      created_at,
    },
    {
      cash_session_id: sid,
      type: "Entrada",
      description: descBase,
      amount,
      is_personal,
      category: "Transferência",
      bank_account: tForm.to,
      created_at,
    },
  ];

  const { error } = await supabase.from("cash_movements").insert(rows);
  if (error) return alert(error.message);

  setOpenTransfer(false);
  loadCaixaAberto();
  loadPeriodo();
}

return (
    <RequireAuth>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div className="h1">Caixa</div>
          <div className="small">Abertura • Entradas/Saídas • Fechamento • Conciliação por período</div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className={view === "caixa" ? "btn primary" : "btn"} onClick={() => setView("caixa")}>Caixa (aberto)</button>
          <button className={view === "periodo" ? "btn primary" : "btn"} onClick={() => setView("periodo")}>Conciliação (período)</button>
        </div>
      </div>

      <div style={{ height: 12 }} />

      {view === "caixa" ? (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
            {!session ? (
              <button className="btn primary" onClick={() => setOpenOpen(true)}>Abrir caixa</button>
            ) : (
              <>
                <button className="btn primary" onClick={() => setOpenMove(true)}>+ Movimento</button>
                <button className="btn danger" onClick={() => setOpenClose(true)}>Fechar caixa</button>
              </>
            )}
          </div>

          <div style={{ height: 12 }} />

          <div className="row three">
            <div className="card">
              <div className="h2">Status</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>
                {session ? "Aberto ✅" : "Fechado ❌"}
              </div>
              <div className="small">
                {session ? `Aberto em ${format(new Date(session.opened_at), "dd/MM HH:mm")}` : "Abra o caixa para registrar movimentos"}
              </div>
            </div>

            <div className="card">
              <div className="h2">Entradas</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: "var(--ok)" }}>{money(totals.entradas)}</div>
              <div className="small">Somatório de entradas do caixa</div>
            </div>

            <div className="card">
              <div className="h2">Saídas</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: "var(--danger)" }}>{money(totals.saidas)}</div>
              <div className="small">Somatório de despesas / saídas</div>
            </div>
          </div>

          <div style={{ height: 14 }} />

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div className="h1" style={{ fontSize: 18 }}>Movimentos do caixa</div>
                <div className="small">Saldo atual: <b>{money(totals.saldo)}</b> (inclui valor inicial)</div>
<div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
  <div className="small"><b>Filtro:</b></div>
  <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)} style={{ minWidth: 180 }}>
    <option>Todas</option>
    <option>Empresa</option>
    <option>Particular</option>
  </select>
</div>

              </div>
            </div>

            <div style={{ height: 10 }} />

            <table className="table">
              

<thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Lançamento</th>
              <th>Descrição</th>
              <th>Categoria</th>
              <th>Valor</th>
              <th></th>
            </tr>
          </thead>
              <tbody>
                {filteredMovs.map((m) => (
                  <tr key={m.id}>
                    <td className="small">{format(new Date(m.created_at), "dd/MM HH:mm")}</td>
                    <td>
                      <span className="badge">{m.type}</span>
                    </td>
                    <td><span className="badge">{scopeLabel(m)}</span></td>
                    <td className="small">{m.description ?? "-"}</td>
                    <td style={{ fontWeight: 800 }}>{money(m.amount)}</td>
                    <td style={{ width: 120 }}>
                      <button className="btn danger" onClick={() => removeMovement(m.id)}>Excluir</button>
                    </td>
                  </tr>
                ))}
                {movs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="small">Nenhum movimento ainda.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <Modal open={openOpen} title="Abrir caixa" onClose={() => setOpenOpen(false)}>
            <div className="row">
              <div>
                <label>Valor inicial (troco)</label>
                <input type="number" value={initialAmount} onChange={(e) => setInitialAmount(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className="btn" onClick={() => setOpenOpen(false)}>Cancelar</button>
                <button className="btn primary" onClick={openCash}>Abrir</button>
              </div>
            </div>
          </Modal>

          <Modal open={openMove} title="Novo movimento" onClose={() => setOpenMove(false)}>
            <div className="row three">
              <div>
                <label>Tipo</label>
                <select value={moveForm.type} onChange={(e) => {
                    const t = e.target.value;
                    setMoveForm({ ...moveForm, type: t, category: t === "Saída" ? (moveForm.category || "Outros") : (t === "Entrada" ? "" : moveForm.category) });
                  }}>
                  <option>Entrada</option>
                  <option>Saída</option>
                

            </select>
          </div>
<div>
  <label>Tipo de lançamento</label>
  <select value={moveForm.scope} onChange={(e) => setMoveForm({ ...moveForm, scope: e.target.value })}>
    <option>Empresa</option>
    <option>Particular</option>
  </select>
  <div className="small">Use “Particular” para lançamentos pessoais (não misturam com empresa, mas ficam visíveis na conciliação).</div>
</div>
              <div>
                <label>Valor</label>
                <input type="number" value={moveForm.amount} onChange={(e) => setMoveForm({ ...moveForm, amount: e.target.value })} />
              </div>
            </div>


<div style={{ height: 10 }} />
<div>
  <label>Conta / Banco (opcional)</label>
  <select value={moveForm.bank_account} onChange={(e) => setMoveForm({ ...moveForm, bank_account: e.target.value })}>
    <option value="">—</option>
    {banks.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
  </select>
  <div className="small">Isso faz o lançamento aparecer no saldo da conta em “Bancos”.</div>
</div>

            <div>
              <label>Descrição</label>
              <input value={moveForm.description} onChange={(e) => setMoveForm({ ...moveForm, description: e.target.value })} placeholder="Ex: compra de produto, pagamento, etc" />
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setOpenMove(false)}>Cancelar</button>
              <button className="btn primary" onClick={addMovement}>Salvar</button>
            </div>
          </Modal>

          <Modal open={openClose} title="Fechar caixa" onClose={() => setOpenClose(false)}>
            <div className="row">
              <div className="small">
                Saldo calculado: <b>{money(totals.saldo)}</b>
              </div>
              <div>
                <label>Valor final contado (opcional)</label>
                <input type="number" value={finalAmount} onChange={(e) => setFinalAmount(e.target.value)} placeholder="Se deixar 0, usa saldo calculado" />
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className="btn" onClick={() => setOpenClose(false)}>Cancelar</button>
                <button className="btn danger" onClick={closeCash}>Fechar</button>
              </div>
            </div>
          </Modal>
        </>
      ) : (
        <>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div className="h1" style={{ fontSize: 18 }}>Conciliação por período</div>
                <div className="small">Use este filtro para comparar com o extrato do banco.</div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
                <div>
                  <label>Início</label>
                  <input type="date" value={pStart} onChange={(e) => { const v = e.target.value; if (!v) return; setPStart(v); }} />
                </div>
                <div>
                  <label>Fim</label>
                  <input type="date" value={pEnd} onChange={(e) => { const v = e.target.value; if (!v) return; setPEnd(v); }} />
                </div>

                <button className="btn" onClick={setMesAtual}>Mês atual</button>
                <button className="btn" onClick={setUltimos7Dias}>Últimos 7 dias</button>
                
<div>
  <label>Tipo</label>
  <select value={periodScopeFilter} onChange={(e) => setPeriodScopeFilter(e.target.value)} style={{ minWidth: 180 }}>
    <option>Todas</option>
    <option>Empresa</option>
    <option>Particular</option>
  </select>
</div>

<button className="btn primary" onClick={loadPeriodo}>Consultar</button>
              </div>
            </div>

            <div style={{ height: 12 }} />

            <div className="row three">
              <div className="card">
                <div className="h2">Entradas (período)</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: "var(--ok)" }}>{money(periodTotals.entradas)}</div>
                <div className="small">Somatório de entradas</div>
              </div>

              <div className="card">
                <div className="h2">Saídas (período)</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: "var(--danger)" }}>{money(periodTotals.saidas)}</div>
                <div className="small">Somatório de saídas</div>
              </div>

              <div className="card">
                <div className="h2">Saldo líquido</div>
                <div style={{ fontSize: 26, fontWeight: 900 }}>{money(periodTotals.saldo)}</div>
                <div className="small">Entradas - Saídas (no período)</div>
              </div>
            </div>

            <div style={{ height: 12 }} />

            <table className="table">
              

<thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Lançamento</th>
              <th>Descrição</th>
              <th>Categoria</th>
              <th>Valor</th>
              <th>Caixa</th>
            </tr>
          </thead>
              <tbody>
                {filteredPMovs.map((m) => (
                  <tr key={m.id}>
                    <td className="small">{format(new Date(m.created_at), "dd/MM HH:mm")}</td>
                    <td><span className="badge">{m.type}</span></td>
                    <td><span className="badge">{scopeLabel(m)}</span></td>
                    <td className="small">{m.description ?? "-"}</td>
                    <td style={{ fontWeight: 800 }}>{money(m.amount)}</td>
                    <td className="small">
                      {m.cash_sessions?.status ? (
                        <>
                          {m.cash_sessions.status}
                          {m.cash_sessions.opened_at ? ` • ${format(new Date(m.cash_sessions.opened_at), "dd/MM")}` : ""}
                        </>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
                {pMovs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="small">Nenhum movimento encontrado neste período.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      )}
    
{/* Modal transferência */}
<Modal open={openTransfer} title="Transferência entre contas" onClose={() => setOpenTransfer(false)}>
  <div className="row three">
    <div>
      <label>Tipo de lançamento</label>
      <select value={tForm.scope} onChange={(e) => setTForm({ ...tForm, scope: e.target.value })}>
        <option>Empresa</option>
        <option>Particular</option>
      </select>
    </div>
    <div>
      <label>Data</label>
      <input type="date" value={tForm.date} onChange={(e) => setTForm({ ...tForm, date: e.target.value })} />
    </div>
    <div>
      <label>Valor</label>
      <input type="number" value={tForm.amount} onChange={(e) => setTForm({ ...tForm, amount: e.target.value })} />
    </div>
  </div>

  <div className="row two">
    <div>
      <label>Origem</label>
      <select value={tForm.from} onChange={(e) => setTForm({ ...tForm, from: e.target.value })}>
        <option value="">—</option>
        {banks.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
      </select>
    </div>
    <div>
      <label>Destino</label>
      <select value={tForm.to} onChange={(e) => setTForm({ ...tForm, to: e.target.value })}>
        <option value="">—</option>
        {banks.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
      </select>
    </div>
  </div>

  <div>
    <label>Observação (opcional)</label>
    <input value={tForm.notes} onChange={(e) => setTForm({ ...tForm, notes: e.target.value })} placeholder="Ex: transferência para pagar fornecedor" />
  </div>

  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
    <button className="btn" onClick={() => setOpenTransfer(false)}>Cancelar</button>
    <button className="btn primary" onClick={saveTransferInCaixa}>Salvar</button>
  </div>
</Modal>

</RequireAuth>
  );
}
