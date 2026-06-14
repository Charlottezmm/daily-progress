export type RecurringTimeBlockInput = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  recurrenceWeekdayMask?: number | null;
};

export type ExpandedRecurringTimeBlock<T extends RecurringTimeBlockInput> = T & {
  recurrenceSourceId?: string;
};

const shanghaiTimeZone = "Asia/Shanghai";
const dayMs = 24 * 60 * 60 * 1000;

function shanghaiParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: shanghaiTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "00";
  return {
    dateKey: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

function shanghaiDayStart(date: Date) {
  const { dateKey } = shanghaiParts(date);
  return new Date(`${dateKey}T00:00:00.000+08:00`);
}

function dateKey(date: Date) {
  return shanghaiParts(date).dateKey;
}

function timeOnShanghaiDay(day: Date, time: string) {
  return new Date(`${dateKey(day)}T${time}:00.000+08:00`);
}

function weekdayOnShanghaiDay(day: Date) {
  return new Date(shanghaiDayStart(day).getTime() + 20 * 60 * 60 * 1000).getUTCDay();
}

function overlaps(start: Date, end: Date, rangeStart: Date, rangeEnd: Date) {
  return start < rangeEnd && end > rangeStart;
}

export function expandRecurringBlocks<T extends RecurringTimeBlockInput>(
  blocks: T[],
  rangeStart: Date,
  rangeEnd: Date,
): Array<ExpandedRecurringTimeBlock<T>> {
  const expanded: Array<ExpandedRecurringTimeBlock<T>> = [];

  for (const block of blocks) {
    const mask = block.recurrenceWeekdayMask ?? 0;
    if (mask <= 0) {
      if (overlaps(block.startsAt, block.endsAt, rangeStart, rangeEnd)) expanded.push(block);
      continue;
    }

    const { time: startTime } = shanghaiParts(block.startsAt);
    const { time: endTime } = shanghaiParts(block.endsAt);
    const effectiveStart = new Date(Math.max(shanghaiDayStart(block.startsAt).getTime(), shanghaiDayStart(rangeStart).getTime()));
    const effectiveEnd = new Date(Math.min(block.endsAt.getTime(), rangeEnd.getTime()));

    for (let cursor = effectiveStart; cursor < effectiveEnd; cursor = new Date(cursor.getTime() + dayMs)) {
      const weekday = weekdayOnShanghaiDay(cursor);
      if ((mask & (1 << weekday)) === 0) continue;

      const startsAt = timeOnShanghaiDay(cursor, startTime);
      const endsAt = timeOnShanghaiDay(cursor, endTime);
      if (!overlaps(startsAt, endsAt, rangeStart, rangeEnd)) continue;
      if (!overlaps(startsAt, endsAt, block.startsAt, block.endsAt)) continue;

      expanded.push({
        ...block,
        id: `${block.id}__${dateKey(cursor)}`,
        startsAt,
        endsAt,
        recurrenceSourceId: block.id,
      });
    }
  }

  return expanded.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.endsAt.getTime() - b.endsAt.getTime());
}
