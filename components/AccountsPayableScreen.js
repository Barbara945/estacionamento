"use client";

import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import Modal from "@/components/Modal";
import { supabase } from "@/lib/supabaseClient";
import { addDays, addMonths, addWeeks, format } from "date-fns";

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

function round2(n) {
  return Math.round((Number(n ?? 0) + Number.EPSILON) * 100) / 100;
}

function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ""));
}

export default function AccountsPayableScreen({
  title = "Contas a Pagar",
  subtitle = "Cadastro simples + lança no Caixa quando marcar como Pago",
  defaultScope = "Empresa",
  lockScope = false,
  enableCashPosting = true,
}) {
  const now = useMemo(() => new Date(), []);
  const [start, setStart] = useState(() => monthStart(now));
  const [end, setEnd] = useState(() => monthEnd(now));

  const [scope, setScope] = useState(defaultScope); // Empresa | Particular | Todas
  const [supportsPersonal, setSupportsPersonal] = useState(false);

  const [tableName, setTableName] = useState("accounts_payable");

  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);

  const [form, setForm] = useState({
    supplier: "",
    supplier_tax_id: "",
    category: "",
    cost_center: "",
    description: "",
    issue_date: "",
    due_date: format(new Date(), "yyyy-MM-dd"),
    is_personal: false,

    paymentMode: "Único", // Único | Parcelado
    amount: 0,
    installments: 2,

    recurring: false,
    recurrence: "Mensal", // Diário | Semanal | Quinzenal | Mensal
    repeat_until: "", // Repetir até (YYYY-MM-DD)

    status: "Pendente", // Pendente | Pago | Cancelado
  });

  // Detecta nome da tabela (accounts_payable x contas_a_pagar)
  useEffect(() => {
    (async () => {
      const t1 = await supabase.from("accounts_payable").select("id").limit(1);
      if (!t1.error) return setTableName("accounts_payable");
      const t2 = await supabase.from("contas_a_pagar").select("id").limit(1);
      if (!t2.error) return setTableName("contas_a_pagar");
      // mantém padrão
    })();
  }, []);

  // Mantém o filtro quando a página é "Empresa" ou "Particular"
  useEffect(() => {
    setScope(defaultScope);
  }, [defaultScope]);

  // Detecta se existe a coluna is_personal (para separar Empresa x Particular)
  useEffect(() => {
    if (!tableName) return;
    (async () => {
      const t = await supabase.from(tableName).select("is_personal").limit(1);
      setSupportsPersonal(!t.error);
    })();
  }, [tableName]);

  const selectFields = useMemo(() => {
    const base = "id,supplier,supplier_tax_id,category,cost_center,description,issue_date,due_date,status,net_amount,amount,paid_at,posted_to_cash,created_at,recurrence";
    return supportsPersonal ? base + ",is_personal" : base;
  }, [supportsPersonal]);

  

