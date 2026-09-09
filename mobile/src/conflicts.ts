// Conflict detection between newly found events and everything already on the calendar, plus free-slot search.
import { addDays, expand, formatShort, formatTime, occurrenceRange, toDateKey, toLocalString } from "./dates";
import type { BusyBlock, ParsedEvent, Slot, StoredEvent } from "./types";

const MINUTE = 60 * 1000;

function overlaps(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
  return a.start < b.end && b.start < a.end;
}

// App events as busy blocks over a window, so new events are checked against what the app already saved.
export function appBusyBlocks(events: StoredEvent[], from: string, to: string): BusyBlock[] {
  return expand(events, from, to).map((o) => {
    const { start, end } = occurrenceRange(o);
    return { id: `${o.event.id}-${o.date}`, title: o.event.title, start, end, allDay: o.event.all_day, source: "app" as const };
  });
}

export interface Conflict {
  with: BusyBlock;
  at: Date; // the occurrence of the new event that clashes
}

// First clash for each parsed event (by index) within the window. All-day busy blocks are ignored: they rarely block a meeting.
export function findConflicts(parsed: ParsedEvent[], busy: BusyBlock[], from: string, to: string): Map<number, Conflict> {
  const timed = busy.filter((b) => !b.allDay);
  const out = new Map<number, Conflict>();
  parsed.forEach((event, index) => {
    if (event.all_day) return;
    for (const o of expand([event], from, to)) {
      if (!o.time) continue;
      const range = occurrenceRange(o);
      const hit = timed.find((b) => overlaps(range, b));
      if (hit) {
        out.set(index, { with: hit, at: range.start });
        return;
      }
    }
  });
  return out;
}

export function describeConflict(c: Conflict): string {
  return `${formatShort(c.at)}에 "${c.with.title}" (${formatTime(c.with.start)}–${formatTime(c.with.end)})와 겹쳐요`;
}

// Up to `count` free slots of `durationMin` minutes on the days after `after`, one per day, between 09:00 and 21:00.
// Candidates closest to the originally proposed time of day are tried first, so "11:00 doesn't work" yields
// "how about 11:00 tomorrow" before "how about 9:00".
export function freeSlots(busy: BusyBlock[], durationMin: number, after: Date, days: number, count = 3): Slot[] {
  const out: Slot[] = [];
  const timed = busy.filter((b) => !b.allDay);
  const startDay = toDateKey(after);
  const preferred = after.getHours() * 60 + after.getMinutes();
  const candidates: number[] = [];
  for (let h = 9 * 60; h + durationMin <= 21 * 60; h += 30) candidates.push(h);
  candidates.sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred));
  for (let d = 1; d <= days && out.length < count; d++) {
    const dateKey = addDays(startDay, d);
    const [y, m, day] = dateKey.split("-").map(Number);
    for (const h of candidates) {
      const start = new Date(y, m - 1, day, Math.floor(h / 60), h % 60);
      const end = new Date(start.getTime() + durationMin * MINUTE);
      if (timed.some((b) => overlaps({ start, end }, b))) continue;
      out.push({ start: toLocalString(start), end: toLocalString(end) });
      break;
    }
  }
  return out;
}

export function durationMinutes(event: ParsedEvent): number {
  const o = expand([event], "0000-01-01", "9999-12-31")[0];
  if (!o) return 60;
  const { start, end } = occurrenceRange(o);
  return Math.max(30, Math.round((end.getTime() - start.getTime()) / MINUTE));
}
