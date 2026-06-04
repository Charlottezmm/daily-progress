import { DailyCheckin } from "./daily-checkin";

export function TodayView() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section>
        <h1 className="text-xl font-semibold">Today</h1>
        <p className="text-sm text-zinc-500">Tasks, warnings, routines, recovery, and check-in live here.</p>
      </section>
      <section className="rounded border border-zinc-200 bg-white p-4">
        <h2 className="font-medium">Tasks</h2>
      </section>
      <section className="rounded border border-zinc-200 bg-white p-4">
        <h2 className="font-medium">Routines</h2>
      </section>
      <DailyCheckin />
    </div>
  );
}
