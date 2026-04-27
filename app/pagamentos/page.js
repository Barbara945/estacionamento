"use client";

import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import Modal from "@/components/Modal";
import { supabase } from "@/lib/supabaseClient";
import { addDays, format } from "date-fns";

function money(n) {
  const v = Number(n ?? 0);
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function monthStart(d) {
  return format(new Date(d.getFullYear(), d.getMonth(), 1), "yyyy-MM-dd");
}
function monthEnd(d) {
  return format(new Date(d.getFullYear(), d.getMonth() + 1, 0), "yyyy-MM-dd");
}
function defaultDueDateForAppt(start_time_iso) {
  // Regra (C): se não tiver previsão/vencimento, considera 1 dia após o serviço
  if (!start_time_iso) return format(addDays(new Date(), 1), "yyyy-MM-dd");
  return format(addDays(new Date(start_time_iso), 1), "yyyy-MM-dd");
}

function safeISODate(ymd, endOfDay = false) {
  if (!ymd) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd))) return null;
  const time = endOfDay ? "23:59:59" : "00:00:00";
  const d = new Date(`${ymd}T${time}`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}


const METHOD_OPTIONS = [
  "Pix",
  "Dinheiro",
  "Cartão de Crédito",
  "Cartão de Débito",
  "Transferência",
  "Link",
  "Outro",
];

