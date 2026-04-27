"use client";

import { useEffect, useState } from "react";

export default function Configuracoes() {
  const [config, setConfig] = useState({
    mensalistaCoberta: "",
    mensalistaDescoberta: "",
    diariaCoberta: "",
    diariaDescoberta: "",
    vagasCobertas: "",
    vagasDescobertas: "",
  });

  useEffect(() => {
    const dados = localStorage.getItem("config");
    if (dados) setConfig(JSON.parse(dados));
  }, []);

  function atualizar(campo, valor) {
    setConfig({ ...config, [campo]: valor });
  }

  function salvar() {
    localStorage.setItem("config", JSON.stringify(config));
    alert("Configurações salvas!");
  }

  return (
    <div>
      <h1>Configurações</h1>

      <div style={form}>

        <h3>Mensalistas</h3>

        <input
          type="number"
          placeholder="Coberta (R$)"
          value={config.mensalistaCoberta}
          onChange={(e) => atualizar("mensalistaCoberta", e.target.value)}
        />

        <input
          type="number"
          placeholder="Descoberta (R$)"
          value={config.mensalistaDescoberta}
          onChange={(e) => atualizar("mensalistaDescoberta", e.target.value)}
        />

        <h3>Diárias</h3>

        <input
          type="number"
          placeholder="Coberta (R$)"
          value={config.diariaCoberta}
          onChange={(e) => atualizar("diariaCoberta", e.target.value)}
        />

        <input
          type="number"
          placeholder="Descoberta (R$)"
          value={config.diariaDescoberta}
          onChange={(e) => atualizar("diariaDescoberta", e.target.value)}
        />

        <h3>Vagas</h3>

        <input
          type="number"
          placeholder="Vagas Cobertas"
          value={config.vagasCobertas}
          onChange={(e) => atualizar("vagasCobertas", e.target.value)}
        />

        <input
          type="number"
          placeholder="Vagas Descobertas"
          value={config.vagasDescobertas}
          onChange={(e) => atualizar("vagasDescobertas", e.target.value)}
        />

        <button onClick={salvar}>Salvar</button>

      </div>
    </div>
  );
}

const form = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  maxWidth: 350,
};