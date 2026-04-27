"use client";

import { useEffect, useState } from "react";

export default function Relatorios() {
  const [clientes, setClientes] = useState([]);
  const [pagamentos, setPagamentos] = useState([]);
  const [config, setConfig] = useState({});

  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");

  useEffect(() => {
    const c = localStorage.getItem("clientes");
    const p = localStorage.getItem("pagamentos");
    const conf = localStorage.getItem("config");

    if (c) setClientes(JSON.parse(c));
    if (p) setPagamentos(JSON.parse(p));
    if (conf) setConfig(JSON.parse(conf));
  }, []);

  function dentroPeriodo(data) {
    if (!inicio || !fim) return true;

    const d = new Date(data);
    return d >= new Date(inicio) && d <= new Date(fim);
  }

  // 💰 RECEBÍVEIS
  const recebiveis = pagamentos
    .filter(p => !p.pago && dentroPeriodo(p.vencimento))
    .reduce((total, p) => total + p.valor, 0);

  // 🔴 ATRASADOS
  const atrasados = pagamentos.filter(p => {
    const hoje = new Date();
    const venc = new Date(p.vencimento);

    return !p.pago && hoje > venc && dentroPeriodo(p.vencimento);
  });

  const totalAtrasado = atrasados.reduce((t, p) => t + p.valor, 0);

  // 👥 CLIENTES
  const listaClientes = clientes;

  // 🚗 VAGAS
  const vagasCobertasTotal = Number(config.vagasCobertas || 0);
  const vagasDescobertasTotal = Number(config.vagasDescobertas || 0);

  const usadasCobertas = clientes.filter(c => c.vagaTipo === "coberta").length;
  const usadasDescobertas = clientes.filter(c => c.vagaTipo === "descoberta").length;

  const livresCobertas = vagasCobertasTotal - usadasCobertas;
  const livresDescobertas = vagasDescobertasTotal - usadasDescobertas;

  return (
    <div>
      <h1>Relatórios</h1>

      {/* FILTRO */}
      <div style={form}>
        <input type="date" value={inicio} onChange={e => setInicio(e.target.value)} />
        <input type="date" value={fim} onChange={e => setFim(e.target.value)} />
      </div>

      {/* FINANCEIRO */}
      <h2>Financeiro</h2>

      <div style={card}>
        <p>💰 Recebíveis: R$ {recebiveis}</p>
        <p>🔴 Atrasados: R$ {totalAtrasado}</p>
      </div>

      {/* LISTA ATRASADOS */}
      <h3>Clientes em atraso</h3>

      {atrasados.map((p, i) => (
        <div key={i} style={card}>
          {p.nome} - 📞 {p.telefone} - R$ {p.valor}
        </div>
      ))}

      {/* CLIENTES */}
      <h2>Clientes</h2>

      {listaClientes.map((c, i) => (
        <div key={i} style={card}>
          {c.nome} - 📞 {c.telefone}
        </div>
      ))}

      {/* VAGAS */}
      <h2>Vagas</h2>

      <div style={card}>
        <p>🚗 Cobertas: {usadasCobertas} usadas / {livresCobertas} livres</p>
        <p>🚙 Descobertas: {usadasDescobertas} usadas / {livresDescobertas} livres</p>
      </div>
    </div>
  );
}

/* ESTILO */

const form = {
  display: "flex",
  gap: 10,
  marginBottom: 20,
};

const card = {
  background: "#1f2937",
  padding: 10,
  borderRadius: 8,
  marginBottom: 10,
};