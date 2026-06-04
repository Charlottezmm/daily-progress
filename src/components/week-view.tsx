export function WeekView() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section>
        <h1 className="text-xl font-semibold">Week</h1>
        <p className="text-sm text-zinc-500">Week timeline, capacity, recovery target, and track balance.</p>
      </section>
      <section className="rounded border border-zinc-200 bg-white p-4">
        <h2 className="font-medium">Track Balance</h2>
      </section>
      <section className="rounded border border-zinc-200 bg-white p-4">
        <h2 className="font-medium">Recovery</h2>
      </section>
    </div>
  );
}