export default function PagamentosPage() {
  const today = useMemo(() => new Date(), []);
  const [start, setStart] = useState(() => monthStart(today));
  const [end, setEnd] = useState(() => monthEnd(today));

  // Importante: totais SEMPRE por período (De/Até)
  // O período pode ser aplicado por "Vencimento" ou por "Agendamento"
  const [queryMode, setQueryMode] = useState("Vencimento"); // "Vencimento" | "Agendamento"

  // filtros só afetam a tabela, não os totais
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);

  const [allRows, setAllRows] = useState([]);   // base (por período)
  const [viewRows, setViewRows] = useState([]); // com filtros (pendente/atrasado)

  const [banks, setBanks] = useState([]);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  const [form, setForm] = useState({
    method: "Pix",
    bank_account: "",
    amount: 0,
    entry_now: 0,
        due_date: "",          // previsão de recebimento (vencimento)
    addToCash: true,
  });

  const startISO = useMemo(() => safeISODate(start, false), [start]);
  const endISO = useMemo(() => safeISODate(end, true), [end]);

  const todayYMD = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const todayDate = useMemo(() => new Date(todayYMD + "T00:00:00"), [todayYMD]);

  async function loadBanksOnce() {
    const { data: bks } = await supabase.from("bank_accounts").select("*").order("name", { ascending: true });
    setBanks(bks ?? []);
  }

  function calcDueDate(paymentOrNull, appt) {
    return paymentOrNull?.due_date ?? defaultDueDateForAppt(appt?.start_time);
  }

  function calcIsOverdue(paymentOrNull, appt) {
    const total = Number(paymentOrNull?.amount ?? appt?.total_value ?? 0);
    const paid = Number(
      paymentOrNull?.amount_paid ??
      (paymentOrNull?.status === "Pago" ? total : 0)
    );
    const remaining = Math.max(0, total - paid);

    const due = calcDueDate(paymentOrNull, appt);
    const dueDate = new Date(due + "T00:00:00");
    return remaining > 0 && dueDate < todayDate;
}

  function withinPeriodByDue(dueYMD) {
    // compara como string yyyy-mm-dd (serve porque é ordenável)
    if (!dueYMD) return false;
    return dueYMD >= start && dueYMD <= end;
  }

  async function load() {
    if (!startISO || !endISO || !start || !end) {
      setAllRows([]);
      setViewRows([]);
      return;
    }

    // 1) Agendamentos no período (para modo Agendamento e também para completar dados no modo Vencimento)
    const { data: apptsInRange } = await supabase
      .from("appointments")
      .select("id, start_time, status, total_value, customers(name)")
      .gte("start_time", startISO)
      .lte("start_time", endISO);

    // 2) No modo Vencimento, precisamos também trazer tudo que tem vencimento no período (mesmo se o serviço foi antes)
    let paysDueInRange = [];
    if (queryMode === "Vencimento") {
      const { data: paysDue } = await supabase
        .from("payments")
        .select("*")
        .gte("due_date", start)
        .lte("due_date", end)
        .order("created_at", { ascending: false });

      paysDueInRange = paysDue ?? [];
    }

    // 3) Escolher IDs conforme modo
    const idsSet = new Set();

    if (queryMode === "Agendamento") {
      (apptsInRange ?? []).forEach((a) => idsSet.add(a.id));
    } else {
      // Vencimento
      (paysDueInRange ?? []).forEach((p) => { if (p.appointment_id) idsSet.add(p.appointment_id); });
      // Também adiciona agendamentos do período (caso não tenha payment mas o vencimento padrão caia dentro)
      (apptsInRange ?? []).forEach((a) => idsSet.add(a.id));
    }

    const ids = Array.from(idsSet);
    if (!ids.length) {
      setAllRows([]);
      setViewRows([]);
      return;
    }

    // 4) Buscar agendamentos para todos IDs
    const { data: appts } = await supabase
      .from("appointments")
      .select("id, start_time, status, total_value, customers(name)")
      .in("id", ids);

    // 5) Serviços
    let itemsByAppt = {};
    const { data: its, error: itsErr } = await supabase
      .from("appointment_services")
      .select("appointment_id, services(name)")
      .in("appointment_id", ids);

    if (!itsErr) {
      for (const it of its ?? []) {
        (itemsByAppt[it.appointment_id] = itemsByAppt[it.appointment_id] ?? []).push(it);
      }
    }

    // 6) Pagamentos (último por agendamento)
    let paymentsById = {};
    const { data: pays } = await supabase
      .from("payments")
      .select("*")
      .in("appointment_id", ids)
      .order("created_at", { ascending: false });

    for (const p of pays ?? []) {
      if (!paymentsById[p.appointment_id]) paymentsById[p.appointment_id] = p;
    }

    // 7) Merge
    let merged = (appts ?? []).map((a) => {
      const its = itemsByAppt[a.id] ?? [];
      const service_summary = its.length ? its.map((x) => x.services?.name).filter(Boolean).join(" + ") : "-";
      const payment = paymentsById[a.id] ?? null;

      const due_date = calcDueDate(payment, a);
      const isOverdue = calcIsOverdue(payment, a);

      return {
        ...a,
        service_summary,
        payment,
        due_date,
        isOverdue,
      };
    });

    // 8) Aplicar PERÍODO (totais por período)
    if (queryMode === "Agendamento") {
      // já está por start_time, mas garante
      merged = merged.filter((a) => {
        const t = new Date(a.start_time).toISOString();
        return t >= startISO && t <= endISO;
      });
      merged.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    } else {
      // Vencimento: período é pelo due_date (previsão)
      merged = merged.filter((r) => withinPeriodByDue(r.due_date));
      merged.sort((a, b) => {
        const da = a.due_date ?? "9999-12-31";
        const db = b.due_date ?? "9999-12-31";
        if (da < db) return -1;
        if (da > db) return 1;
        return new Date(a.start_time) - new Date(b.start_time);
      });
    }

    setAllRows(merged);

    // 9) filtros de tabela (não afeta os totais)
    let filtered = merged;
    if (onlyPending) filtered = filtered.filter((r) => (r.payment?.status ?? "Pendente") !== "Pago");
    if (onlyOverdue) filtered = filtered.filter((r) => r.isOverdue);

    setViewRows(filtered);
  }

  useEffect(() => {
    loadBanksOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, queryMode, onlyOverdue, onlyPending]);

  function openEdit(appt) {
    const p = appt.payment;
    setSelected(appt);

    const computedDue = p?.due_date ?? defaultDueDateForAppt(appt.start_time);

    setForm({
      method: p?.method ?? "Pix",
      bank_account: p?.bank_account ?? "",
      amount: Number(p?.amount ?? appt.total_value ?? 0),
      entry_now: 0,
      due_date: computedDue,
      addToCash: true,
    });
setOpen(true);
  }

