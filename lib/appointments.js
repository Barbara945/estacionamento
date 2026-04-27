export function groupServiceSummary({ appointments, items, services }) {
  const byAppt = {};
  for (const it of items ?? []) {
    const arr = (byAppt[it.appointment_id] = byAppt[it.appointment_id] ?? []);
    arr.push(it);
  }

  return (appointments ?? []).map((a) => {
    const its = byAppt[a.id] ?? [];
    const names = its
      .map((x) => x.services?.name)
      .filter(Boolean);
    const summary = names.length ? names.join(" + ") : (a.services?.name ?? "-");
    return { ...a, service_items: its, service_summary: summary };
  });
}
