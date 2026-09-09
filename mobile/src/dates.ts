import type { Occurrence, ParsedEvent, StoredEvent, Weekday } from "./types";

export const WEEKDAYS: Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
export const KO_DAYS = ["일", "월", "화", "수", "목", "금", "토"];

const pad = (n: number) => String(n).padStart(2, "0");

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "YYYY-MM-DDTHH:mm" in the device's local time.
export function toLocalString(d: Date): string {
  return `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function nowLocal(): string {
  return toLocalString(new Date());
}

// Parse "YYYY-MM-DDTHH:mm" or "YYYY-MM-DD" as a local Date (midnight for date-only).
export function toDate(local: string): Date {
  const [date, time] = local.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time ? time.split(":").map(Number) : [0, 0];
  return new Date(y, m - 1, d, h, min);
}

export function splitStart(start: string): { date: string; time: string | null } {
  const [date, time] = start.split("T");
  return { date, time: time ?? null };
}

export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return toDateKey(new Date(y, m - 1, d + days));
}

export function weekdayOf(dateKey: string): Weekday {
  return WEEKDAYS[toDate(dateKey).getDay()];
}

// Expand events into dated rows between from and to (inclusive), sorted.
export function expand<T extends ParsedEvent>(events: T[], from: string, to: string): Occurrence<T>[] {
  const rows: Occurrence<T>[] = [];
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

// Start and end Date of one occurrence. Untimed events get one hour; all-day events span the day.
export function occurrenceRange(o: Occurrence<ParsedEvent>): { start: Date; end: Date } {
  const start = toDate(o.time ? `${o.date}T${o.time}` : o.date);
  if (o.event.all_day || !o.time) return { start, end: toDate(addDays(o.date, 1)) };
  const endTime = o.event.end ? splitStart(o.event.end).time : null;
  const end = endTime ? toDate(`${o.date}T${endTime}`) : new Date(start.getTime() + 60 * 60 * 1000);
  return { start, end: end > start ? end : new Date(start.getTime() + 60 * 60 * 1000) };
}

export function formatDateHeader(dateKey: string, today: string): string {
  const dt = toDate(dateKey);
  const base = `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${KO_DAYS[dt.getDay()]})`;
  if (dateKey === today) return `오늘 · ${base}`;
  if (dateKey === addDays(today, 1)) return `내일 · ${base}`;
  return base;
}

export function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTimeRange(event: ParsedEvent): string {
  if (event.all_day) return "종일";
  const start = splitStart(event.start).time ?? "";
  const end = event.end ? splitStart(event.end).time : null;
  return end ? `${start} – ${end}` : start;
}

// "9/11 (목) 19:30" for slots and conflict messages.
export function formatShort(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()} (${KO_DAYS[d.getDay()]}) ${formatTime(d)}`;
}

export function describeRecurrence(event: ParsedEvent): string | null {
  if (!event.recurrence) return null;
  if (event.recurrence.freq === "daily") return "매일";
  const names = event.recurrence.by_day.map((d) => KO_DAYS[WEEKDAYS.indexOf(d)]).join("·");
  return `매주 ${names}`;
}

export function horizon(days: number): { from: string; to: string } {
  const today = toDateKey(new Date());
  return { from: today, to: addDays(today, days) };
}

// 6 rows x 7 columns of date keys covering the month, starting on Sunday. Cells outside the month are included.
export function monthGrid(year: number, month: number): string[][] {
  const first = new Date(year, month, 1);
  let cur = toDateKey(new Date(year, month, 1 - first.getDay()));
  const rows: string[][] = [];
  for (let r = 0; r < 6; r++) {
    const row: string[] = [];
    for (let c = 0; c < 7; c++) {
      row.push(cur);
      cur = addDays(cur, 1);
    }
    rows.push(row);
  }
  return rows;
}
