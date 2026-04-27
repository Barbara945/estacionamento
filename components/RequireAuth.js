"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import Nav from "../../components/Nav";

export default function RequireAuth({ children }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");

  useEffect(() => {    let mounted = true;

    async function init() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      const session = data.session;
      if (!session) {
        router.push("/login");
        return;
      }

      setEmail(session.user.email ?? "");
      setLoading(false);
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.push("/login");
      else setEmail(session.user.email ?? "");
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <div className="h1">Carregando…</div>
          <div className="small">Validando login</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Nav email={email} />
      <div className="container">{children}</div>
    </>
  );
}
