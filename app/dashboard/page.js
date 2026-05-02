"use client";

import { useEffect, useMemo, useState } from "react";
import RequireAuth from "../../components/RequireAuth";
import { supabase } from "../lib/supabaseClient";
import { addDays, format } from "date-fns";

function money(n) {
  const v = Number(n ?? 0);
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
}
function endOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
}
function dateFromInput(s) {
  // input date vem como yyyy-mm-dd
  if (!s) return new Date();
  return new Date(s + "T00:00:00");
}


async function detectAccountsPayableTable() {
  // Detecta nome da tabela (accounts_payable x contas_a_pagar)
  const t1 = await supabase.from("accounts_payable").select("id").limit(1);
  if (!t1.error) return "accounts_payable";
  const t2 = await supabase.from("contas_a_pagar").select("id").limit(1);
  if (!t2.error) return "contas_a_pagar";
  return null;
}

async function hasColumn(table, column) {
  const t = await supabase.from(table).select(column).limit(1);
  return !t.error;
}

export default function DashboardPage() {
  const today = useMemo(() => new Date(), []);

  // Hoje (para "Recebido hoje")
  const dayStart = useMemo(() => startOfDay(today), [today]);
  const dayEnd = useMemo(() => endOfDay(today), [today]);

  // Agenda: filtro por período (default = próximos 7 dias)
  const [agendaStartStr, setAgendaStartStr] = useState(() => format(startOfDay(today), "yyyy-MM-dd"));
  const [agendaEndStr, setAgendaEndStr] = useState(() => format(endOfDay(addDays(today, 6)), "yyyy-MM-dd"));

  const agendaStart = useMemo(() => startOfDay(dateFromInput(agendaStartStr)), [agendaStartStr]);
  const agendaEnd = useMemo(() => endOfDay(dateFromInput(agendaEndStr)), [agendaEndStr]);

  const [todayPaid, setTodayPaid] = useState(0);

  const [receivablePendingTotal, setReceivablePendingTotal] = useState(0);
  const [receivablePendingCount, setReceivablePendingCount] = useState(0);

  const [overduePayableTotal, setOverduePayableTotal] = useState(0);
  const [overduePayableCount, setOverduePayableCount] = useState(0);

  const [forecastReceivable7Total, setForecastReceivable7Total] = useState(0);
  const [forecastReceivable7Count, setForecastReceivable7Count] = useState(0);

  const [overduePersonalTotal, setOverduePersonalTotal] = useState(0);
  const [overduePersonalCount, setOverduePersonalCount] = useState(0);

  const [agendaAppointments, setAgendaAppointments] = useState([]);

  async function loadRecebidoHoje() {
    const { data: payPaid } = await supabase
      .from("payments")
      .select("amount, status, paid_at")
      .eq("status", "Pago")
      .gte("paid_at", dayStart.toISOString())
      .lte("paid_at", dayEnd.toISOString());

    setTodayPaid((payPaid ?? []).reduce((acc, p) => acc + Number(p.amount ?? 0), 0));
  }

  

async function loadPendencias() {
  try {
    const today = new Date();
    const todayYMD = format(today, "yyyy-MM-dd");

    // 1) Contas a receber pendentes (geral)
    const { data: payPending, error: ppErr } = await supabase
      .from("payments")
      .select("id,amount,status")
      .neq("status", "Pago");

    if (ppErr) throw ppErr;

    setReceivablePendingTotal((payPending ?? []).reduce((a, r) => a + Number(r.amount ?? 0), 0));
    setReceivablePendingCount((payPending ?? []).length);

    // 2) Contas a pagar vencidas (EMPRESA) e (PARTICULAR)
    const accountsPayableTable = await detectAccountsPayableTable();

    // Zera por segurança (evita ficar valor velho)
    setOverduePayableTotal(0);
    setOverduePayableCount(0);
    setOverduePersonalTotal(0);
    setOverduePersonalCount(0);

    if (accountsPayableTable) {
      const supportsPersonal = await hasColumn(accountsPayableTable, "is_personal");

      async function fetchOverdue(isPersonalValueOrNull) {
        // tenta com net_amount
        let select = supportsPersonal
          ? "id,status,due_date,net_amount,is_personal,amount"
          : "id,status,due_date,net_amount,amount";

        let q = supabase
          .from(accountsPayableTable)
          .select(select)
          .lt("due_date", todayYMD)
          .neq("status", "Pago");

        if (supportsPersonal && isPersonalValueOrNull !== null) {
          q = q.eq("is_personal", isPersonalValueOrNull);
        }

        let { data, error } = await q;

        // Se der erro por coluna, tenta sem net_amount (bancos antigos)
        if (error && String(error.message || "").toLowerCase().includes("net_amount")) {
          select = supportsPersonal
            ? "id,status,due_date,amount,is_personal"
            : "id,status,due_date,amount";

          q = supabase
            .from(accountsPayableTable)
            .select(select)
            .lt("due_date", todayYMD)
            .neq("status", "Pago");

          if (supportsPersonal && isPersonalValueOrNull !== null) {
            q = q.eq("is_personal", isPersonalValueOrNull);
          }

          ({ data, error } = await q);
        }

        if (error) throw error;
        return data ?? [];
      }

      // EMPRESA
      const overdueCompany = supportsPersonal ? await fetchOverdue(false) : await fetchOverdue(null);
      setOverduePayableTotal(
        (overdueCompany ?? []).reduce((a, r) => a + Number(r.net_amount ?? r.amount ?? 0), 0)
      );
      setOverduePayableCount((overdueCompany ?? []).length);

      // PARTICULAR (só se tiver is_personal)
      if (supportsPersonal) {
        const overduePersonal = await fetchOverdue(true);
        setOverduePersonalTotal(
          (overduePersonal ?? []).reduce((a, r) => a + Number(r.net_amount ?? r.amount ?? 0), 0)
        );
        setOverduePersonalCount((overduePersonal ?? []).length);
      }
    }

    // 3) Previsão de recebimento (próximos 7 dias)
    const dueStart = todayYMD;
    const dueEnd = format(addDays(today, 6), "yyyy-MM-dd");

    function defaultDueDateFromStart(startTimeISO) {
      if (!startTimeISO) return null;
      const dt = new Date(startTimeISO);
      dt.setDate(dt.getDate() + 1); // regra: se não tiver vencimento, fica +1 dia após o serviço
      return format(dt, "yyyy-MM-dd");
    }

    // pagamentos pendentes com due_date dentro do período
    const { data: paysDue, error: paysDueErr } = await supabase
      .from("payments")
      .select("appointment_id,amount,status,due_date,created_at")
      .gte("due_date", dueStart)
      .lte("due_date", dueEnd)
      .neq("status", "Pago")
      .order("created_at", { ascending: false });

    if (paysDueErr) throw paysDueErr;

    // serviços cujo vencimento é calculado automaticamente (+1 dia) e cai nos próximos 7 dias
    const apptStartISO = addDays(today, -1).toISOString();
    const apptEnd = addDays(today, 5);
    apptEnd.setHours(23, 59, 59, 999);
    const apptEndISO = apptEnd.toISOString();

    const { data: apptsDefault, error: apptsErr } = await supabase
      .from("appointments")
      .select("id,start_time,total_value")
      .gte("start_time", apptStartISO)
      .lte("start_time", apptEndISO);

    if (apptsErr) throw apptsErr;

    const idsSet = new Set();
    (paysDue ?? []).forEach((p) => p.appointment_id && idsSet.add(p.appointment_id));
    (apptsDefault ?? []).forEach((a) => a.id && idsSet.add(a.id));

    const ids = Array.from(idsSet);
    if (!ids.length) {
      setForecastReceivable7Total(0);
      setForecastReceivable7Count(0);
      return;
    }

    const { data: apptsAll, error: apptsAllErr } = await supabase
      .from("appointments")
      .select("id,start_time,total_value")
      .in("id", ids);

    if (apptsAllErr) throw apptsAllErr;

    const { data: paysAll, error: paysAllErr } = await supabase
      .from("payments")
      .select("appointment_id,amount,status,due_date,created_at")
      .in("appointment_id", ids)
      .order("created_at", { ascending: false });

    if (paysAllErr) throw paysAllErr;

    const apptMap = new Map((apptsAll ?? []).map((a) => [a.id, a]));
    const latestPay = new Map();
    for (const p of paysAll ?? []) {
      if (!latestPay.has(p.appointment_id)) latestPay.set(p.appointment_id, p);
    }

    let total = 0;
    let count = 0;

    for (const id of ids) {
      const appt = apptMap.get(id);
      const pay = latestPay.get(id);

      const status = pay?.status ?? "Pendente";
      if (status === "Pago") continue;

      const due = pay?.due_date ?? defaultDueDateFromStart(appt?.start_time);
      if (!due) continue;

      if (due >= dueStart && due <= dueEnd) {
        const amt = Number(pay?.amount ?? appt?.total_value ?? 0);
        total += amt;
        count += 1;
      }
    }

    setForecastReceivable7Total(total);
    setForecastReceivable7Count(count);
  } catch (e) {
    alert(e?.message ?? String(e));
  }
}


async function loadAgenda
() {
    const { data: appts, error: apptErr } = await supabase
      .from("appointments")
      .select("id,start_time,end_time,status,total_value, customers(name)")
      .gte("start_time", agendaStart.toISOString())
      .lte("start_time", agendaEnd.toISOString())
      .order("start_time", { ascending: true });

    if (apptErr) {
      setAgendaAppointments([]);
      return;
    }

    const ids = (appts ?? []).map((a) => a.id);
    let itemsByAppt = {};

    if (ids.length) {
      // Se a tabela appointment_services não existir ainda, isso só vai falhar silenciosamente e a lista mostra "-"
      const { data: its, error } = await supabase
        .from("appointment_services")
        .select("appointment_id, services(name)")
        .in("appointment_id", ids);

      if (!error) {
        for (const it of its ?? []) {
          (itemsByAppt[it.appointment_id] = itemsByAppt[it.appointment_id] ?? []).push(it);
        }
      }
    }

    const merged = (appts ?? []).map((a) => {
      const its = itemsByAppt[a.id] ?? [];
      const summary = its.length ? its.map((x) => x.services?.name).filter(Boolean).join(" + ") : "-";
      return { ...a, service_summary: summary };
    });

    setAgendaAppointments(merged);
  }

  useEffect(() => {
    loadRecebidoHoje();
    loadPendencias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // carrega uma vez

  useEffect(() => {
    loadAgenda();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendaStartStr, agendaEndStr]);

  function setProximos7Dias() {
    const d = new Date();
    setAgendaStartStr(format(d, "yyyy-MM-dd"));
    setAgendaEndStr(format(addDays(d, 6), "yyyy-MM-dd"));
  }

  function setMesAtual() {
    const d = new Date();
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    setAgendaStartStr(format(start, "yyyy-MM-dd"));
    setAgendaEndStr(format(end, "yyyy-MM-dd"));
  }

  const agendaCount = agendaAppointments.length;

  return (
    <RequireAuth>
      <div className="h1">Dashboard</div>
      <div className="small">
        Hoje: {format(new Date(), "dd/MM/yyyy")}
      </div>

      <div style={{ height: 12 }} />

      <div className="row three">
        <div className="card">
          <div className="h2">Recebido hoje</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "var(--ok)" }}>{money(todayPaid)}</div>
          <div className="small">Pagamentos com status “Pago” hoje</div>
        </div>

        
<div className="card">
  <div className="h2">Pendências</div>

  <div className="row two">
    <div>
      <div className="small">Contas a receber (pendente)</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: "var(--good)" }}>
        {money(receivablePendingTotal)}
      </div>
      <div className="small">{receivablePendingCount} lançamento(s)</div>
    </div>

    <div>
      <div className="small">Previsão de recebimento (próx. 7 dias)</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: "var(--good)" }}>
        {money(forecastReceivable7Total)}
      </div>
      <div className="small">{forecastReceivable7Count} serviço(s)/título(s)</div>
    </div>
  </div>

  <div style={{ height: 10 }} />

  <div className="row two">
    <div>
      <div className="small">Contas vencidas (empresa)</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: "var(--bad)" }}>
        {money(overduePayableTotal)}
      </div>
      <div className="small">{overduePayableCount} título(s)</div>
    </div>

    <div>
      <div className="small">Contas vencidas (particular)</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: "var(--bad)" }}>
        {money(overduePersonalTotal)}
      </div>
      <div className="small">{overduePersonalCount} título(s)</div>
    </div>
  </div>

  <div className="small" style={{ marginTop: 8 }}>
    “Previsão” usa o Vencimento do pagamento; se não tiver vencimento, considera +1 dia após o serviço.
  </div>
