"use client";

import { useEffect, useMemo, useState } from "react";
import RequireAuth from "../../components/RequireAuth";
import { supabase } from "../../lib/supabaseClient";
import Modal from "/components/Modal";

function money(n) {
  const v = Number(n ?? 0);
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));
}

function isoFromYMD(ymd) {
  // meio-dia para evitar "voltar um dia" por fuso
  return new Date(ymd + "T12:00:00").toISOString();
}

export default function BancosPage() {
  const [banks, setBanks] = useState([]);
  const [balances, setBalances] = useState({}); // { [name]: { empresa, particular, total } }
  const [activeSessionId, setActiveSessionId] = useState(null);

  const [openBank, setOpenBank] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({ name: "", type: "Banco", notes: "" });

  const todayYMD = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [openTransfer, setOpenTransfer] = useState(false);
  const [tForm, setTForm] = useState({ scope: "Empresa", date: todayYMD, from: "", to: "", amount: 0, notes: "" });

  async function load() {
    const { data, error } = await supabase.from("bank_accounts").select("*").order("name", { ascending: true });
    if (error) return alert(error.message);
    setBanks(data ?? []);

    
// calcula saldo do dia com base na SESSÃO do CAIXA (saldo inicial + entradas/saídas).
// Não soma dias/saldos anteriores.
const defaultBank =
  (data ?? []).find((b) => /mercado\s*pago/i.test(String(b?.name ?? "")))?.name ||
  (data ?? [])[0]?.name ||
  "MERCADO PAGO";

// pega a sessão do caixa: prioriza "Aberto", senão pega a mais recente
let sid = null;
{
  const { data: sOpen, error: sOpenErr } = await supabase
    .from("cash_sessions")
    .select("id")
    .eq("status", "Aberto")
    .order("opened_at", { ascending: false })
    .limit(1);

  if (sOpenErr) return alert(sOpenErr.message);

  sid = sOpen?.[0]?.id ?? null;

  if (!sid) {
    const { data: sLast, error: sLastErr } = await supabase
      .from("cash_sessions")
      .select("id")
      .order("opened_at", { ascending: false })
      .limit(1);

    if (sLastErr) return alert(sLastErr.message);
    sid = sLast?.[0]?.id ?? null;
  }
}

setActiveSessionId(sid);

if (!sid) {
  setBalances({});
  return;
}

const { data: mv, error: mvErr } = await supabase
  .from("cash_movements")
  .select("type, amount, bank_account, is_personal")
  .eq("cash_session_id", sid);

if (mvErr) return alert(mvErr.message);

const map = {};
    for (const m of mv ?? []) {
      const key = String(m.bank_account ?? "").trim() || defaultBank;

      const sign = m.type === "Saída" ? -1 : 1;
      const amt = Number(m.amount ?? 0) * sign;

      if (!map[key]) map[key] = { empresa: 0, particular: 0, total: 0 };
      if (m.is_personal) map[key].particular += amt;
      else map[key].empresa += amt;
      map[key].total += amt;
    }
    setBalances(map);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNew() {
    setEdit(null);
    setForm({ name: "", type: "Banco", notes: "" });
    setOpenBank(true);
  }

  function openEdit(row) {
    setEdit(row);
    setForm({ name: row.name ?? "", type: row.type ?? "Banco", notes: row.notes ?? "" });
    setOpenBank(true);
  }

  async function saveBank() {
    if (!form.name.trim()) return alert("Informe o nome do banco/conta.");
    const payload = { name: form.name.trim(), type: form.type, notes: form.notes?.trim() || null };

    if (edit?.id) {
      const { error } = await supabase.from("bank_accounts").update(payload).eq("id", edit.id);
      if (error) return alert(error.message);
    } else {
      const { error } = await supabase.from("bank_accounts").insert([payload]);
      if (error) return alert(error.message);
    }

    setOpenBank(false);
    setEdit(null);
    await load();
  }

  async function removeBank(id) {
    if (!confirm("Excluir este banco/conta? (os lançamentos no Caixa não são apagados)")) return;
    const { error } = await supabase.from("bank_accounts").delete().eq("id", id);
    if (error) return alert(error.message);
    load();
  }

  function openTransferModal() {
    const first = banks?.[0]?.name ?? "";
    const second = banks?.[1]?.name ?? "";
    setTForm({ scope: "Empresa", date: todayYMD, from: first, to: second, amount: 0, notes: "" });
    setOpenTransfer(true);
  }

  async function saveTransfer() {
    if (!tForm.from) return alert("Selecione a conta de origem.");
    if (!tForm.to) return alert("Selecione a conta de destino.");
    if (tForm.from === tForm.to) return alert("Origem e destino não podem ser iguais.");
    const amount = Number(tForm.amount ?? 0);
    if (!amount || amount <= 0) return alert("Informe um valor válido.");
    if (!isYMD(tForm.date)) return alert("Informe a data (AAAA-MM-DD).");

    
// garante sessão do caixa para contabilizar no saldo do dia
let sid = activeSessionId;
if (!sid) {
  const { data: sOpen } = await supabase
    .from("cash_sessions")
    .select("id")
    .eq("status", "Aberto")
    .order("opened_at", { ascending: false })
    .limit(1);
  sid = sOpen?.[0]?.id ?? null;
}

    const is_personal = tForm.scope === "Particular";
    const created_at = isoFromYMD(tForm.date);
    const notes = (tForm.notes || "").trim();
    const descBase = `Transferência: ${tForm.from} → ${tForm.to}${notes ? " - " + notes : ""}`;

    const rows = [
      {
        cash_session_id: sid || null,
        type: "Saída",
        description: descBase,
        amount,
        is_personal,
        category: "Transferência",
        bank_account: tForm.from,
        created_at,
      },
      {
        cash_session_id: sid || null,
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
    load();
  }

  function balOf(name) {
    const b = balances?.[name] ?? { empresa: 0, particular: 0, total: 0 };
    return b;
  }

  return (
    <RequireAuth>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div className="h1">Bancos / Contas</div>
          <div className="small">
            O saldo é calculado pelos lançamentos do <b>Caixa</b> (quando você seleciona a Conta/Banco no lançamento).
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn" onClick={openTransferModal} disabled={banks.length < 2}>Transferir entre contas</button>
          <button className="btn primary" onClick={openNew}>+ Novo</button>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Tipo</th>
              <th>Saldo (Empresa)</th>
              <th>Saldo (Particular)</th>
              <th>Saldo (Total)</th>
              <th>Obs.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {banks.map((b) => {
              const bal = balOf(b.name);
              return (
                <tr key={b.id}>
                  <td style={{ fontWeight: 900 }}>{b.name}</td>
                  <td>{b.type}</td>
                  <td style={{ fontWeight: 900 }}>{money(bal.empresa)}</td>
                  <td style={{ fontWeight: 900 }}>{money(bal.particular)}</td>
                  <td style={{ fontWeight: 900 }}>{money(bal.total)}</td>
                  <td className="small">{b.notes ?? "-"}</td>
                  <td style={{ width: 240 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button className="btn" onClick={() => openEdit(b)}>Editar</button>
                      <button className="btn danger" onClick={() => removeBank(b.id)}>Excluir</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {banks.length === 0 ? (
              <tr><td colSpan={7} className="small">Nenhum banco/conta cadastrado.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Modal banco */}
      <Modal open={openBank} title={edit ? "Editar banco/conta" : "Novo banco/conta"} onClose={() => setOpenBank(false)}>
        <div className="row two">
          <div>
            <label>Nome *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label>Tipo</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option>Banco</option>
              <option>Carteira</option>
              <option>Dinheiro</option>
            </select>
          </div>
        </div>

        <div>
          <label>Observações</label>
          <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn" onClick={() => setOpenBank(false)}>Cancelar</button>
          <button className="btn primary" onClick={saveBank}>Salvar</button>
        </div>
      </Modal>

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
          <button className="btn primary" onClick={saveTransfer}>Salvar</button>
        </div>
      </Modal>
    </RequireAuth>
  );
}
