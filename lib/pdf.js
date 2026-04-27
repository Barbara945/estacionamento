"use client";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { COMPANY } from "@/config/company";

function money(n) {
  const v = Number(n ?? 0);
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function shortId(id) {
  if (!id) return "";
  return String(id).replaceAll("-", "").slice(0, 8).toUpperCase();
}

function fmtDateTime(iso) {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yy} ${hh}:${mi}`;
  } catch {
    return String(iso ?? "");
  }
}

export async function downloadOSPDF({ appointment, payment }) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 40;
  let y = height - margin;

  const draw = (text, size = 11, bold = false) => {
    page.drawText(String(text ?? ""), {
      x: margin,
      y,
      size,
      font: bold ? fontBold : font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= size + 6;
  };

  const hr = () => {
    page.drawLine({
      start: { x: margin, y: y - 4 },
      end: { x: width - margin, y: y - 4 },
      thickness: 1,
      color: rgb(0.85, 0.85, 0.85),
    });
    y -= 16;
  };

  // Cabeçalho
  draw(COMPANY.name ?? "Ordem de Serviço", 16, true);
  if (COMPANY.subtitle) draw(COMPANY.subtitle, 10, false);
  draw(`OS: ${shortId(appointment?.id)} • Data: ${fmtDateTime(appointment?.start_time)}`, 10, false);
  hr();

  // Cliente
  const cust = appointment?.customers ?? appointment?.customer ?? null;
  draw("DADOS DO CLIENTE", 11, true);
  draw(`Nome: ${cust?.name ?? "-"}`);
  draw(`Telefone: ${cust?.phone ?? "-"}`);
  draw(`Placa: ${cust?.car_plate ?? "-"}`);
  hr();

  // Serviços (multi)
  draw("SERVIÇOS", 11, true);

  const items = Array.isArray(appointment?.service_items) ? appointment.service_items : [];
  if (items.length) {
    for (const it of items) {
      const name = it.services?.name ?? it.service_name ?? "Serviço";
      const qty = Number(it.qty ?? 1);
      const unit = Number(it.unit_price ?? 0);
      draw(`• ${name}  x${qty}  —  ${money(unit * qty)}`, 11, false);
    }
  } else {
    const svc = appointment?.services ?? null;
    draw(`• ${svc?.name ?? "-"}`, 11, false);
  }

  draw(`TOTAL: ${money(appointment?.total_value ?? 0)}`, 12, true);
  hr();

  // Pagamento
  const payStatus = payment?.status ?? "Pendente";
  const payMethod = payment?.method ?? "-";
  const payAmount = money(payment?.amount ?? appointment?.total_value ?? 0);

  draw("PAGAMENTO", 11, true);
  draw(`Status: ${payStatus}`);
  draw(`Forma: ${payMethod}`);
  if (payment?.bank_account) draw(`Conta: ${payment.bank_account}`);
  draw(`Valor: ${payAmount}`);
  if (payment?.paid_at) draw(`Pago em: ${fmtDateTime(payment.paid_at)}`, 10, false);
  hr();

  // Observações
  if (appointment?.notes) {
    draw("OBSERVAÇÕES", 11, true);
    const lines = String(appointment.notes).split("\n").slice(0, 12);
    for (const ln of lines) draw(ln, 10, false);
    hr();
  }

  // Rodapé
  draw(COMPANY.footer ?? "NC Estética Automotiva", 9, false);

  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `OS_${shortId(appointment?.id)}.pdf`;
  a.click();

  URL.revokeObjectURL(url);
}
