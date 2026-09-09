// Merges app events and phone-calendar events into one list of rows per day.
import { describeRecurrence, expand, formatTime, formatTimeRange, toDateKey } from "./dates";
import type { BusyBlock, StoredEvent } from "./types";

export interface DayItem {
  key: string;
  date: string; // YYYY-MM-DD
  sortKey: string; // time or "" for all-day, used for ordering within a day
  time: string; // what to show in the time column
  title: string;
  sub: string | null;
  source: "app" | "phone";
  event?: StoredEvent; // present for app rows so they can be deleted
}

export function mergedItems(events: StoredEvent[], phone: BusyBlock[], from: string, to: string): DayItem[] {
  const items: DayItem[] = [];
  for (const o of expand(events, from, to)) {
    items.push({
      key: `app-${o.event.id}-${o.date}`,
      date: o.date,
      sortKey: o.time ?? "",
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
      sortKey: b.allDay ? "" : formatTime(b.start),
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
