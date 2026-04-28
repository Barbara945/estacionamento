"use client";

import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function Nav() {
  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <nav>
      <Link href="/dashboard">Dashboard</Link>
      <Link href="/clientes">Clientes</Link>
      <button onClick={logout}>Sair</button>
    </nav>
  );
}