async function load() {
  let q = supabase
    .from(tableName)
    .select(selectFields)
    .order("due_date", { ascending: true });

  // Só aplica filtro quando a data está válida (evita erro: invalid input syntax for type date: "")
  if (isYMD(start)) q = q.gte("due_date", start);
  if (isYMD(end)) q = q.lte("due_date", end);

  // Filtro Empresa/Particular
  if (supportsPersonal && scope !== "Todas") {
    q = q.eq("is_personal", scope === "Particular");
  }

  const { data, error } = await q;

  if (error) return alert(error.message);
  setRows(data ?? []);
}


  useEffect(() => {
    if (!tableName) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, tableName, scope, supportsPersonal]);

  function openNew() {
    setEdit(null);
    setForm({
      supplier: "",
      supplier_tax_id: "",
      category: "",
      cost_center: "",
      description: "",
      issue_date: "",
      due_date: format(new Date(), "yyyy-MM-dd"),
      is_personal: lockScope ? (defaultScope === "Particular") : false,

      paymentMode: "Único",
      amount: 0,
      installments: 2,

      recurring: false,
      recurrence: "Mensal",
      repeat_until: monthEnd(new Date()),

      status: "Pendente",
    });
    setOpen(true);
  }

  function openEdit(row) {
    setEdit(row);
    setForm({
      supplier: row.supplier ?? "",
      supplier_tax_id: row.supplier_tax_id ?? "",
      category: row.category ?? "",
      cost_center: row.cost_center ?? "",
      description: row.description ?? "",
      issue_date: row.issue_date ?? "",
      due_date: row.due_date ?? format(new Date(), "yyyy-MM-dd"),
      is_personal: !!row.is_personal,

      paymentMode: "Único",
      amount: Number(row.net_amount ?? row.amount ?? 0),
      installments: 2,

      recurring: !!row.recurrence,
      recurrence: row.recurrence ?? "Mensal",
      repeat_until: "",

      status: row.status ?? "Pendente",
    });
    setOpen(true);
  }

  async function postToCashIfNeeded(savedRow) {
    if (!savedRow) return;

    // Contas particulares NÃO lançam no Caixa (independente)
    if (!enableCashPosting) return;
    if (supportsPersonal && savedRow.is_personal) return;

    // Só lança no Caixa quando estiver Pago e ainda não lançou
    if (savedRow.status !== "Pago" || savedRow.posted_to_cash) return;

    const { data: sessions } = await supabase
      .from("cash_sessions")
      .select("id,status")
      .eq("status", "Aberto")
      .order("opened_at", { ascending: false })
      .limit(1);

    const session = sessions?.[0] ?? null;

    if (!session?.id) {
      alert("Caixa não está aberto. A conta foi salva como Paga, mas não foi lançada no Caixa.");
      return;
    }

    const amount = Number(savedRow.net_amount ?? savedRow.amount ?? 0);
    const desc = `Conta a Pagar - ${savedRow.description}${savedRow.supplier ? " (" + savedRow.supplier + ")" : ""}`;

    const { error: movErr } = await supabase.from("cash_movements").insert([{
      cash_session_id: session.id,
      type: "Saída",
      description: desc,
      amount,
    }]);

    if (!movErr) {
      await supabase
        .from(tableName)
        .update({ posted_to_cash: true })
        .eq("id", savedRow.id);
    }
  }

  function nextDueDate(baseDueDateStr, recurrence, n) {
    const base = new Date(baseDueDateStr + "T00:00:00");
    if (recurrence === "Diário") return format(addDays(base, n), "yyyy-MM-dd");
    if (recurrence === "Semanal") return format(addWeeks(base, n), "yyyy-MM-dd");
    if (recurrence === "Quinzenal") return format(addDays(base, 14 * n), "yyyy-MM-dd");
    // Mensal
    return format(addMonths(base, n), "yyyy-MM-dd");
  }

  async function save() {
    if (!form.description?.trim()) return alert("Informe a descrição.");
    if (!form.due_date) return alert("Informe o vencimento.");
    if (!form.category?.trim()) return alert("Informe o Plano de Contas.");
    if (Number(form.amount ?? 0) <= 0) return alert("Informe o valor.");

    // Recorrente: precisa de data final
    if (!edit?.id && form.recurring) {
      if (!form.repeat_until) return alert("Informe até quando repetir (Repetir até).");
      if (form.repeat_until < form.due_date) return alert("A data 'Repetir até' precisa ser maior ou igual ao vencimento.");
    }

    // Base payload (campos simples)
    const basePayload = {
      supplier: form.supplier?.trim() || null,
      supplier_tax_id: form.supplier_tax_id?.trim() || null,
      category: form.category?.trim() || null,
      cost_center: form.cost_center?.trim() || null,
      description: form.description.trim(),
      issue_date: form.issue_date || null,
      due_date: form.due_date,
      status: form.status,
      recurrence: form.recurring ? form.recurrence : null,

      // valor
      net_amount: round2(form.amount),
      amount: round2(form.amount), // compat
      paid_at: form.status === "Pago" ? (edit?.paid_at ?? new Date().toISOString()) : null,
    }

    if (supportsPersonal) {
      basePayload.is_personal = lockScope ? (defaultScope === "Particular") : !!form.is_personal;
    }
;

    // Edição: salva só 1 registro
    if (edit?.id) {
      const { data, error } = await supabase
        .from(tableName)
        .update(basePayload)
        .eq("id", edit.id)
        .select("*")
        .single();

      if (error) return alert(error.message);

      // Se marcou como Pago, lança no caixa
      await postToCashIfNeeded(data);

      setOpen(false);
      setEdit(null);
      load();
      return;
    }

    // Novo cadastro
    // 1) Parcelado => cria N contas (uma por parcela)
    if (form.paymentMode === "Parcelado") {
      const n = Math.max(2, Math.min(48, Number(form.installments ?? 2)));
      const total = round2(form.amount);
      const base = Math.floor((total / n) * 100) / 100; // 2 casas, truncado
      const parcels = [];
      let sum = 0;

      for (let i = 1; i <= n; i++) {
        const val = i === n ? round2(total - sum) : round2(base);
        sum = round2(sum + val);

        parcels.push({
          ...basePayload,
          status: "Pendente",
          paid_at: null,
          posted_to_cash: false,
          net_amount: val,
          amount: val,
          due_date: format(addMonths(new Date(form.due_date + "T00:00:00"), i - 1), "yyyy-MM-dd"),
          description: `${basePayload.description} (Parcela ${i}/${n})`,
          recurrence: null, // não mistura parcelado com recorrência
        });
      }

      const { error } = await supabase.from(tableName).insert(parcels);
      if (error) return alert(error.message);

      setOpen(false);
      load();
      return;
    }

    // 2) Único => cria 1 conta
    const { data, error } = await supabase
      .from(tableName)
      .insert([{ ...basePayload, posted_to_cash: false }])
      .select("*")
      .single();

    if (error) return alert(error.message);

    // Se já criou como Pago, lança no caixa
    await postToCashIfNeeded(data);

    // 3) Se for recorrente (conta fixa), cria TODAS as ocorrências até a data escolhida (Repetir até)
if (form.recurring) {
  const until = form.repeat_until;
  const occurrences = [];
  let i = 1;

  while (true) {
    const due = nextDueDate(form.due_date, form.recurrence, i);
    if (due > until) break;

    occurrences.push({
      ...basePayload,
      status: "Pendente",
      paid_at: null,
      posted_to_cash: false,
      due_date: due,
    });

    i += 1;
    if (i > 800) break; // segurança
  }

  if (occurrences.length > 700) {
    alert("Você gerou muitas ocorrências. Para recorrência diária, escolha uma data final menor (ex.: até o fim do mês).");
  }

  if (occurrences.length) {
    const dueDates = occurrences.map((o) => o.due_date);

    // Evita duplicar: verifica quais vencimentos já existem para a mesma descrição
    
let qDup = supabase
  .from(tableName)
  .select("due_date")
  .eq("description", basePayload.description)
  .in("due_date", dueDates);

if (supportsPersonal) {
  qDup = qDup.eq("is_personal", basePayload.is_personal);
}

const { data: exists, error: exErr } = await qDup;

    const existsSet = new Set((exists ?? []).map((e) => e.due_date));
    const toInsert = occurrences.filter((o) => !existsSet.has(o.due_date));

    if (!exErr && toInsert.length) {
      // Insere em lotes para evitar limite do PostgREST
      const chunkSize = 200;
      for (let k = 0; k < toInsert.length; k += chunkSize) {
        const chunk = toInsert.slice(k, k + chunkSize);
        const { error: insErr } = await supabase.from(tableName).insert(chunk);
        if (insErr) {
          alert("Algumas ocorrências não foram criadas: " + insErr.message);
          break;
        }
      }
    }
  }
}

setOpen(false);
    load();
  }

  async function remove(id) {
    if (!confirm("Excluir esta conta a pagar?")) return;
    const { error } = await supabase.from(tableName).delete().eq("id", id);
    if (error) return alert(error.message);
    load();
  }

  async function markPaid(row) {
    if (!confirm("Marcar esta conta como PAGA?")) return;
    const { data, error } = await supabase
      .from(tableName)
      .update({ status: "Pago", paid_at: new Date().toISOString() })
      .eq("id", row.id)
      .select("*")
      .single();
    if (error) return alert(error.message);
    await postToCashIfNeeded(data);
    load();
  }

  const totals = useMemo(() => {
    const paid = rows.filter(r => r.status === "Pago").reduce((a, r) => a + Number(r.net_amount ?? r.amount ?? 0), 0);
    const pending = rows.filter(r => r.status !== "Pago").reduce((a, r) => a + Number(r.net_amount ?? r.amount ?? 0), 0);

    const today = new Date();
    today.setHours(0,0,0,0);
    const overdue = rows
      .filter(r => r.status !== "Pago" && new Date(r.due_date + "T00:00:00") < today)
      .reduce((a, r) => a + Number(r.net_amount ?? r.amount ?? 0), 0);

    return { paid, pending, overdue };
  }, [rows]);

  return (
    <RequireAuth>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <div className="h1">{title}</div>
          <div className="small">{subtitle}</div>
        </div>
        <button className="btn primary" onClick={openNew}>+ Nova conta</button>
      </div>

      <div style={{ height: 12 }} />

      {!supportsPersonal && (
        <div className="card" style={{ border: "1px solid rgba(255,200,0,0.35)" }}>
          <div style={{ fontWeight: 900 }}>⚠️ Banco de dados precisa de atualização</div>
          <div className="small">
            Para separar <b>Empresa</b> x <b>Particular</b>, rode o SQL de atualização (arquivo <b>SUPABASE_SQL_ATUALIZAR_V19.sql</b>) no Supabase.
            Depois, recarregue o cache do schema.
          </div>
        </div>
      )}


      <div className="row three">
        <div className="card">
          <div className="h2">Pendente</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "var(--accent)" }}>{money(totals.pending)}</div>
          <div className="small">Somatório de contas pendentes</div>
        </div>
        <div className="card">
          <div className="h2">Em atraso</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "var(--bad)" }}>{money(totals.overdue)}</div>
          <div className="small">Vencidas e ainda pendentes</div>
        </div>
        <div className="card">
          <div className="h2">Pago</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "var(--ok)" }}>{money(totals.paid)}</div>
          <div className="small">Pagas dentro do período</div>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="card">
        <div className="row three">
          <div>
            <label>Data inicial (vencimento)</label>
            <input type="date" value={start} onChange={(e) => { const v = e.target.value; if (!v) return; setStart(v); }} />
          </div>
          <div>
            <label>Data final (vencimento)</label>
            <input type="date" value={end} onChange={(e) => { const v = e.target.value; if (!v) return; setEnd(v); }} />
          </div>
          <div style={{ display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" }}>
            {!lockScope && supportsPersonal && (
              <div>
                <label>Tipo</label>
                <select value={scope} onChange={(e) => setScope(e.target.value)}>
                  <option>Empresa</option>
                  <option>Particular</option>
                  <option>Todas</option>
                </select>
              </div>
            )}

            <button className="btn" onClick={() => { const d = new Date(); setStart(monthStart(d)); setEnd(monthEnd(d)); }}>Mês atual</button>
            <button className="btn" onClick={load}>Atualizar</button>
          </div>
        </div>

        <div style={{ height: 12 }} />

        <table className="table">
          <thead>
            <tr>
              <th>Venc.</th>
              <th>Descrição</th>
              <th>Fornecedor</th>
              <th>Plano de Contas</th>
              {supportsPersonal && scope === "Todas" && <th>Tipo</th>}
              <th>Status</th>
              <th>Valor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="small">{r.due_date ? format(new Date(r.due_date + "T00:00:00"), "dd/MM/yyyy") : "-"}</td>
                <td style={{ fontWeight: 800 }}>
                  {r.description}
                  {r.recurrence ? <div className="small">Recorrente: {r.recurrence}</div> : null}
                </td>
                <td>
                  {r.supplier ?? "-"}
                  {r.supplier_tax_id ? <div className="small">{r.supplier_tax_id}</div> : null}
                </td>
                <td className="small">{r.category ?? "-"}</td>
                {supportsPersonal && scope === "Todas" && (
                  <td className="small">{r.is_personal ? "Particular" : "Empresa"}</td>
                )}
                <td>
                  <span className="badge">{r.status}</span>
                  {r.posted_to_cash ? <div className="small">No caixa ✅</div> : null}
                </td>
                <td style={{ fontWeight: 800 }}>{money(r.net_amount ?? r.amount ?? 0)}</td>
                <td style={{ width: 320 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {r.status !== "Pago" ? <button className="btn primary" onClick={() => markPaid(r)}>Marcar pago</button> : null}
                    <button className="btn" onClick={() => openEdit(r)}>Editar</button>
                    <button className="btn danger" onClick={() => remove(r.id)}>Excluir</button>
                  </div>
                </td>
              </tr>
            ))}

            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="small">Nenhuma conta no período.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal open={open} title={edit ? "Editar conta a pagar" : "Nova conta a pagar"} onClose={() => setOpen(false)}>
        <div className="row two">
          <div>
            <label>Fornecedor</label>
            <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
          </div>
          <div>
            <label>CNPJ/CPF</label>
            <input value={form.supplier_tax_id} onChange={(e) => setForm({ ...form, supplier_tax_id: e.target.value })} />
          </div>
        </div>

        {supportsPersonal && (
          <div>
            <label>Tipo</label>
            {lockScope ? (
              <div className="badge" style={{ width: "fit-content" }}>
                {form.is_personal ? "Particular" : "Empresa"}
              </div>
            ) : (
              <select
                value={form.is_personal ? "Particular" : "Empresa"}
                onChange={(e) => setForm({ ...form, is_personal: e.target.value === "Particular" })}
              >
                <option>Empresa</option>
                <option>Particular</option>
              </select>
            )}
          </div>
        )}


        <div className="row two">
          <div>
            <label>Plano de contas *</label>
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ex: Fornecedores / Aluguel / Impostos" />
          </div>
          <div>
            <label>Centro de custo</label>
            <input value={form.cost_center} onChange={(e) => setForm({ ...form, cost_center: e.target.value })} placeholder="Ex: Operação / Marketing" />
          </div>
        </div>

        <div>
          <label>Descrição *</label>
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex: Aluguel / Produto / Nota fiscal..." />
        </div>

        <div className="row two">
          <div>
            <label>Emissão</label>
            <input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} />
          </div>
          <div>
            <label>Vencimento *</label>
            <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </div>
        </div>

        {supportsPersonal && (
          <div>
            <label>Tipo</label>
            {lockScope ? (
              <div className="badge" style={{ width: "fit-content" }}>
                {form.is_personal ? "Particular" : "Empresa"}
              </div>
            ) : (
              <select
                value={form.is_personal ? "Particular" : "Empresa"}
                onChange={(e) => setForm({ ...form, is_personal: e.target.value === "Particular" })}
              >
                <option>Empresa</option>
                <option>Particular</option>
              </select>
            )}
          </div>
        )}


        <div className="row two">
          <div>
            <label>Valor (R$) *</label>
            <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label>Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option>Pendente</option>
              <option>Pago</option>
              <option>Cancelado</option>
            </select>
            <div className="small" style={{ marginTop: 6 }}>
              Ao marcar como <b>Pago</b>, o sistema lança automaticamente como <b>Saída</b> no Caixa (se estiver aberto).
            </div>
          </div>
        </div>

        {!edit ? (
          <div className="card" style={{ padding: 12, marginTop: 10 }}>
            <div className="h2">Tipo de pagamento</div>
            <div className="row two">
              <div>
                <label>Único ou Parcelado</label>
                <select value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}>
                  <option>Único</option>
                  <option>Parcelado</option>
                </select>
              </div>
              {form.paymentMode === "Parcelado" ? (
                <div>
                  <label>Nº de parcelas</label>
                  <input
                    type="number"
                    value={form.installments}
                    min={2}
                    max={48}
                    onChange={(e) => setForm({ ...form, installments: e.target.value })}
                  />
                  <div className="small">Cria uma conta por parcela (vencimentos mensais).</div>
                </div>
              ) : (
                <div className="small" style={{ alignSelf: "end" }}>
                  Único pagamento: cria apenas 1 conta.
                </div>
              )}
            </div>

            <div style={{ height: 10 }} />

            <div className="row two">
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={form.recurring}
                  onChange={(e) => setForm({ ...form, recurring: e.target.checked })}
                  style={{ width: 18, height: 18 }}
                />
                <div>
                  <div style={{ fontWeight: 900 }}>Conta fixa (recorrente)</div>
                  <div className="small">O sistema cria as próximas ocorrências até a data escolhida.</div>
                </div>
              </div>

              <div>
                <label>Recorrência</label>
                <select
                  value={form.recurrence}
                  onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
                  disabled={!form.recurring}
                >
                  <option>Diário</option>
                  <option>Semanal</option>
                  <option>Quinzenal</option>
                  <option>Mensal</option>
                </select>
              </div>
            </div>

            {form.recurring ? (
              <div style={{ marginTop: 10 }}>
                <div className="row two">
                  <div>
                    <label>Repetir até *</label>
                    <input
                      type="date"
                      value={form.repeat_until}
                      onChange={(e) => setForm({ ...form, repeat_until: e.target.value })}
                    />
                    <div className="small" style={{ marginTop: 6 }}>
                      O sistema vai gerar automaticamente as próximas contas até essa data.
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setForm({ ...form, repeat_until: monthEnd(new Date(form.due_date + "T00:00:00")) })}
                    >
                      Fim do mês
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setForm({ ...form, repeat_until: format(addMonths(new Date(form.due_date + "T00:00:00"), 1), "yyyy-MM-dd") })}
                    >
                      +1 mês
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setForm({ ...form, repeat_until: format(addMonths(new Date(form.due_date + "T00:00:00"), 3), "yyyy-MM-dd") })}
                    >
                      +3 meses
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn" onClick={() => setOpen(false)}>Cancelar</button>
          <button className="btn primary" onClick={save}>Salvar</button>
        </div>
      </Modal>
    </RequireAuth>
  );
}
