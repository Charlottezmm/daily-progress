// 把「重复规则」字符串解析成 recurrenceWeekdayMask（星期位掩码）。
// 位约定与 expandRecurringBlocks / constraints-view 一致：周日=0, 周一=1, ..., 周六=6。
// 展开逻辑只认掩码，所以这里负责把人类可读的规则（每天 / 工作日 / 周一到周六 / weekly /
// "mon,wed,fri" 等）落成掩码；无法识别的非空规则按「每周（落在起始日那一天）」处理。

const WEEKDAY_INDEX: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
  // 中文（周一 / 星期一 / 礼拜一 …的「一」等）
  日: 0, 天: 0,
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6,
};

const ALL_DAYS_MASK = 0b1111111; // 127：七天
const WEEKDAYS_MASK = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5); // 62：周一到周五
const WEEKENDS_MASK = (1 << 0) | (1 << 6); // 65：周日 + 周六
const MON_TO_SAT_MASK = WEEKDAYS_MASK | (1 << 6); // 126：周一到周六

function maskFromIndexes(indexes: number[]): number {
  return indexes.reduce((mask, index) => mask | (1 << index), 0);
}

function shanghaiWeekday(date: Date): number {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
  })
    .format(date)
    .toLowerCase();
  return WEEKDAY_INDEX[short] ?? date.getUTCDay();
}

/**
 * @param rule     重复规则字符串（如 "每天" / "工作日" / "周一到周六" / "weekly" / "mon,wed,fri"）
 * @param startsAt 起始时刻（用于 "weekly" 推断落在哪个星期几）
 * @returns 星期位掩码；规则为空时返回 null（= 单次，不重复）
 */
export function weekdayMaskFromRecurrence(
  rule: string | null | undefined,
  startsAt: Date,
): number | null {
  const raw = (rule ?? "").trim();
  if (!raw) return null;

  const normalized = raw.toLowerCase().replace(/\s+/g, " ");

  // 每天 / daily
  if (["daily", "every day", "everyday", "each day", "每天", "每日"].includes(normalized)) {
    return ALL_DAYS_MASK;
  }
  // 工作日 / weekdays
  if (["weekdays", "weekday", "workdays", "工作日", "周一到周五", "周一至周五"].includes(normalized)) {
    return WEEKDAYS_MASK;
  }
  // 周末 / weekends
  if (["weekends", "weekend", "周末"].includes(normalized)) {
    return WEEKENDS_MASK;
  }
  // 周一到周六
  if (["mon-sat", "monday-saturday", "周一到周六", "周一至周六"].includes(normalized)) {
    return MON_TO_SAT_MASK;
  }
  // weekly / 每周 —— 落在起始日那个星期几
  if (["weekly", "每周", "每星期", "每个星期"].includes(normalized)) {
    return 1 << shanghaiWeekday(startsAt);
  }

  // 显式星期列表，如 "mon,wed,fri" / "mon tue" / "周一 周三 周五"
  const tokens = normalized.split(/[\s,、，/]+/).filter(Boolean);
  const indexes: number[] = [];
  for (const token of tokens) {
    // 去掉中文前缀（周 / 星期 / 礼拜），只留末位的 一二三…日天 或英文缩写
    const cleaned = token.replace(/^(周|星期|礼拜)/, "");
    const index = WEEKDAY_INDEX[cleaned] ?? WEEKDAY_INDEX[cleaned.slice(0, 3)];
    if (index !== undefined) indexes.push(index);
  }
  if (indexes.length > 0) return maskFromIndexes([...new Set(indexes)]);

  // 非空但无法识别 → 退化为「每周（起始日那天）」，至少能重复，不会变成单次
  return 1 << shanghaiWeekday(startsAt);
}
