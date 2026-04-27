import { PDFDocument, StandardFonts } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";

function money(n) {
  const v = Number(n ?? 0);
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ymd(d) {
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function safeStr(v) {
  return (v ?? "").toString();
}

function trunc(s, max = 60) {
  const t = safeStr(s);
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

async function detectTable(supabase, candidates) {
  for (const name of candidates) {
    const t = await supabase.from(name).select("id").limit(1);
    if (!t.error) return name;
  }
  return candidates[0];
}

function parseStartEnd(searchParams) {
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!start || !end) return { start: null, end: null };
  // basic validation yyyy-mm-dd
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return { start: null, end: null };
  return { start, end };
}

function asISOStart(ymdStr) {
  return new Date(ymdStr + "T00:00:00.000Z").toISOString();
}
function asISOEnd(ymdStr) {
  return new Date(ymdStr + "T23:59:59.999Z").toISOString();
}

function addDaysYMD(ymdStr, days) {
  const d = new Date(ymdStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return ymd(d);
}

function dueFromAppointmentPlusOne(appointmentStartISO) {
  if (!appointmentStartISO) return addDaysYMD(ymd(new Date()), 1);
  const d = new Date(appointmentStartISO);
  d.setDate(d.getDate() + 1);
  return ymd(d);
}

export async function GET(req) {
  const url = new URL(req.url);
  const { start, end } = parseStartEnd(url.searchParams);

  if (!start || !end) {
    return new Response("Parâmetros inválidos. Use ?start=YYYY-MM-DD&end=YYYY-MM-DD", { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnon) {
    return new Response("Variáveis do Supabase não encontradas (.env.local).", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const todayYMD = ymd(new Date());

  // Detectar tabelas (para compatibilidade)
  const accountsPayableTable = await detectTable(supabase, ["accounts_payable", "contas_a_pagar"]);
  const paymentsTable = await detectTable(supabase, ["payments", "pagamentos"]);

  // 1) Clientes
  const { data: customers } = await supabase
    .from("customers")
    .select("name, phone")
    .order("name", { ascending: true });

  // 2) Serviços
  const { data: services } = await supabase
    .from("services")
    .select("name, price")
    .order("name", { ascending: true });

  // 3) Contas a pagar (por período - due_date)
  const { data: ap } = await supabase
    .from(accountsPayableTable)
    .select("supplier,supplier_tax_id,category,cost_center,description,issue_date,due_date,status,net_amount,amount,paid_at")
    .gte("due_date", start)
    .lte("due_date", end)
    .order("due_date", { ascending: true });

  const apRows = (ap ?? []).map((r) => ({
    ...r,
    value: Number(r.net_amount ?? r.amount ?? 0),
  }));

  const apPaid = apRows.filter((r) => (r.status ?? "Pendente") === "Pago");
  const apOverdue = apRows.filter((r) => (r.status ?? "Pendente") !== "Pago" && safeStr(r.due_date) < todayYMD);
  const apUpcoming = apRows.filter((r) => (r.status ?? "Pendente") !== "Pago" && safeStr(r.due_date) >= todayYMD);

  const apTotalPaid = apPaid.reduce((a, r) => a + r.value, 0);
  const apTotalOverdue = apOverdue.reduce((a, r) => a + r.value, 0);
  const apTotalUpcoming = apUpcoming.reduce((a, r) => a + r.value, 0);

  // 4) Contas a receber (por período - vencimento/previsão)
  // Regra C: se payment.due_date estiver vazio, considera +1 dia após o serviço.
  // Estratégia:
  // - busca payments com due_date dentro do período
  // - busca appointments cujo (start_time + 1 dia) cai no período (para cobrir due_date vazio)
  const { data: paysDue } = await supabase
    .from(paymentsTable)
    .select("appointment_id, amount, status, method, due_date, paid_at, created_at")
    .gte("due_date", start)
    .lte("due_date", end)
    .order("created_at", { ascending: false });

  // appointments cujo +1 cai no período
  const apptStartFrom = addDaysYMD(start, -1);
  const apptStartTo = addDaysYMD(end, -1);

  const { data: apptsForDefaultDue } = await supabase
    .from("appointments")
    .select("id, start_time, total_value, customers(name)")
    .gte("start_time", asISOStart(apptStartFrom))
    .lte("start_time", asISOEnd(apptStartTo));

  const idsSet = new Set();
  for (const p of paysDue ?? []) if (p.appointment_id) idsSet.add(p.appointment_id);
  for (const a of apptsForDefaultDue ?? []) if (a.id) idsSet.add(a.id);
  const ids = Array.from(idsSet);

  let apptsMap = new Map();
  if (ids.length) {
    const { data: apptsAll } = await supabase
      .from("appointments")
      .select("id, start_time, total_value, customers(name)")
      .in("id", ids);
    for (const a of apptsAll ?? []) apptsMap.set(a.id, a);
  }

  // latest payment per appointment
  let latestPay = {};
  if (ids.length) {
    const { data: paysAll } = await supabase
      .from(paymentsTable)
      .select("appointment_id, amount, status, method, due_date, paid_at, created_at")
      .in("appointment_id", ids)
      .order("created_at", { ascending: false });

    for (const p of paysAll ?? []) {
      if (!latestPay[p.appointment_id]) latestPay[p.appointment_id] = p;
    }
  }

  // montar rows por período (vencimento)
  const arRowsAll = ids
    .map((id) => {
      const a = apptsMap.get(id);
      const p = latestPay[id] ?? null;

      const due = p?.due_date ?? dueFromAppointmentPlusOne(a?.start_time);
      const status = p?.status ?? "Pendente";
      const amount = Number(p?.amount ?? a?.total_value ?? 0);
      const method = p?.method ?? "—";
      const paid_at = p?.paid_at ?? null;

      const isOverdue = status !== "Pago" && safeStr(due) < todayYMD;

      return {
        appointment_id: id,
        cliente: a?.customers?.name ?? "—",
        start_time: a?.start_time ?? null,
        due_date: due,
        status,
        method,
        amount,
        paid_at,
        isOverdue,
      };
    })
    .filter((r) => safeStr(r.due_date) >= start && safeStr(r.due_date) <= end)
    .sort((a, b) => safeStr(a.due_date).localeCompare(safeStr(b.due_date)));

  const arPaid = arRowsAll.filter((r) => r.status === "Pago");
  const arPending = arRowsAll.filter((r) => r.status !== "Pago" && !r.isOverdue);
  const arOverdue = arRowsAll.filter((r) => r.isOverdue);

  const arTotalPaid = arPaid.reduce((a, r) => a + r.amount, 0);
  const arTotalPending = arPending.reduce((a, r) => a + r.amount, 0);
  const arTotalOverdue = arOverdue.reduce((a, r) => a + r.amount, 0);

  // 5) Balanço / método / ticket médio / top serviços
  const startISO = asISOStart(start);
  const endISO = asISOEnd(end);

  const { data: paysPaidInPeriod } = await supabase
    .from(paymentsTable)
    .select("amount, method, status, paid_at, appointment_id")
    .eq("status", "Pago")
    .gte("paid_at", startISO)
    .lte("paid_at", endISO);

  const entradasTotal = (paysPaidInPeriod ?? []).reduce((a, p) => a + Number(p.amount ?? 0), 0);

  const entradasByMethod = {};
  const paidApptSet = new Set();
  for (const p of paysPaidInPeriod ?? []) {
    const k = p.method ?? "—";
    entradasByMethod[k] = (entradasByMethod[k] ?? 0) + Number(p.amount ?? 0);
    if (p.appointment_id) paidApptSet.add(p.appointment_id);
  }
  const paidApptCount = paidApptSet.size;
  const ticketMedio = paidApptCount ? entradasTotal / paidApptCount : 0;

  // Saídas: contas a pagar pagas no período (paid_at). Se paid_at estiver vazio, cai no período pelo due_date (fallback).
  const { data: apPaidMaybe } = await supabase
    .from(accountsPayableTable)
    .select("supplier,description,category,cost_center,amount,net_amount,status,paid_at,due_date")
    .eq("status", "Pago");

  const saidasRows = (apPaidMaybe ?? []).filter((r) => {
    if (r.paid_at) {
      const t = new Date(r.paid_at).toISOString();
      return t >= startISO && t <= endISO;
    }
    // fallback
    return safeStr(r.due_date) >= start && safeStr(r.due_date) <= end;
  });

  const saidasTotal = saidasRows.reduce((a, r) => a + Number(r.net_amount ?? r.amount ?? 0), 0);

  const saldo = entradasTotal - saidasTotal;

  // Top serviços (por quantidade e por soma de preço)
  const { data: apptsInPeriod } = await supabase
    .from("appointments")
    .select("id, start_time")
    .gte("start_time", startISO)
    .lte("start_time", endISO);

  const apptIds = (apptsInPeriod ?? []).map((a) => a.id);
  let topServices = [];
  if (apptIds.length) {
    const { data: its, error } = await supabase
      .from("appointment_services")
      .select("appointment_id, services(name, price)")
      .in("appointment_id", apptIds);

    if (!error) {
      const agg = {};
      for (const it of its ?? []) {
        const name = it.services?.name ?? "—";
        const price = Number(it.services?.price ?? 0);
        if (!agg[name]) agg[name] = { name, qty: 0, revenue: 0 };
        agg[name].qty += 1;
        agg[name].revenue += price;
      }
      topServices = Object.values(agg).sort((a, b) => b.qty - a.qty).slice(0, 12);
    }
  }

  // ------------------ PDF ------------------
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = [595.28, 841.89]; // A4
  let page = doc.addPage(pageSize);
  let y = 810;
  const marginX = 40;

  function newPage() {
    page = doc.addPage(pageSize);
    y = 810;
  }

  function line(text, size = 10, bold = false) {
    const f = bold ? fontBold : font;
    if (y < 50) newPage();
    page.drawText(text, { x: marginX, y, size, font: f });
    y -= size + 4;
  }

  function spacer(h = 10) {
    y -= h;
    if (y < 50) newPage();
  }

  function section(title) {
    spacer(6);
    line(title, 14, true);
    spacer(4);
  }

  function keyValue(k, v) {
    line(`${k}: ${v}`, 10, false);
  }

  function table(headers, rows, colXs) {
    // header
    if (y < 80) newPage();
    const sizeH = 9;
    for (let i = 0; i < headers.length; i++) {
      page.drawText(headers[i], { x: colXs[i], y, size: sizeH, font: fontBold });
    }
    y -= 14;

    const size = 9;
    for (const r of rows) {
      if (y < 60) newPage();
      for (let i = 0; i < r.length; i++) {
        page.drawText(trunc(r[i], 40), { x: colXs[i], y, size, font });
      }
      y -= 12;
    }
  }

  line("Relatório Financeiro - NC Sistema", 18, true);
  line(`Período: ${start} até ${end}`, 11, false);
  spacer(10);

  section("1) Balanço (Entradas x Saídas)");
  keyValue("Entradas (pagamentos pagos no período)", money(entradasTotal));
  keyValue("Saídas (contas a pagar pagas no período)", money(saidasTotal));
  keyValue("Saldo (entradas - saídas)", money(saldo));
  keyValue("Ticket médio (entradas / nº atendimentos pagos)", money(ticketMedio));
  spacer(8);

  section("2) Entradas por forma de recebimento");
  const methodRows = Object.entries(entradasByMethod)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => [k, money(v)]);
  if (!methodRows.length) line("Sem entradas no período.", 10, false);
  else table(["Forma", "Valor"], methodRows, [marginX, 320]);

  spacer(8);
  section("3) Serviços que mais saíram (Top 12)");
  if (!topServices.length) line("Sem dados de serviços no período.", 10, false);
  else {
    const rows = topServices.map((s) => [s.name, String(s.qty), money(s.revenue)]);
    table(["Serviço", "Qtd", "Receita (estimada)"], rows, [marginX, 310, 420]);
  }

  spacer(10);
  section("4) Contas a receber (por vencimento/previsão) no período");
  keyValue("Recebido (Pago)", money(arTotalPaid));
  keyValue("A receber (Pendente)", money(arTotalPending));
  keyValue("Em atraso (Vencido)", money(arTotalOverdue));
  spacer(6);

  const arPreview = arRowsAll.slice(0, 120).map((r) => [
    r.due_date,
    r.cliente,
    r.status + (r.isOverdue ? " (Atraso)" : ""),
    money(r.amount),
    r.method,
  ]);
  if (!arPreview.length) line("Sem contas a receber no período.", 10, false);
  else table(["Venc.", "Cliente", "Status", "Valor", "Forma"], arPreview, [marginX, 120, 300, 420, 500]);

  if (arRowsAll.length > 120) {
    spacer(6);
    line(`(Mostrando 120 de ${arRowsAll.length} registros)`, 9, false);
  }

  spacer(10);
  section("5) Contas a pagar (por vencimento) no período");
  keyValue("Em atraso", money(apTotalOverdue));
  keyValue("A vencer", money(apTotalUpcoming));
  keyValue("Pagas", money(apTotalPaid));
  spacer(6);

  const apPreview = apRows.slice(0, 120).map((r) => [
    safeStr(r.due_date),
    safeStr(r.supplier),
    safeStr(r.status ?? "Pendente") + (safeStr(r.due_date) < todayYMD && (r.status ?? "Pendente") !== "Pago" ? " (Atraso)" : ""),
    money(r.value),
    safeStr(r.category),
  ]);
  if (!apPreview.length) line("Sem contas a pagar no período.", 10, false);
  else table(["Venc.", "Fornecedor", "Status", "Valor", "Categoria"], apPreview, [marginX, 120, 300, 420, 505]);

  if (apRows.length > 120) {
    spacer(6);
    line(`(Mostrando 120 de ${apRows.length} registros)`, 9, false);
  }

  spacer(10);
  section("6) Cadastro - Serviços e valores");
  const svcPreview = (services ?? []).slice(0, 160).map((s) => [safeStr(s.name), money(s.price ?? 0)]);
  if (!svcPreview.length) line("Sem serviços cadastrados.", 10, false);
  else table(["Serviço", "Valor"], svcPreview, [marginX, 380]);
  if ((services ?? []).length > 160) line(`(Mostrando 160 de ${(services ?? []).length})`, 9, false);

  spacer(10);
  section("7) Cadastro - Clientes (nome e telefone)");
  const custPreview = (customers ?? []).slice(0, 200).map((c) => [safeStr(c.name), safeStr(c.phone)]);
  if (!custPreview.length) line("Sem clientes cadastrados.", 10, false);
  else table(["Nome", "Telefone"], custPreview, [marginX, 360]);
  if ((customers ?? []).length > 200) line(`(Mostrando 200 de ${(customers ?? []).length})`, 9, false);

  spacer(14);
  line("Gerado automaticamente pelo NC Sistema.", 9, false);

  const pdfBytes = await doc.save();
  const filename = `relatorio_${start}_a_${end}.pdf`;

  return new Response(pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
