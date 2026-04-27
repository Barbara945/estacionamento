"use client";

import { useState, useEffect } from "react";

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [editIndex, setEditIndex] = useState(null);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cpf, setCpf] = useState("");
  const [placa, setPlaca] = useState("");
  const [modelo, setModelo] = useState("");
  const [cor, setCor] = useState("");
  const [tipo, setTipo] = useState("mensalista");
  const [vagaTipo, setVagaTipo] = useState("coberta");

  useEffect(() => {
    const dados = localStorage.getItem("clientes");
    if (dados) setClientes(JSON.parse(dados));
  }, []);

  function salvar(lista) {
    localStorage.setItem("clientes", JSON.stringify(lista));
    setClientes(lista);
  }

  function gerarId() {
    return Date.now() + Math.random();
  }

  function limpar() {
    setNome("");
    setTelefone("");
    setCpf("");
    setPlaca("");
    setModelo("");
    setCor("");
    setTipo("mensalista");
    setVagaTipo("coberta");
    setEditIndex(null);
  }

  function salvarCliente() {
    if (!nome || !placa) return alert("Preencha nome e placa");

    let lista = [...clientes];

    if (editIndex !== null) {
      lista[editIndex] = {
        ...lista[editIndex],
        nome, telefone, cpf, placa, modelo, cor, tipo, vagaTipo
      };
    } else {
      lista.push({
        id: gerarId(),
        nome, telefone, cpf, placa, modelo, cor, tipo, vagaTipo
      });
    }

    salvar(lista);
    limpar();
  }

  function editar(index) {
    const c = clientes[index];

    setNome(c.nome);
    setTelefone(c.telefone);
    setCpf(c.cpf);
    setPlaca(c.placa);
    setModelo(c.modelo);
    setCor(c.cor);
    setTipo(c.tipo);
    setVagaTipo(c.vagaTipo);

    setEditIndex(index);
  }

  function remover(index) {
    const cliente = clientes[index];

    if (!confirm("Excluir cliente e pagamentos?")) return;

    const novaLista = clientes.filter((_, i) => i !== index);
    salvar(novaLista);

    const pagamentos = JSON.parse(localStorage.getItem("pagamentos") || "[]");

    const novosPagamentos = pagamentos.filter(
      (p) => p.clienteId !== cliente.id
    );

    localStorage.setItem("pagamentos", JSON.stringify(novosPagamentos));
  }

  return (
    <div>
      <h1>Clientes</h1>

      <div style={form}>
        <input placeholder="Nome" value={nome} onChange={e => setNome(e.target.value)} />
        <input placeholder="Telefone" value={telefone} onChange={e => setTelefone(e.target.value)} />
        <input placeholder="CPF" value={cpf} onChange={e => setCpf(e.target.value)} />
        <input placeholder="Placa" value={placa} onChange={e => setPlaca(e.target.value)} />
        <input placeholder="Modelo" value={modelo} onChange={e => setModelo(e.target.value)} />
        <input placeholder="Cor" value={cor} onChange={e => setCor(e.target.value)} />

        <select value={tipo} onChange={e => setTipo(e.target.value)}>
          <option value="mensalista">Mensalista</option>
          <option value="diarista">Diarista</option>
        </select>

        <select value={vagaTipo} onChange={e => setVagaTipo(e.target.value)}>
          <option value="coberta">Coberta</option>
          <option value="descoberta">Descoberta</option>
        </select>

        <button onClick={salvarCliente}>
          {editIndex !== null ? "Atualizar" : "Cadastrar"}
        </button>
      </div>

      {clientes.map((c, i) => (
        <div key={c.id} style={card}>
          {c.nome} - {c.tipo} ({c.vagaTipo})
          <br />
          <button onClick={() => editar(i)}>Editar</button>
          <button onClick={() => remover(i)}>Excluir</button>
        </div>
      ))}
    </div>
  );
}

const form = { display: "flex", flexDirection: "column", gap: 10 };
const card = { background: "#1f2937", padding: 10, marginTop: 10 };