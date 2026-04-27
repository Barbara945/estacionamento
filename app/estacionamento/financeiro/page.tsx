"use client";

import { useEffect, useState } from "react";

export default function Financeiro() {
  const [clientes, setClientes] = useState([]);
  const [pagamentos, setPagamentos] = useState([]);

  const [clienteSelecionado, setClienteSelecionado] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState("");

  const [editIndex, setEditIndex] = useState(null);

  useEffect(() => {
    const c = localStorage.getItem("clientes");
    const p = localStorage.getItem("pagamentos");

    if (c) setClientes(JSON.parse(c));
    if (p) setPagamentos(JSON.parse(p));
  }, []);

  function salvar(lista) {
    localStorage.setItem("pagamentos", JSON.stringify(lista));
    setPagamentos(lista);
  }

  function salvarPagamento() {
    if (!clienteSelecionado || !valor || !vencimento)
      return alert("Preencha tudo");

    const cliente = clientes.find(c => c.id == clienteSelecionado);

    const novo = {
      clienteId: cliente.id,
      nome: cliente.nome,
      telefone: cliente.telefone,
      valor: Number(valor),
      vencimento,
      pago: false,
      cobrado: false,
      dataPagamento: null,
    };

    let lista = [...pagamentos];

    if (editIndex !== null) lista[editIndex] = novo;
    else lista.push(novo);

    salvar(lista);

    setClienteSelecionado("");
    setValor("");
    setVencimento("");
    setEditIndex(null);
  }

  function editar(i) {
    const p = pagamentos[i];

    setClienteSelecionado(p.clienteId);
    setValor(p.valor);
    setVencimento(p.vencimento);

    setEditIndex(i);
  }

  function excluir(i) {
    if (!confirm("Excluir pagamento?")) return;
    salvar(pagamentos.filter((_, index) => index !== i));
  }

  function desconto(i) {
    const v = prompt("Desconto:");
    if (!v) return;

    const lista = [...pagamentos];
    lista[i].valor -= Number(v);
    salvar(lista);
  }

  function multa(i) {
    const v = prompt("Multa:");
    if (!v) return;

    const lista = [...pagamentos];
    lista[i].valor += Number(v);
    salvar(lista);
  }

  function jaPagou(i) {
    const lista = [...pagamentos];
    lista[i].pago = true;
    lista[i].dataPagamento = new Date().toLocaleDateString();
    salvar(lista);
  }

  function isAtrasado(p) {
    const hoje = new Date();
    return !p.pago && new Date(p.vencimento) < hoje;
  }

  function formatarNumero(numero) {
    let n = numero.replace(/\D/g, "");
    if (!n.startsWith("55")) n = "55" + n;
    return n;
  }

  // 🔴 COBRANÇA
  function cobrar(p, index) {
    const numero = formatarNumero(p.telefone);

    const msg = `⚠️ *PAGAMENTO EM ATRASO*

Olá ${p.nome},

💰 R$ ${p.valor}
📅 ${new Date(p.vencimento).toLocaleDateString()}

💳 PIX fixado no grupo do estacionamento.

Regularize o quanto antes.

ANC Estacionamento`;

    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(msg)}`);

    const lista = [...pagamentos];
    lista[index].cobrado = true;
    salvar(lista);
  }

  // 🟡 AVISO
  function avisar(p, index) {
    const numero = formatarNumero(p.telefone);

    const msg = `🔔 *LEMBRETE DE PAGAMENTO*

Olá ${p.nome},

💰 R$ ${p.valor}
📅 ${new Date(p.vencimento).toLocaleDateString()}

💳 PIX fixado no grupo do estacionamento.

Obrigado 😊`;

    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(msg)}`);

    const lista = [...pagamentos];
    lista[index].cobrado = true;
    salvar(lista);
  }

  // 🔔 VENCIMENTOS PRÓXIMOS
  function proximosVencimentos(dias = 2) {
    const hoje = new Date();

    return pagamentos.filter(p => {
      if (p.pago) return false;

      const venc = new Date(p.vencimento);
      const diff = (venc - hoje) / (1000 * 60 * 60 * 24);

      return diff >= 0 && diff <= dias;
    });
  }

  function avisarProximos() {
    const lista = proximosVencimentos(2);

    if (lista.length === 0) {
      alert("Nenhum vencimento próximo");
      return;
    }

    lista.forEach((p, i) => {
      setTimeout(() => avisar(p, i), i * 1500);
    });
  }

  // ALERTA AO ABRIR
  useEffect(() => {
    const lista = proximosVencimentos(2);

    if (lista.length > 0) {
      alert(`🔔 ${lista.length} pagamento(s) vencem em breve`);
    }
  }, [pagamentos]);

  return (
    <div>
      <h1>Financeiro</h1>

      <div style={form}>
        <select
          value={clienteSelecionado}
          onChange={e => setClienteSelecionado(e.target.value)}
        >
          <option value="">Selecione</option>
          {clientes.map(c => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>

        <input
          type="number"
          placeholder="Valor"
          value={valor}
          onChange={e => setValor(e.target.value)}
        />

        <input
          type="date"
          value={vencimento}
          onChange={e => setVencimento(e.target.value)}
        />

        <button onClick={salvarPagamento}>
          {editIndex !== null ? "Atualizar" : "Salvar"}
        </button>
      </div>

      <button onClick={avisarProximos} style={{ background: "#22c55e", color: "#fff", marginTop: 20 }}>
        🔔 Avisar vencimentos próximos
      </button>

      {pagamentos.map((p, i) => (
        <div key={i} style={card}>
          <strong>{p.nome}</strong><br />
          💰 R$ {p.valor}<br />
          📅 {new Date(p.vencimento).toLocaleDateString()}<br />

          <p>Status: {p.pago ? "✅ Pago" : "❌ Pendente"}</p>

          {p.dataPagamento && <p>📅 Pago em: {p.dataPagamento}</p>}
          {p.cobrado && <p>📲 Cobrança enviada</p>}

          <button onClick={() => editar(i)}>Editar</button>
          <button onClick={() => desconto(i)}>Desconto</button>
          <button onClick={() => multa(i)}>Multa</button>
          <button onClick={() => excluir(i)}>Excluir</button>

          {!p.pago && (
            <button onClick={() => jaPagou(i)} style={{ background: "#22c55e", color: "#fff" }}>
              Já pagou
            </button>
          )}

          {isAtrasado(p) && !p.pago && (
            <button onClick={() => cobrar(p, i)} style={{ background: "#ef4444", color: "#fff" }}>
              Cobrar
            </button>
          )}

          {!isAtrasado(p) && !p.pago && (
            <button onClick={() => avisar(p, i)} style={{ background: "#eab308" }}>
              Avisar
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

const form = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  maxWidth: 300,
};

const card = {
  background: "#1f2937",
  padding: 15,
  marginTop: 10,
};