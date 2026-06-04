export function calculateTrackBalance(items: Array<{ trackId: string; minutes: number }>) {
  const total = items.reduce((sum, item) => sum + item.minutes, 0);
  const byTrack = new Map<string, number>();

  for (const item of items) {
    byTrack.set(item.trackId, (byTrack.get(item.trackId) ?? 0) + item.minutes);
  }

  return Array.from(byTrack.entries()).map(([trackId, minutes]) => ({
    trackId,
    minutes,
    percent: total === 0 ? 0 : Math.round((minutes / total) * 100),
  }));
}
