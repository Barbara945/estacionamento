"use client";

import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { supabase } from "@/lib/supabaseClient";
import Modal from "@/components/Modal";
import { addDays, format } from "date-fns";
import { downloadOSPDF } from "@/lib/pdf";

function money(n) {
  const v = Number(n ?? 0);
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function toInputDatetimeLocal(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + Number(minutes ?? 0) * 60000);
}

function safeISODate(ymd, endOfDay = false) {
  if (!ymd) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd))) return null;
  const time = endOfDay ? "23:59:59" : "00:00:00";
  const d = new Date(`${ymd}T${time}`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}


export default function AgendaPage() {
  const [start, setStart] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [end, setEnd] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [appointments, setAppointments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [services, setServices] = useState([]);

  const [open, setOpen] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState(null);

  const [form, setForm] = useState({
    customer_id: "",
    start_time: toInputDatetimeLocal(new Date()),
    end_time: toInputDatetimeLocal(new Date(Date.now() + 60 * 60 * 1000)),
    status: "Agendado",
    notes: "",
  });

  const [items, setItems] = useState([{ service_id: "", qty: 1, unit_price: 0 }]);

// editar serviços/valor do agendamento
const [editOpen, setEditOpen] = useState(false);
const [editing, setEditing] = useState(null); // appointment
const [editItems, setEditItems] = useState([{ service_id: "", qty: 1, unit_price: 0 }]);

// reagendar (trocar data/hora)
const [reschedOpen, setReschedOpen] = useState(false);
const [reschedAppt, setReschedAppt] = useState(null);
const [reschedDT, setReschedDT] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));

  const periodStartISO = useMemo(() => safeISODate(start, false), [start]);
  const periodEndISO = useMemo(() => safeISODate(end, true), [end]);

  function calcTotals(nextItems) {
    const total = (nextItems ?? []).reduce((a, it) => a + Number(it.qty ?? 1) * Number(it.unit_price ?? 0), 0);

    const minutes = (nextItems ?? []).reduce((a, it) => {
      const s = services.find((x) => x.id === it.service_id);
      return a + Number(it.qty ?? 1) * Number(s?.duration_minutes ?? 0);
    }, 0);

    return { total, minutes };
  }

  async function load() {
    if (!periodStartISO || !periodEndISO || !start || !end) {
      setAppointments([]);
      return;
    }

    const { data: cs, error: csErr } = await supabase.from("customers").select("*").order("name", { ascending: true });
    if (csErr) alert("Erro ao carregar clientes: " + csErr.message);
    setCustomers(cs ?? []);

    const { data: sv, error: svErr } = await supabase.from("services").select("*").order("name", { ascending: true });
    if (svErr) alert("Erro ao carregar serviços: " + svErr.message);
    setServices(sv ?? []);

    const { data: appts } = await supabase
      .from("appointments")
      .select("id,customer_id,start_time,end_time,status,total_value,notes, customers(name,phone,car_plate)")
      .gte("start_time", periodStartISO)
      .lte("start_time", periodEndISO)
      .order("start_time", { ascending: true });

    const list = appts ?? [];
    const ids = list.map((a) => a.id);

    // Itens (multi-serviços)
    let itemsByAppt = {};
    if (ids.length) {
      const { data: its, error } = await supabase
        .from("appointment_services")
        .select("appointment_id, service_id, qty, unit_price, services(id, name, duration_minutes)")
        .in("appointment_id", ids);

      if (!error) {
        for (const it of its ?? []) {
          (itemsByAppt[it.appointment_id] = itemsByAppt[it.appointment_id] ?? []).push(it);
        }
      }
    }

    const merged = list.map((a) => {
      const its = itemsByAppt[a.id] ?? [];
      const summary = its.length ? its.map((x) => x.services?.name).filter(Boolean).join(" + ") : "-";
      return { ...a, service_items: its, service_summary: summary };
    });

    setAppointments(merged);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);

