import type { Occurrence, StoredEvent, Weekday } from "./types";

const WEEKDAYS: Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const KO_DAYS = ["일", "월", "화", "수", "목", "금", "토"];

const pad = (n: number) => String(n).padStart(2, "0");

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function nowLocal(): string {
  const d = new Date();
  return `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function splitStart(start: string): { date: string; time: string | null } {
  const [date, time] = start.split("T");
  return { date, time: time ?? null };
}

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return toDateKey(dt);
}

function weekdayOf(dateKey: string): Weekday {
  const [y, m, d] = dateKey.split("-").map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

// Expand events into dated rows between from and to (inclusive), sorted.
export function expand(events: StoredEvent[], from: string, to: string): Occurrence[] {
  const rows: Occurrence[] = [];
  for (const event of events) {
    const { date, time } = splitStart(event.start);
    if (!event.recurrence) {
      if (date >= from && date <= to) rows.push({ event, date, time });
      continue;
    }
    const until = event.recurrence.until && event.recurrence.until < to ? event.recurrence.until : to;
    const days = event.recurrence.freq === "daily" ? WEEKDAYS : event.recurrence.by_day;
    for (let cur = date < from ? from : date; cur <= until; cur = addDays(cur, 1)) {
      if (days.includes(weekdayOf(cur))) rows.push({ event, date: cur, time });
    }
  }
  return rows.sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
}

export function formatDateHeader(dateKey: string, today: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const base = `${m}월 ${d}일 (${KO_DAYS[dt.getDay()]})`;
  if (dateKey === today) return `오늘 · ${base}`;
  if (dateKey === addDays(today, 1)) return `내일 · ${base}`;
  return base;
}

export function formatTimeRange(event: StoredEvent): string {
  if (event.all_day) return "종일";
  const start = splitStart(event.start).time ?? "";
  const end = event.end ? splitStart(event.end).time : null;
  return end ? `${start} – ${end}` : start;
}

export function describeRecurrence(event: StoredEvent): string | null {
  if (!event.recurrence) return null;
  if (event.recurrence.freq === "daily") return "매일";
  const names = event.recurrence.by_day.map((d) => KO_DAYS[WEEKDAYS.indexOf(d)]).join("·");
  return `매주 ${names}`;
}

export function horizon(days: number): { from: string; to: string } {
  const today = toDateKey(new Date());
  return { from: today, to: addDays(today, days) };
}
