"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { COMPANY } from "/config/company";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [msg, setMsg] = useState("");

  const title = useMemo(() => COMPANY.shortName || COMPANY.businessName || "Sistema", []);

  async function submit(e) {
    e.preventDefault();
    setMsg("");

    try {
      if (!email.trim()) return setMsg("❌ Informe seu e-mail.");
      if (!pass.trim()) return setMsg("❌ Informe sua senha.");

      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password: pass });
        if (error) throw error;
        setMsg("✅ Conta criada! Agora faça login.");
        setMode("login");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      router.push("/dashboard");
    } catch (err) {
      setMsg("❌ " + (err?.message ?? "Erro"));
    }
  }

  async function forgot() {
    setMsg("");
    try {
      if (!email.trim()) return setMsg("❌ Digite seu e-mail primeiro.");
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      setMsg("✅ Enviamos um e-mail de redefinição (verifique caixa de entrada e spam).");
    } catch (err) {
      setMsg("❌ " + (err?.message ?? "Erro"));
    }
  }

  return (
    <div className="container" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <div className="authGrid">
        {/* Painel de marca */}
        <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <img
                src={COMPANY.logoPath || "/logo.svg"}
                alt={COMPANY.businessName || "Logo"}
                style={{ width: 64, height: 64, borderRadius: 16, border: "1px solid var(--line)", background: "rgba(255,255,255,0.03)" }}
              />
              <div>
                <div className="h1" style={{ margin: 0 }}>{title}</div>
                <div className="small">{COMPANY.tagline || "Caixa • Pagamentos • Agenda"}</div>
              </div>
            </div>

            <div style={{ height: 14 }} />

            <div className="small" style={{ lineHeight: 1.6 }}>
              <div><b>Para entrar:</b> use seu e-mail e senha cadastrados.</div>
              <div style={{ marginTop: 6 }}>
                <b>Dica:</b> depois que estiver online (Vercel), você pode instalar como app no PC.
              </div>
            </div>
          </div>

          <div className="small" style={{ opacity: 0.8 }}>
            {COMPANY.note || "Prestação de serviço"} • {COMPANY.instagram || ""}
          </div>
        </div>

        {/* Cartão de login */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <div className="h1">{mode === "login" ? "Entrar" : "Criar conta"}</div>
              <div className="small">Acesse com segurança</div>
            </div>
            <span className="badge">Login</span>
          </div>

          <div className="divider" />

          <form onSubmit={submit} className="row">
            <div>
              <label>E-mail</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seuemail@gmail.com" />
            </div>

            <div>
              <label>Senha</label>
              <input
                type={showPass ? "text" : "password"}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="********"
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={showPass}
                    onChange={(e) => setShowPass(e.target.checked)}
                    style={{ width: 16, height: 16 }}
                  />
                  <span className="small">Mostrar senha</span>
                </label>

                <button type="button" className="btn" onClick={forgot}>Esqueci a senha</button>
              </div>
            </div>

            <button className="btn primary" type="submit">
              {mode === "login" ? "Entrar" : "Criar conta"}
            </button>

            <button
              type="button"
              className="btn"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
            >
              {mode === "login" ? "Criar conta" : "Já tenho conta"}
            </button>

            {msg ? <div className="small">{msg}</div> : null}
          </form>

          <div className="divider" />
          <div className="small">
            Se der erro, confira seu <b>.env.local</b> (URL e ANON KEY do Supabase).
          </div>
        </div>
      </div>
</div>
  );
}
