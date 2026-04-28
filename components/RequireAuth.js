"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Nav from "@/components/Nav";

export default function RequireAuth({ children }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        router.push("/login");
      } else {
        setLoading(false);
      }
    }

    check();
  }, [router]);

  if (loading) return <p>Carregando...</p>;

  return (
    <>
      <Nav />
      {children}
    </>
  );
}
