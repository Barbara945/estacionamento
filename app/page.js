"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    async function go() {
      const { data } = await supabase.auth.getSession();
      if (data.session) router.push("/dashboard");
      else router.push("/login");
    }
    go();
  }, [router]);

  return (
    <div className="container">
      <div className="card">
        <div className="h1">Abrindo sistema…</div>
        <div className="small">Aguarde</div>
      </div>
    </div>
  );
}
