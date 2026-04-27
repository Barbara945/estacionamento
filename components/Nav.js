"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { COMPANY } from "@/config/company";

function NavLink({ href, children }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link className={`navLink ${active ? "active" : ""}`} href={href}>
      {children}
    </Link>
  );
}

export default function Nav({ email }) {
  const router = useRouter();

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="nav">
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <img
          src={COMPANY.logoPath || "/logo.svg"}
          alt={COMPANY.businessName || "Logo"}
          style={{ width: 40, height: 40, borderRadius: 10, border: "1px solid var(--line)", background: "rgba(255,255,255,0.03)", objectFit: "cover" }}
        />
        <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>
          {(COMPANY.shortName || "Sistema").toUpperCase()}
        </div>
        <span className="badge">{COMPANY.note || "Prestação de serviço"}</span>
      </div>

      <div className="navLinks">
        <NavLink href="/dashboard">Dashboard</NavLink>
        <NavLink href="/agenda">Agenda</NavLink>
        <NavLink href="/caixa">Caixa</NavLink>
        <NavLink href="/extrato">Extrato</NavLink>
        <NavLink href="/bancos">Bancos</NavLink>
        <NavLink href="/contas-a-pagar">Contas a Pagar</NavLink>
        <NavLink href="/contas-particulares">Contas Particulares</NavLink>
        <NavLink href="/pagamentos">Pagamentos</NavLink>
        <NavLink href="/relatorios">Relatórios</NavLink>
        <NavLink href="/clientes">Clientes</NavLink>
        <NavLink href="/servicos">Serviços</NavLink>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span className="small">{email ?? ""}</span>
        <button className="btn danger" onClick={logout}>Sair</button>
      </div>
    </div>
  );
}
