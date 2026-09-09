// Merges app events, phone-calendar events and public holidays into one list of rows per day.
import { addDays, describeRecurrence, expand, formatTime, formatTimeRange, toDateKey } from "./dates";
import { HOLIDAYS } from "./holidays";
import type { BusyBlock, StoredEvent } from "./types";

export interface DayItem {
  key: string;
  date: string; // YYYY-MM-DD
  sortKey: string; // "" for all-day/holiday (sorts first), else HH:mm
  time: string; // what to show in the time column
  title: string;
  sub: string | null;
  source: "app" | "phone" | "holiday";
  event?: StoredEvent; // present for app rows so they can be edited/deleted
}

export function mergedItems(events: StoredEvent[], phone: BusyBlock[], from: string, to: string): DayItem[] {
  const items: DayItem[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const name = HOLIDAYS[d];
    if (name) items.push({ key: `holiday-${d}`, date: d, sortKey: "", time: "공휴일", title: name, sub: null, source: "holiday" });
  }
  for (const o of expand(events, from, to)) {
    items.push({
      key: `app-${o.event.id}-${o.date}`,
      date: o.date,
      sortKey: o.time ?? " ",
      time: formatTimeRange(o.event),
      title: o.event.title,
      sub: [o.event.location, describeRecurrence(o.event)].filter(Boolean).join(" · ") || null,
      source: "app",
      event: o.event,
    });
  }
  for (const b of phone) {
    const date = toDateKey(b.start);
    if (date < from || date > to) continue;
    items.push({
      key: `phone-${b.id}-${date}`,
      date,
      sortKey: b.allDay ? " " : formatTime(b.start),
      time: b.allDay ? "종일" : `${formatTime(b.start)} – ${formatTime(b.end)}`,
      title: b.title,
      sub: "폰 캘린더",
      source: "phone",
    });
  }
  return items.sort((a, b) => (a.date + a.sortKey).localeCompare(b.date + b.sortKey));
}

export function groupByDate(items: DayItem[]): Map<string, DayItem[]> {
  const map = new Map<string, DayItem[]>();
  for (const it of items) map.set(it.date, [...(map.get(it.date) ?? []), it]);
  return map;
}
