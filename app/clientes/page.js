"use client";

import { useEffect, useState } from "react";
import RequireAuth from "../../components/RequireAuth";
import { supabase } from "../../lib/supabaseClient";
import Modal from "../../components/Modal";

export default function ClientesPage() {
  const [customers, setCustomers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", car_plate: "", notes: "" });
  const [q, setQ] = useState("");

  async function load() {
    let query = supabase.from("customers").select("*").order("created_at", { ascending: false });
    if (q.trim()) query = query.ilike("name", `%${q.trim()}%`);
    const { data } = await query;
    setCustomers(data ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!form.name.trim()) return alert("Informe o nome do cliente.");
    const { error } = await supabase.from("customers").insert([form]);
    if (error) return alert(error.message);
    setOpen(false);
    setForm({ name: "", phone: "", car_plate: "", notes: "" });
    load();
  }

  async function remove(id) {
    if (!confirm("Excluir cliente?")) return;
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) return alert(error.message);
    load();
  }

  return (
    <RequireAuth>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <div className="h1">Clientes</div>
          <div className="small">Cadastre e encontre rápido pelo nome</div>
        </div>
        <button className="btn primary" onClick={() => setOpen(true)}>+ Novo cliente</button>
      </div>

      <div style={{ height: 12 }} />

      <div className="card">
        <div className="row two">
          <div>
            <label>Buscar cliente</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite o nome..." />
          </div>
          <div style={{ display: "flex", alignItems: "end", gap: 10 }}>
            <button className="btn" onClick={load}>Buscar</button>
            <button className="btn" onClick={() => { setQ(""); setTimeout(load, 50); }}>Limpar</button>
          </div>
        </div>

        <div style={{ height: 10 }} />

        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Placa</th>
              <th>Obs</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 800 }}>{c.name}</td>
                <td className="small">{c.phone ?? "-"}</td>
                <td className="small">{c.car_plate ?? "-"}</td>
                <td className="small">{c.notes ?? "-"}</td>
                <td style={{ width: 120 }}>
                  <button className="btn danger" onClick={() => remove(c.id)}>Excluir</button>
                </td>
              </tr>
            ))}
            {customers.length === 0 ? (
              <tr>
                <td colSpan={5} className="small">Nenhum cliente cadastrado.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal open={open} title="Novo cliente" onClose={() => setOpen(false)}>
        <div className="row two">
          <div>
            <label>Nome</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label>Telefone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
        </div>

        <div className="row two">
          <div>
            <label>Placa</label>
            <input value={form.car_plate} onChange={(e) => setForm({ ...form, car_plate: e.target.value })} />
          </div>
          <div>
            <label>Observações</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn" onClick={() => setOpen(false)}>Cancelar</button>
          <button className="btn primary" onClick={save}>Salvar</button>
        </div>
      </Modal>
    </RequireAuth>
  );
}
