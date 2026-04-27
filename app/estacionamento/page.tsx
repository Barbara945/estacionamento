"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [clientes, setClientes] = useState([]);
  const [pagamentos, setPagamentos] = useState([]);
  const [config, setConfig] = useState({});

  useEffect(() => {
    const c = localStorage.getItem("clientes");
    const p = localStorage.getItem("pagamentos");
    const conf = localStorage.getItem("config");

    if (c) setClientes(JSON.parse(c));
    if (p) setPagamentos(JSON.parse(p));
    if (conf) setConfig(JSON.parse(conf));
  }, []);

  // 🔴 INADIMPLENTES
  function isAtrasado(p) {
    const hoje = new Date();
    return !p.pago && new Date(p.vencimento) < hoje;
  }

  const inadimplentes = pagamentos.filter(isAtrasado);

  // 🚗 VAGAS
  const totalCobertas = Number(config.vagasCobertas || 0);
  const totalDescobertas = Number(config.vagasDescobertas || 0);

  const usadasCobertas = clientes.filter(c => c.vagaTipo === "coberta").length;
  const usadasDescobertas = clientes.filter(c => c.vagaTipo === "descoberta").length;

  // 📲 WHATS
  function formatarNumero(numero) {
    let n = numero.replace(/\D/g, "");
    if (!n.startsWith("55")) n = "55" + n;
    return n;
  }

  function cobrar(p) {
    const numero = formatarNumero(p.telefone);

    const msg = `⚠️ PAGAMENTO EM ATRASO

Olá ${p.nome},

💰 R$ ${p.valor}
📅 ${new Date(p.vencimento).toLocaleDateString()}

💳 PIX fixado no grupo do estacionamento.

Regularize o quanto antes.

ANC Estacionamento`;

    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(msg)}`);
  }

  return (
    <div>
      <h1>Dashboard</h1>

      {/* RESUMO */}
      <div style={grid}>
        <div style={card}>
          <h3>🚗 Cobertas</h3>
          <p>Usadas: {usadasCobertas}</p>
          <p>Livres: {totalCobertas - usadasCobertas}</p>
        </div>

        <div style={card}>
          <h3>🚙 Descobertas</h3>
          <p>Usadas: {usadasDescobertas}</p>
          <p>Livres: {totalDescobertas - usadasDescobertas}</p>
        </div>

        <div style={{ ...card, background: "#7f1d1d" }}>
          <h3>🔴 Inadimplentes</h3>
          <p>{inadimplentes.length} clientes</p>
        </div>
      </div>

      {/* LISTA DE INADIMPLENTES */}
      <h2 style={{ color: "#ef4444" }}>Clientes em atraso</h2>

      {inadimplentes.length === 0 && (
        <p>✅ Nenhum cliente em atraso</p>
      )}

      {inadimplentes.map((p, i) => (
        <div key={i} style={cardAtraso}>
          <strong>{p.nome}</strong><br />
          📞 {p.telefone}<br />
          💰 R$ {p.valor}<br />
          📅 {new Date(p.vencimento).toLocaleDateString()}<br />

          <button
            onClick={() => cobrar(p)}
            style={btnCobrar}
          >
            Cobrar Whats
          </button>
        </div>
      ))}
    </div>
  );
}

/* ESTILO */

const grid = {
  display: "flex",
  gap: 20,
  marginBottom: 30,
};

const card = {
  background: "#1f2937",
  padding: 20,
  borderRadius: 10,
};

const cardAtraso = {
  background: "#7f1d1d",
  padding: 15,
  borderRadius: 10,
  marginBottom: 10,
  color: "#fff",
};

const btnCobrar = {
  marginTop: 10,
  background: "#ef4444",
  color: "#fff",
  padding: "6px 12px",
  borderRadius: 6,
};