async function deletePayment(row) {
  if (!row?.id) return;

  const ok = confirm(
    "Excluir o lançamento de pagamento deste agendamento?\n\nObs: isso remove o registro em 'Pagamentos/Contas a Receber'. Movimentações já lançadas no Caixa não são apagadas automaticamente."
  );
  if (!ok) return;

  // apaga TODOS os pagamentos vinculados ao agendamento (limpa duplicados antigos também)
  const { error } = await supabase
    .from("payments")
    .delete()
    .eq("appointment_id", row.id);

  if (error) return alert(error.message);

  load();
}


  async function savePayment() {
    if (!selected) return;

    const dueToSave = form.due_date || defaultDueDateForAppt(selected.start_time);

    const { data: existing } = await supabase
      .from("payments")
      .select("*")
      .eq("appointment_id", selected.id)
      .order("created_at", { ascending: false })
      .limit(1);

    const current = existing?.[0] ?? null;

    const total = Number(form.amount ?? 0);
    const prevPaid = Number(
      current?.amount_paid ??
      (current?.status === "Pago" ? Number(current?.amount ?? total) : 0)
    );

    const entryNow = Math.max(0, Number(form.entry_now ?? 0));
    const newPaid = Math.min(total, prevPaid + entryNow);
    const remaining = Math.max(0, total - newPaid);
    const newStatus = remaining <= 0 ? "Pago" : (newPaid > 0 ? "Parcial" : "Pendente");

    const payload = {
      method: form.method,
      bank_account: form.bank_account || null,
      amount: total,
      amount_paid: newPaid,
      status: newStatus,
      due_date: dueToSave,
      paid_at: newStatus === "Pago" ? (current?.paid_at ?? new Date().toISOString()) : null,
    };

    let saveErr = null;

    if (current?.id) {
      const { error } = await supabase.from("payments").update(payload).eq("id", current.id);
      saveErr = error;
      if (saveErr && String(saveErr.message || "").includes("amount_paid")) {
        const { error: e2 } = await supabase.from("payments").update({
          method: payload.method,
          bank_account: payload.bank_account,
          amount: payload.amount,
          status: payload.status === "Pago" ? "Pago" : "Pendente",
          due_date: payload.due_date,
          paid_at: payload.paid_at,
        }).eq("id", current.id);
        saveErr = e2;
      }
    } else {
      const { error } = await supabase.from("payments").insert([{ appointment_id: selected.id, ...payload }]);
      saveErr = error;
      if (saveErr && String(saveErr.message || "").includes("amount_paid")) {
        const { error: e2 } = await supabase.from("payments").insert([{
          appointment_id: selected.id,
          method: payload.method,
          bank_account: payload.bank_account,
          amount: payload.amount,
          status: payload.status === "Pago" ? "Pago" : "Pendente",
          due_date: payload.due_date,
          paid_at: payload.paid_at,
        }]);
        saveErr = e2;
      }
    }

    if (saveErr) {
      if (String(saveErr.message || "").includes("amount_paid")) {
        return alert("Falta criar a coluna amount_paid no Supabase. Rode o arquivo SUPABASE_SQL_ATUALIZAR_V33.sql e tente novamente.");
      }
      return alert(saveErr.message);
    }

    if (entryNow > 0 && form.addToCash) {
      const { data: sessions } = await supabase
        .from("cash_sessions")
        .select("*")
        .eq("status", "Aberto")
        .order("opened_at", { ascending: false })
        .limit(1);

      const session = sessions?.[0] ?? null;

      if (session?.id) {
        const desc = `Recebimento - ${selected.customers?.name ?? "Cliente"} (${selected.service_summary ?? "Serviços"}) - ${form.method}`;
        const { error: mvErr } = await supabase.from("cash_movements").insert([{
          cash_session_id: session.id,
          type: "Entrada",
          description: desc,
          amount: entryNow,
          is_personal: false,
          category: "Recebimento",
          bank_account: (form.bank_account || null),
        }]);
        if (mvErr) alert(mvErr.message);
      } else {
        alert("Caixa não está aberto. O recebimento foi salvo, mas não entrou no Caixa.");
      }
    }

    setOpen(false);
    setSelected(null);
    load();
  }

  const totals = useMemo(() => {
  const paid = allRows.reduce((a, r) => {
    const total = Number(r.payment?.amount ?? r.total_value ?? 0);
    const paidNow = Number(r.payment?.amount_paid ?? (r.payment?.status === "Pago" ? total : 0));
    return a + paidNow;
  }, 0);

  const toReceive = allRows.reduce((a, r) => {
    const total = Number(r.payment?.amount ?? r.total_value ?? 0);
    const paidNow = Number(r.payment?.amount_paid ?? (r.payment?.status === "Pago" ? total : 0));
    const remaining = Math.max(0, total - paidNow);
    return a + remaining;
  }, 0);

  const overdue = allRows.reduce((a, r) => {
    if (!r.isOverdue) return a;
    const total = Number(r.payment?.amount ?? r.total_value ?? 0);
    const paidNow = Number(r.payment?.amount_paid ?? (r.payment?.status === "Pago" ? total : 0));
    const remaining = Math.max(0, total - paidNow);
    return a + remaining;
  }, 0);

  return { paid, toReceive, overdue };
}, [allRows]);

  function setHoje() {
    const d = new Date();
    const s = format(d, "yyyy-MM-dd");
    setStart(s);
    setEnd(s);
  }
  function setUltimos7Dias() {
    const d = new Date();
    const s = format(addDays(d, -6), "yyyy-MM-dd");
    const e = format(d, "yyyy-MM-dd");
    setStart(s);
    setEnd(e);
  }
  function setMesAtual() {
    const d = new Date();
    setStart(monthStart(d));
    setEnd(monthEnd(d));
  }

  const modalTotal = Number(form.amount ?? selected?.total_value ?? 0);
