export function InboxView() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section>
        <h1 className="text-xl font-semibold">Inbox</h1>
        <p className="text-sm text-zinc-500">Capture buffer for items that are not yet tasks.</p>
      </section>
      <section className="rounded border border-zinc-200 bg-white p-4">
        <h2 className="font-medium">Unprocessed Items</h2>
      </section>
    </div>
  );
}
