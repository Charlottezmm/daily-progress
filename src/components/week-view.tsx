import { ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";
import type { WeekViewData } from "@/lib/planning/view-data";

function loadColor(state: string) {
  if (state === "over") return "bg-rose-500";
  if (state === "room") return "bg-emerald-500";
  if (state === "today") return "bg-zinc-950";
  return "bg-amber-500";
}

export function WeekView({ data }: { data: WeekViewData }) {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">本周</p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-950">周计划概览</h1>
        <p className="mt-1 text-sm text-zinc-500">看容量、战线比例和恢复红线；这里不是完整 calendar，也不支持拖拽。</p>
      </section>

      {data.dataUnavailable ? (
        <section className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          当前没有 DATABASE_URL，周视图显示为空态；配置数据库后会读取真实任务、容量和 check-in。
        </section>
      ) : null}

      <section className="rounded border border-zinc-200 bg-white p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-medium text-zinc-950">每日容量</h2>
            <p className="text-sm text-zinc-500">先判断哪天过载、哪天可接，任务只做摘要。</p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />有余量</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" />过载</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-zinc-950" />今天</span>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-7">
          {data.days.map((day) => (
            <div key={day.date} className={`rounded border p-3 ${day.state === "today" ? "border-zinc-950 bg-zinc-50" : "border-zinc-200 bg-white"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-zinc-500">周{day.day}</p>
                  <p className="text-sm font-semibold text-zinc-950">{day.date}</p>
                </div>
                <span className={`rounded px-2 py-1 text-xs ${day.state === "over" ? "bg-rose-50 text-rose-700" : "bg-zinc-100 text-zinc-600"}`}>{day.capacity}</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-zinc-100">
                <div className={`h-2 rounded-full ${loadColor(day.state)}`} style={{ width: `${Math.min(day.load, 100)}%` }} />
              </div>
              <div className="mt-3 space-y-1">
                {day.items.length === 0 ? <p className="rounded bg-zinc-50 px-2 py-1 text-xs text-zinc-400">无安排</p> : null}
                {day.items.map((item) => (
                  <p key={item} className="truncate rounded bg-zinc-50 px-2 py-1 text-xs text-zinc-600">{item}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="rounded border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-zinc-950">战线平衡</h2>
            <span className="text-xs text-zinc-500">按本周已排时间</span>
          </div>
          <div className="mt-4 space-y-3">
            {data.tracks.length === 0 ? <p className="text-sm text-zinc-500">本周还没有可统计的任务或恢复块。</p> : null}
            {data.tracks.map((track) => (
              <div key={track.name} className="grid grid-cols-[72px_1fr_56px] items-center gap-3 text-sm">
                <div className="font-medium text-zinc-800">{track.name}</div>
                <div>
                  <div className="h-2 rounded-full bg-zinc-100">
                    <div className={`h-2 rounded-full ${track.color}`} style={{ width: `${track.share}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{track.note}</p>
                </div>
                <div className="text-right font-mono text-xs text-zinc-600">{track.hours}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded border border-emerald-200 bg-emerald-50/60 p-4">
          <div className="flex items-center gap-2">
            <ShieldAlert size={17} className="text-emerald-700" />
            <h2 className="font-medium text-zinc-950">恢复目标</h2>
          </div>
          <div className="mt-4 flex items-end gap-2">
            <span className="text-3xl font-semibold text-zinc-950">{data.recovery.scheduledHours}</span>
            <span className="pb-1 text-sm text-zinc-500">/ {data.recovery.targetHours} 目标</span>
          </div>
          <div className="mt-3 h-3 rounded-full bg-white">
            <div className="h-3 rounded-full bg-emerald-600" style={{ width: `${data.recovery.percent}%` }} />
          </div>
          <p className="mt-3 text-sm text-emerald-800">{data.recovery.note}</p>
          {data.recovery.blocks.map((block) => (
            <div key={block} className="mt-3 rounded border border-emerald-100 bg-white px-3 py-2 text-sm text-zinc-700">
              {block}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded border border-zinc-200 bg-white p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-medium text-zinc-950">最近打卡</h2>
            <p className="text-sm text-zinc-500">用于判断节奏，不替代 Today 的低摩擦打卡。</p>
          </div>
          <a href="/today" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-zinc-900">
            去今日打卡 <ArrowRight size={14} />
          </a>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {data.checkins.length === 0 ? <p className="text-sm text-zinc-500">本周还没有 check-in。</p> : null}
          {data.checkins.map((checkin) => (
            <div key={checkin.day} className="rounded border border-zinc-100 p-3">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span className="text-sm font-medium text-zinc-950">{checkin.day}</span>
              </div>
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-xs text-zinc-500">完成</dt>
                  <dd className="text-zinc-800">{checkin.done}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">卡点</dt>
                  <dd className="text-zinc-800">{checkin.block}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">明日接</dt>
                  <dd className="text-zinc-800">{checkin.next}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
