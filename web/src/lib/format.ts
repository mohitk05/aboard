const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

export const formatKm = (km: number) => `${nf.format(km)} km`;

/** "in 3 h 20 min", "in 4 min", "now" */
export function formatIn(ms: number): string {
  if (ms <= 60_000) return "now";
  const totalMin = Math.round(ms / 60_000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `in ${d} d ${h} h`;
  if (h > 0) return `in ${h} h ${m} min`;
  return `in ${m} min`;
}

/** Clock time, with the weekday if it isn't today: "14:05" or "Tue 14:05". */
export function formatClock(at: number, now = Date.now()): string {
  const d = new Date(at);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return sameDay ? time : `${d.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
}

export const formatPrice = (p: number) => `${p.toFixed(2)} credits`;

/** Day (if not today) and time as separate parts, for stacked display on boards. */
export function clockParts(at: number, now = Date.now()): { day: string | null; time: string } {
  const d = new Date(at);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  return {
    day: sameDay ? null : d.toLocaleDateString(undefined, { weekday: "short" }),
    time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
  };
}

/** "about 9 hours", "about 2 days": for rough end-to-end journey times. */
export function formatDuration(hours: number): string {
  if (hours < 36) return `about ${Math.max(1, Math.round(hours))} hours`;
  return `about ${Math.round(hours / 24)} days`;
}

/** How long ago: "just now", "12 min ago", "3 h ago", "2 d ago". */
export function formatAgo(at: number, now = Date.now()): string {
  const min = Math.floor((now - at) / 60_000);
  if (min < 2) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}