</div>

<div className="card">
  <div className="h2">Agenda (período)</div>
          <div style={{ fontSize: 26, fontWeight: 900 }}>{agendaCount}</div>
          <div className="small">
            {format(agendaStart, "dd/MM")} até {format(agendaEnd, "dd/MM")}
          </div>
        </div>
      </div>

      <div style={{ height: 14 }} />

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div className="h2">Agenda por período</div>
            <div className="small">
              Filtre por datas e veja os agendamentos do intervalo escolhido.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
            <div>
              <label>De</label>
              <input type="date" value={agendaStartStr} onChange={(e) => setAgendaStartStr(e.target.value)} />
            </div>
            <div>
              <label>Até</label>
              <input type="date" value={agendaEndStr} onChange={(e) => setAgendaEndStr(e.target.value)} />
            </div>
            <button className="btn" onClick={setProximos7Dias}>Próximos 7 dias</button>
            <button className="btn" onClick={setMesAtual}>Mês atual</button>
            <button className="btn" onClick={loadAgenda}>Atualizar</button>
          </div>
        </div>

        <div style={{ height: 12 }} />

        <table className="table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Hora</th>
              <th>Cliente</th>
              <th>Serviços</th>
              <th>Status</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {agendaAppointments.map((a) => (
              <tr key={a.id}>
                <td className="small">{format(new Date(a.start_time), "dd/MM")}</td>
                <td className="small">{format(new Date(a.start_time), "HH:mm")}</td>
                <td style={{ fontWeight: 900 }}>{a.customers?.name ?? "-"}</td>
                <td>{a.service_summary ?? "-"}</td>
                <td><span className="badge">{a.status}</span></td>
                <td style={{ fontWeight: 900 }}>{money(a.total_value ?? 0)}</td>
              </tr>
            ))}
            {agendaAppointments.length === 0 ? (
              <tr><td colSpan={6} className="small">Sem agendamentos no período.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </RequireAuth>
  );
}
