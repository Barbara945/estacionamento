"use client";

import RequireAuth from "@/components/RequireAuth";

export default function Clientes() {
  return (
    <RequireAuth>
      <h1>Clientes</h1>
    </RequireAuth>
  );
}