"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    async function check() {
      const { data } = await supabase.auth.getSession();

      if (data.session) {
        router.push("/dashboard");
      } else {
        router.push("/login");
      }
    }

    check();
  }, [router]);

  return <p>Redirecionando...</p>;
}
