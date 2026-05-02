"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function MapaVagas() {
  const [vagas, setVagas] = useState([]);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {
      const { data: vagasData, error: erro1 } = await supabase
        .from("vagas")
        .select("*");

      if (erro1) {
        console.log("Erro vagas:", erro1);
        return;
      }

      const { data: ocupadas, error: erro2 } = await supabase
        .from("movimentacoes")
        .select("vaga_id, placa")
        .eq("status", "aberto");

      if (erro2) {
        console.log("Erro movimentações:", erro2);
        return;
      }

      const lista = vagasData.map((vaga) => {
        const ocupada = ocupadas.find((o) => o.vaga_id === vaga.id);

        return {
          ...vaga,
          ocupada,
        };
      });

      setVagas(lista);
    } catch (err) {
      console.log("Erro geral:", err);
    }
  }

  function clicar(vaga) {
    if (vaga.ocupada) {
      alert(`Vaga ${vaga.numero}\nPlaca: ${vaga.ocupada.placa}`);
    } else {
      alert(`Vaga ${vaga.numero} livre`);
    }
  }

  return (
    <div style={{ marginTop: 30 }}>
      <h2>Mapa de Vagas</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
        }}
      >
        {vagas.map((vaga) => (
          <div
            key={vaga.id}
            onClick={() => clicar(vaga)}
            style={{
              padding: 20,
              textAlign: "center",
              borderRadius: 8,
              cursor: "pointer",
              background: vaga.ocupada ? "red" : "green",
              color: "#fff",
              fontWeight: "bold",
            }}
          >
            Vaga {vaga.numero}
          </div>
        ))}
      </div>
    </div>
  );
}