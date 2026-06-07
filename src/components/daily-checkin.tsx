"use client";

import { useState } from "react";

type SaveResponse = {
  streakDays?: number;
  error?: string;
};

type DailyCheckinProps = {
  initialCompletedText?: string;
  initialBlockerText?: string;
  initialNextText?: string;
  initialStreakDays?: number;
  dataUnavailable?: boolean;
};

export function DailyCheckin({
  initialCompletedText = "",
  initialBlockerText = "",
  initialNextText = "",
  initialStreakDays = 0,
  dataUnavailable = false,
}: DailyCheckinProps) {
  const [completedText, setCompletedText] = useState(initialCompletedText);
  const [blockerText, setBlockerText] = useState(initialBlockerText);
  const [nextText, setNextText] = useState(initialNextText);
  const [message, setMessage] = useState<string | null>(initialStreakDays ? `已 ${initialStreakDays} 天连续打卡` : null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (dataUnavailable) {
      setMessage("本地数据源未配置，暂时无法保存。");
      return;
    }
    setPending(true);
    const response = await fetch("/api/checkins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completedText, blockerText, nextText }),
    });
    const data = (await response.json()) as SaveResponse;
    setPending(false);
    if (!response.ok) {
      setMessage(data.error ?? "保存失败");
      return;
    }
    setMessage(`记下了。已 ${data.streakDays ?? 0} 天连续打卡`);
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded border border-zinc-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="font-medium">Daily Check-in</h2>
        <p className="text-xs text-zinc-500">5 秒记录：完成 / 卡点 / 明日接。</p>
        {dataUnavailable ? <p className="mt-1 text-xs text-amber-700">当前没有配置数据库，保存会在真实环境启用。</p> : null}
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <input
          value={completedText}
          onChange={(event) => setCompletedText(event.target.value)}
          placeholder="完成"
          className="rounded border border-zinc-300 px-3 py-2 text-sm"
        />
        <input
          value={blockerText}
          onChange={(event) => setBlockerText(event.target.value)}
          placeholder="卡点"
          className="rounded border border-zinc-300 px-3 py-2 text-sm"
        />
        <input
          value={nextText}
          onChange={(event) => setNextText(event.target.value)}
          placeholder="明日接"
          className="rounded border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex items-center gap-3">
        <button disabled={pending || dataUnavailable} className="rounded bg-zinc-950 px-3 py-2 text-sm text-white disabled:opacity-50">
          Save
        </button>
        {message ? <p className="text-sm text-zinc-600">{message}</p> : null}
      </div>
    </form>
  );
}
