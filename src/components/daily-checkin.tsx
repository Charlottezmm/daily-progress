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
  const [message, setMessage] = useState<string | null>(initialStreakDays ? `已 ${initialStreakDays} 天连续记录` : null);
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
    setMessage(`已记录。Agent 下次审核会参考，已 ${data.streakDays ?? 0} 天连续记录`);
  }

  return (
    <form onSubmit={submit} className="paw-feedback-card">
      <div>
        <h2 className="paw-feedback-title">收工反馈</h2>
        <p className="paw-feedback-subtitle">5 秒记录事实：完成 / 卡点 / 明日接。Agent 下次重排会参考这里。</p>
        {dataUnavailable ? <p className="paw-feedback-subtitle text-amber-700">当前没有配置数据库，保存会在真实环境启用。</p> : null}
      </div>
      <div className="paw-feedback-fields">
        <label>
          <span className="paw-field-label">完成</span>
          <textarea
            value={completedText}
            onChange={(event) => setCompletedText(event.target.value)}
            placeholder="今天实际完成了什么"
            rows={2}
            className="paw-textarea"
          />
        </label>
        <label>
          <span className="paw-field-label">卡点</span>
          <textarea
            value={blockerText}
            onChange={(event) => setBlockerText(event.target.value)}
            placeholder="今天卡在哪里"
            rows={2}
            className="paw-textarea"
          />
        </label>
        <label>
          <span className="paw-field-label">明日接</span>
          <textarea
            value={nextText}
            onChange={(event) => setNextText(event.target.value)}
            placeholder="明天从哪里继续"
            rows={2}
            className="paw-textarea"
          />
        </label>
      </div>
      <div className="paw-save-row">
        <button disabled={pending || dataUnavailable} className="paw-save-btn">
          {pending ? "保存中" : "保存反馈"}
        </button>
        {message ? <p className="paw-toast">{message}</p> : null}
      </div>
    </form>
  );
}