const modalPrevPaid = Number(
  selected?.payment?.amount_paid ??
  (selected?.payment?.status === "Pago" ? Number(selected?.payment?.amount ?? modalTotal) : 0)
);
const modalEntryNow = Math.max(0, Number(form.entry_now ?? 0));
const modalNewPaid = Math.min(modalTotal, modalPrevPaid + modalEntryNow);
const modalRemaining = Math.max(0, modalTotal - modalNewPaid);
const modalStatusLabel = modalRemaining <= 0 ? "Pago" : (modalNewPaid > 0 ? "Parcial" : "Pendente");

return (
    <RequireAuth>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div className="h1">Pagamentos / Contas a Receber</div>
          <div className="small">
            Totais por período (De/Até): <b>Pago</b> • <b>A receber</b> • <b>Em atraso</b>
          </div>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="row three">
        <div className="card">
          <div className="h2">Pago (Total do período)</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "var(--ok)" }}>{money(totals.paid)}</div>
          <div className="small">Pagos dentro do período</div>
        </div>
        <div className="card">
          <div className="h2">A receber (Total do período)</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "var(--accent)" }}>{money(totals.toReceive)}</div>
          <div className="small">Pendentes dentro do período</div>
        </div>
        <div className="card">
          <div className="h2">Em atraso (Total do período)</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "var(--bad)" }}>{money(totals.overdue)}</div>
          <div className="small">Vencimento antes de hoje</div>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="card">
        <div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "end", flexWrap: "wrap" }}>
          <div className="row two" style={{ margin: 0 }}>
            <div>
              <label>De</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label>Até</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={setHoje}>Hoje</button>
            <button className="btn" onClick={setUltimos7Dias}>Últimos 7 dias</button>
            <button className="btn" onClick={setMesAtual}>Mês atual</button>
            <button className="btn" onClick={load}>Atualizar</button>
          </div>
        </div>

        <div style={{ height: 10 }} />

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <label>Consultar por</label>
            <select value={queryMode} onChange={(e) => setQueryMode(e.target.value)}>
              <option>Vencimento</option>
              <option>Agendamento</option>
            </select>
            <div className="small">
              Se não tiver vencimento, o sistema assume <b>+1 dia</b> após o serviço.
            </div>
          </div>

          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
            Mostrar só pendentes
          </label>

          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
            Mostrar só atrasados
          </label>
        </div>

        <div style={{ height: 12 }} />

        <table className="table">
          <thead>
            <tr>
              <th>Venc.</th>
              <th>Data</th>
              <th>Hora</th>
              <th>Cliente</th>
              <th>Serviços</th>
              <th>Pagamento</th>
              <th>Total</th>
              <th>Pago</th>
              <th>Falta</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {viewRows.map((r) => {
              const total = Number(r.payment?.amount ?? r.total_value ?? 0);
              const paidAmt = Number(r.payment?.amount_paid ?? (r.payment?.status === "Pago" ? total : 0));
              const remaining = Math.max(0, total - paidAmt);
              const payStatus = remaining <= 0 ? "Pago" : (paidAmt > 0 ? "Parcial" : "Pendente");
              const badgeClass = r.isOverdue ? "badge bad" : (payStatus === "Pago" ? "badge ok" : (payStatus === "Parcial" ? "badge warn" : "badge"));
              return (
                <tr key={r.id}>
                  <td className="small">{r.due_date ? format(new Date(r.due_date + "T00:00:00"), "dd/MM") : "-"}</td>
                  <td className="small">{format(new Date(r.start_time), "dd/MM")}</td>
                  <td className="small">{format(new Date(r.start_time), "HH:mm")}</td>
                  <td style={{ fontWeight: 900 }}>{r.customers?.name ?? "-"}</td>
                  <td>{r.service_summary ?? "-"}</td>
                  <td>
                    <span className={badgeClass}>{payStatus}</span>
                    <div className="small">{r.payment?.method ? `(${r.payment.method})` : ""}</div>
                    {r.isOverdue ? <div className="small" style={{ color: "var(--bad)" }}>Atrasado</div> : null}
                  </td>
                  <td style={{ fontWeight: 900 }}>{money(total)}</td>
                  <td style={{ fontWeight: 900 }}>{money(paidAmt)}</td>
                  <td style={{ fontWeight: 900 }}>{money(remaining)}</td>
                  <td style={{ width: 180 }}>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="btn" onClick={() => openEdit(r)}>Editar</button>
                    <button className="btn danger" onClick={() => deletePayment(r)}>Excluir</button>
                  </div>
                  </td>
                </tr>
              );
            })}
            {viewRows.length === 0 ? (
              <tr><td colSpan={10} className="small">Nenhum registro nesse período.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal open={open} title="Pagamento" onClose={() => setOpen(false)}>
        <div className="row two">
          <div>
            <label>Forma de recebimento</label>
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              {METHOD_OPTIONS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>

          <div>
            <label>Conta / Banco (opcional)</label>
            <select value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })}>
              <option value="">—</option>
              {banks.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
            <div className="small">Cadastre em “Bancos” se precisar</div>
          </div>
        </div>

        <div className="row two">
          <div>
            <label>Valor total</label>
            <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>

          <div>
            <label>Entrada recebida agora</label>
            <input
              type="number"
              value={form.entry_now}
              onChange={(e) => setForm({ ...form, entry_now: e.target.value })}
              placeholder="0"
            />
            <div className="small">
              Já pago: <b>{money(modalPrevPaid)}</b> • Após entrada: <b>{money(modalNewPaid)}</b> • Falta: <b>{money(modalRemaining)}</b> • Status: <b>{modalStatusLabel}</b>
            </div>
          </div>
        </div>

        <div className="row two">
          <div>
            <label>Vencimento (previsão de recebimento)</label>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            />
            <div className="small">
              Se ficar vazio, o sistema salva automaticamente <b>+1 dia</b> após o serviço.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "end", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn"
              onClick={() => setForm({ ...form, due_date: format(addDays(new Date(), 1), "yyyy-MM-dd") })}
            >
              Venc. amanhã
            </button>
            <button
              className="btn"
              onClick={() => setForm({ ...form, due_date: format(addDays(new Date(), 7), "yyyy-MM-dd") })}
            >
              +7 dias
            </button>
          </div>
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
          <input
            type="checkbox"
            checked={form.addToCash}
            onChange={(e) => setForm({ ...form, addToCash: e.target.checked })}
          />
          Lançar como ENTRADA no Caixa (se estiver aberto) quando registrar uma entrada (parcial ou total)
        </label>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn" onClick={() => setOpen(false)}>Cancelar</button>
          <button className="btn primary" onClick={savePayment}>Salvar</button>
        </div>

        <div className="small" style={{ marginTop: 10 }}>
          ✅ Dica: para receber depois, deixe <b>Entrada = 0</b> e ajuste o <b>Vencimento</b> (ou deixe vazio para +1 dia).
        </div>
      </Modal>
    </RequireAuth>
  );
}