// Se abrir o modal e a lista de serviços ainda estiver vazia, tenta recarregar (evita "select vazio").
useEffect(() => {
  if (!openNew) return;
  if (services.length > 0) return;

  (async () => {
    const { data: sv, error: svErr } = await supabase.from("services").select("*").order("name", { ascending: true });
    if (svErr) return alert("Erro ao carregar serviços: " + svErr.message);
    setServices(sv ?? []);
  })();
}, [openNew]);


  // Quando escolhe serviços, sugere total e horário final
  useEffect(() => {
    const { minutes } = calcTotals(items);
    const start = new Date(form.start_time);
    const end = minutes ? addMinutes(start, minutes) : addMinutes(start, 60);
    setForm((prev) => ({ ...prev, end_time: toInputDatetimeLocal(end) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, services, form.start_time]);

  function openNew() {
    setForm({
      customer_id: "",
      start_time: toInputDatetimeLocal(new Date(start + "T09:00:00")),
      end_time: toInputDatetimeLocal(new Date(start + "T10:00:00")),
      status: "Agendado",
      notes: "",
    });
    setItems([{ service_id: "", qty: 1, unit_price: 0 }]);
    setOpen(true);
  }

function openEdit(appt) {
  setEditing(appt);
  const current = (appt?.services_list ?? []).map((it) => ({
    service_id: it.service_id ?? it.services?.id ?? "",
    qty: it.qty ?? 1,
    unit_price: Number(it.unit_price ?? 0),
  }));
  setEditItems(current.length ? current : [{ service_id: "", qty: 1, unit_price: 0 }]);
  setEditOpen(true);
}

function updateEditItem(idx, patch) {
  setEditItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
}

function addEditItem() {
  setEditItems((prev) => [...prev, { service_id: "", qty: 1, unit_price: 0 }]);
}

function removeEditItem(idx) {
  setEditItems((prev) => prev.filter((_, i) => i !== idx));
}

async function saveEdit() {
  if (!editing?.id) return;

  const cleaned = editItems
    .map((it) => ({ ...it, qty: Number(it.qty ?? 1), unit_price: Number(it.unit_price ?? 0) }))
    .filter((it) => it.service_id);

  if (cleaned.length === 0) return alert("Selecione pelo menos 1 serviço.");

  const total = cleaned.reduce((a, it) => a + Number(it.qty) * Number(it.unit_price), 0);

  // Atualiza itens (recria)
  const { error: delErr } = await supabase.from("appointment_services").delete().eq("appointment_id", editing.id);
  if (delErr) return alert(delErr.message);

  const { error: insErr } = await supabase.from("appointment_services").insert(
    cleaned.map((it) => ({
      appointment_id: editing.id,
      service_id: it.service_id,
      qty: it.qty,
      unit_price: it.unit_price,
    }))
  );
  if (insErr) return alert(insErr.message);

  // Atualiza total do agendamento
  const { error: upErr } = await supabase.from("appointments").update({ total_value: total }).eq("id", editing.id);
  if (upErr) return alert(upErr.message);

  // Atualiza pagamento (se existir) para bater com o novo total
  const { data: pRows } = await supabase
    .from("payments")
    .select("*")
    .eq("appointment_id", editing.id)
    .order("created_at", { ascending: false })
    .limit(1);

  const p = pRows?.[0] ?? null;
  if (p?.id) {
    const prevPaid = Number(p.amount_paid ?? (p.status === "Pago" ? Number(p.amount ?? total) : 0));
    const newPaid = Math.min(total, prevPaid);
    const remaining = Math.max(0, total - newPaid);
    const newStatus = remaining <= 0 ? "Pago" : (newPaid > 0 ? "Parcial" : "Pendente");

    const payload = { amount: total, status: newStatus, amount_paid: newPaid };
    const { error } = await supabase.from("payments").update(payload).eq("id", p.id);
    if (error && String(error.message || "").includes("amount_paid")) {
      await supabase.from("payments").update({ amount: total, status: newStatus === "Pago" ? "Pago" : "Pendente" }).eq("id", p.id);
    }
  }

  setEditOpen(false);
  setEditing(null);
  load();
}

function openReschedule(appt) {
  setReschedAppt(appt);
  const dt = appt?.start_time ? new Date(appt.start_time) : new Date();
  setReschedDT(toInputDatetimeLocal(dt));
  setReschedOpen(true);
}

async function saveReschedule() {
  if (!reschedAppt?.id) return;

  const startDT = new Date(reschedDT);
  if (Number.isNaN(startDT.getTime())) return alert("Data/Hora inválida.");

  // duração = diferença entre start/end atual, ou 60 min
  const oldStart = reschedAppt.start_time ? new Date(reschedAppt.start_time) : null;
  const oldEnd = reschedAppt.end_time ? new Date(reschedAppt.end_time) : null;
  const durationMin =
    oldStart && oldEnd && !Number.isNaN(oldStart.getTime()) && !Number.isNaN(oldEnd.getTime())
      ? Math.max(15, Math.round((oldEnd.getTime() - oldStart.getTime()) / 60000))
      : 60;

  const endDT = addMinutes(startDT, durationMin);

  const { error } = await supabase
    .from("appointments")
    .update({ start_time: startDT.toISOString(), end_time: endDT.toISOString() })
    .eq("id", reschedAppt.id);

  if (error) return alert(error.message);

  setReschedOpen(false);
  setReschedAppt(null);
  load();
}


  function updateItem(idx, patch) {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));

    // se alterou o serviço, puxa preço automaticamente
    const changed = next[idx];
    if (patch.service_id) {
      const s = services.find((x) => x.id === patch.service_id);
      next[idx] = { ...changed, unit_price: Number(s?.price ?? 0) };
    }

    setItems(next);
  }

  function addItem() {
    setItems((prev) => [...prev, { service_id: "", qty: 1, unit_price: 0 }]);
  }

  function removeItem(idx) {
    const next = items.filter((_, i) => i !== idx);
    setItems(next.length ? next : [{ service_id: "", qty: 1, unit_price: 0 }]);
  }

  async function save() {
    if (!form.customer_id) return alert("Escolha o cliente.");

    const validItems = items.filter((it) => it.service_id);
    if (!validItems.length) return alert("Adicione pelo menos 1 serviço.");

    const { total } = calcTotals(validItems);

    const payload = {
      customer_id: form.customer_id,
      start_time: new Date(form.start_time).toISOString(),
      end_time: new Date(form.end_time).toISOString(),
      status: form.status,
      notes: form.notes,
      total_value: Number(total ?? 0),
    };

    const { data, error } = await supabase.from("appointments").insert([payload]).select("id").single();
    if (error) return alert(error.message);

    const apptId = data?.id;

    // itens do agendamento
    const rows = validItems.map((it) => ({
      appointment_id: apptId,
      service_id: it.service_id,
      qty: Number(it.qty ?? 1),
      unit_price: Number(it.unit_price ?? 0),
    }));
    const { error: itErr } = await supabase.from("appointment_services").insert(rows);
    if (itErr) return alert(itErr.message);

    // cria pagamento pendente (padrão)
    await supabase.from("payments").insert([{
      appointment_id: apptId,
      method: "Pix",
      amount: Number(total ?? 0),
      status: "Pendente",
      paid_at: null,
      bank_account: null
    }]);

    setOpen(false);
    load();
  }

  async function remove(id) {
    if (!confirm("Excluir agendamento?")) return;
    const { error } = await supabase.from("appointments").delete().eq("id", id);
    if (error) return alert(error.message);
    load();
  }

async function updateStatus(id, status) {
  setStatusBusyId(id);
  const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
  setStatusBusyId(null);
  if (error) return alert(error.message);
  setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
}

  async function osPDF(appt) {
    try {
      const { data: pays } = await supabase
        .from("payments")
        .select("*")
        .eq("appointment_id", appt.id)
        .order("created_at", { ascending: false })
        .limit(1);

      // carrega itens (serviços)
      const { data: its } = await supabase
        .from("appointment_services")
        .select("appointment_id, qty, unit_price, services(name)")
        .eq("appointment_id", appt.id);

      const payment = pays?.[0] ?? null;
      const appointment = { ...appt, service_items: its ?? [] };

      await downloadOSPDF({ appointment, payment });
    } catch {
      alert("Erro ao gerar PDF.");
    }
  }

  const totals = useMemo(() => {
    const sum = appointments.reduce((a, x) => a + Number(x.total_value ?? 0), 0);
    return { sum };
  }, [appointments]);

  return (
    <RequireAuth>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <div className="h1">Agenda</div>
          <div className="small">Agendamentos por período • filtro De/Até • (multi-serviços) • v11</div>
        </div>
        <button className="btn primary" onClick={openNew}>+ Novo agendamento</button>
      </div>

      <div style={{ height: 12 }} />

      <div className="row three">
        <div className="card">
          <div className="h2">Período</div>
          <div className="row two">
            <div>
              <label>De</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label>Até</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button className="btn" onClick={() => { const d = new Date(); const s = format(d, "yyyy-MM-dd"); setStart(s); setEnd(s); }}>Hoje</button>
            <button className="btn" onClick={() => { const d = new Date(); const e = format(d, "yyyy-MM-dd"); const s = format(addDays(d, -6), "yyyy-MM-dd"); setStart(s); setEnd(e); }}>Últimos 7 dias</button>
            <button className="btn" onClick={load}>Atualizar</button>
          </div>
          <div className="small" style={{ marginTop: 6 }}>Filtra por período</div>
        </div>
        <div className="card">
          <div className="h2">Agendamentos</div>
          <div style={{ fontSize: 26, fontWeight: 900 }}>{appointments.length}</div>
          <div className="small">Total do período</div>
        </div>
        <div className="card">
          <div className="h2">Valor previsto</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "var(--accent)" }}>{money(totals.sum)}</div>
          <div className="small">Somatório do período</div>
        </div>
      </div>

      <div style={{ height: 14 }} />

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Hora</th>
              <th>Cliente</th>
              <th>Serviços</th>
              <th>Status</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((a) => (
              <tr key={a.id}>
                <td className="small">{format(new Date(a.start_time), "dd/MM")}</td>
                <td className="small">{format(new Date(a.start_time), "HH:mm")}</td>
                <td style={{ fontWeight: 900 }}>{a.customers?.name ?? "-"}</td>
                <td>{a.service_summary ?? "-"}</td>
                <td>
              <select
                value={a.status ?? "Agendado"}
                disabled={statusBusyId === a.id}
                onChange={(e) => updateStatus(a.id, e.target.value)}
                style={{ minWidth: 150 }}
              >
                <option>Agendado</option>
                <option>Em andamento</option>
                <option>Concluído</option>
                <option>Cancelado</option>
              </select>
              {statusBusyId === a.id ? <div className="small">Salvando...</div> : null}
            </td>
                <td style={{ fontWeight: 900 }}>{money(a.total_value ?? 0)}</td>
                <td style={{ width: 320 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn" onClick={() => openEdit(a)}>Editar</button>
                    <button className="btn" onClick={() => openReschedule(a)}>Reagendar</button>
                    <button className="btn" onClick={() => osPDF(a)}>OS PDF</button>
                    <button className="btn danger" onClick={() => remove(a.id)}>Excluir</button>
                  </div>
                </td>
              </tr>
            ))}
            {appointments.length === 0 ? (
              <tr><td colSpan={7} className="small">Nenhum agendamento nesse período.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal open={open} title="Novo agendamento" onClose={() => setOpen(false)}>
        <div className="row two">
          <div>
            <label>Cliente *</label>
            <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
              <option value="">Selecione…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label>Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option>Agendado</option>
              <option>Em andamento</option>
              <option>Concluído</option>
              <option>Cancelado</option>
            </select>
          </div>
        </div>

        <div style={{ height: 6 }} />
        <div className="h2">Serviços do agendamento</div>

        {items.map((it, idx) => (
          <div key={idx} className="row three" style={{ alignItems: "end" }}>
            <div>
              <label>Serviço *</label>
              <select value={it.service_id} onChange={(e) => updateItem(idx, { service_id: e.target.value })}>
                <option value="">Selecione…</option>
                {services.length === 0 && <option value="" disabled>(Nenhum serviço encontrado — confira a aba Serviços)</option>}
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div>
              <label>Qtd</label>
              <input type="number" min="1" value={it.qty} onChange={(e) => updateItem(idx, { qty: e.target.value })} />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "end" }}>
              <div style={{ flex: 1 }}>
                <label>Preço (R$)</label>
                <input type="number" value={it.unit_price} onChange={(e) => updateItem(idx, { unit_price: e.target.value })} />
              </div>
              <button className="btn danger" onClick={() => removeItem(idx)} style={{ height: 40 }}>-</button>
            </div>
          </div>
        ))}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <button className="btn" onClick={addItem}>+ Adicionar serviço</button>
          <div style={{ fontWeight: 900 }}>Total: {money(calcTotals(items.filter(x => x.service_id)).total)}</div>
        </div>

        <div style={{ height: 10 }} />

        <div className="row two">
          <div>
            <label>Início</label>
            <input type="datetime-local" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
          </div>
          <div>
            <label>Fim (calculado)</label>
            <input type="datetime-local" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
          </div>
        </div>

        <div>
          <label>Observações</label>
          <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn" onClick={() => setOpen(false)}>Cancelar</button>
          <button className="btn primary" onClick={save}>Salvar</button>
        </div>
      </Modal>

<Modal open={editOpen} title="Editar agendamento" onClose={() => setEditOpen(false)}>
  <div className="row">
    <label>Serviços (pode ajustar o valor)</label>
  </div>

  <div className="card" style={{ padding: 10, marginBottom: 10 }}>
    {editItems.map((it, idx) => (
      <div key={idx} className="row three">
        <div>
          <label>Serviço</label>
          <select
            value={it.service_id}
            onChange={(e) => {
              const sid = e.target.value;
              const svc = services.find((s) => String(s.id) === String(sid));
              updateEditItem(idx, {
                service_id: sid,
                unit_price: svc ? Number(svc.price ?? 0) : Number(it.unit_price ?? 0),
              });
            }}
          >
            <option value="">—</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label>Qtd</label>
          <input
            type="number"
            value={it.qty}
            onChange={(e) => updateEditItem(idx, { qty: e.target.value })}
          />
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
          <div style={{ flex: 1 }}>
            <label>Valor (unit.)</label>
            <input
              type="number"
              value={it.unit_price}
              onChange={(e) => updateEditItem(idx, { unit_price: e.target.value })}
            />
          </div>
          <button className="btn danger" onClick={() => removeEditItem(idx)} style={{ height: 40 }}>-</button>
        </div>
      </div>
    ))}

    <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 8, alignItems: "center" }}>
      <button className="btn" onClick={addEditItem}>+ Adicionar serviço</button>
      <div style={{ fontWeight: 900 }}>
        Total: {money(editItems.reduce((a, it) => a + Number(it.qty || 0) * Number(it.unit_price || 0), 0))}
      </div>
    </div>
  </div>

  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
    <button className="btn" onClick={() => setEditOpen(false)}>Cancelar</button>
    <button className="btn primary" onClick={saveEdit}>Salvar</button>
  </div>

  <div className="small" style={{ marginTop: 8 }}>
    Dica: o total do agendamento e o total do pagamento (se existir) serão ajustados para bater.
  </div>
</Modal>

<Modal open={reschedOpen} title="Reagendar" onClose={() => setReschedOpen(false)}>
  <div className="row two">
    <div>
      <label>Nova data e hora</label>
      <input
        type="datetime-local"
        value={reschedDT}
        onChange={(e) => setReschedDT(e.target.value)}
      />
    </div>
  </div>

  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
    <button className="btn" onClick={() => setReschedOpen(false)}>Cancelar</button>
    <button className="btn primary" onClick={saveReschedule}>Salvar</button>
  </div>
</Modal>
    </RequireAuth>
  );
}
