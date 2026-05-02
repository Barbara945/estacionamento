"use client";

import { useEffect, useState } from "react";
import RequireAuth from "../../components/RequireAuth";
import { supabase } from "../lib/supabaseClient";
import Modal from "../../components/Modal";

function money(n) {
  const v = Number(n ?? 0);
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ServicosPage() {
  const [services, setServices] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", price: 0, duration_minutes: 60 });

  async function load() {
    const { data } = await supabase.from("services").select("*").order("created_at", { ascending: false });
    setServices(data ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!form.name.trim()) return alert("Informe o nome do serviço.");
    const payload = {
      ...form,
      price: Number(form.price ?? 0),
      duration_minutes: Number(form.duration_minutes ?? 60),
    };
    const { error } = await supabase.from("services").insert([payload]);
    if (error) return alert(error.message);
    setOpen(false);
    setForm({ name: "", price: 0, duration_minutes: 60 });
    load();
  }

  async function remove(id) {
    if (!confirm("Excluir serviço?")) return;
    const { error } = await supabase.from("services").delete().eq("id", id);
    if (error) return alert(error.message);
    load();
  }

  return (
    <RequireAuth>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <div className="h1">Serviços</div>
          <div className="small">Defina preço e duração para agilizar agendamentos</div>
        </div>
        <button className="btn primary" onClick={() => setOpen(true)}>+ Novo serviço</button>
      </div>

      <div style={{ height: 12 }} />

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Serviço</th>
              <th>Preço</th>
              <th>Duração</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id}>
                <td style={{ fontWeight: 800 }}>{s.name}</td>
                <td>{money(s.price)}</td>
                <td className="small">{s.duration_minutes} min</td>
                <td style={{ width: 120 }}>
                  <button className="btn danger" onClick={() => remove(s.id)}>Excluir</button>
                </td>
              </tr>
            ))}
            {services.length === 0 ? (
              <tr>
                <td colSpan={4} className="small">Nenhum serviço cadastrado.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal open={open} title="Novo serviço" onClose={() => setOpen(false)}>
        <div className="row two">
          <div>
            <label>Nome</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Higienização completa" />
          </div>
          <div>
            <label>Preço (R$)</label>
            <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
        </div>

        <div className="row two">
          <div>
            <label>Duração (min)</label>
            <input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} />
          </div>
          <div />
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn" onClick={() => setOpen(false)}>Cancelar</button>
          <button className="btn primary" onClick={save}>Salvar</button>
        </div>
      </Modal>
    </RequireAuth>
  );
}
