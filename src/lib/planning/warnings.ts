type WarningInput = {
  inboxCount: number;
  hadYesterdayCheckin: boolean;
  recoveryMinutesThisWeek: number;
  recoveryTargetMinutes: number;
};

export function buildWarnings(input: WarningInput) {
  const warnings: Array<{ code: string; message: string }> = [];

  if (input.inboxCount > 10) {
    warnings.push({ code: "inbox_pileup", message: `Inbox 堆了 ${input.inboxCount} 条，先清一下。` });
  }

  if (!input.hadYesterdayCheckin) {
    warnings.push({ code: "missing_checkin", message: "昨天没复盘，今天先看 must-win 优先级。" });
  }

  if (input.recoveryMinutesThisWeek < input.recoveryTargetMinutes) {
    warnings.push({ code: "low_recovery", message: "本周 recovery 不足，不能继续挤掉恢复时间。" });
  }

  return warnings;
}
