// Writes accepted events into the phone's own calendar app (Google/Samsung/iOS Calendar) via expo-calendar.
import * as Calendar from "expo-calendar";
import { Platform } from "react-native";
import { toDate, WEEKDAYS } from "./dates";
import type { StoredEvent } from "./types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// A weekly event with no known end date (e.g. a timetable without a semester end) repeats this long.
const DEFAULT_WEEKS = 16;

type EventDetails = Parameters<Calendar.ExpoCalendar["createEvent"]>[0];

export async function requestPermission(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissions();
  return status === "granted";
}

function isGoogle(c: Calendar.ExpoCalendar): boolean {
  const src = c.source;
  return src?.type === "com.google" || /google|gmail/i.test(`${src?.name ?? ""} ${c.title ?? ""}`);
}

// The calendar new events are written to. A Google-account calendar comes first on both platforms, so what the app
// saves shows up on calendar.google.com (and web edits flow back into the app). Then the platform default,
// then the primary/first writable calendar.
export async function pickWritableCalendar(): Promise<Calendar.ExpoCalendar | null> {
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  const writable = calendars.filter((c) => c.allowsModifications);
  const google = writable.find((c) => isGoogle(c) && c.isPrimary) ?? writable.find(isGoogle);
  if (google) return google;
  if (Platform.OS === "ios") {
    try {
      const def = Calendar.getDefaultCalendarSync();
      if (def?.allowsModifications !== false) return def;
    } catch {
      // no default calendar (iCloud off, no accounts); fall through to the list
    }
  }
  return writable.find((c) => c.isPrimary) ?? writable[0] ?? null;
}

export async function targetIsGoogle(): Promise<boolean> {
  const c = await pickWritableCalendar();
  return !!c && isGoogle(c);
}

const writableCalendar = pickWritableCalendar;

function details(event: StoredEvent, start: Date, rule?: Calendar.RecurrenceRule): EventDetails {
  const end = event.all_day ? new Date(start.getTime() + DAY) : event.end ? toDate(event.end) : new Date(start.getTime() + HOUR);
  // Sender and meeting links go into the notes so they show up in the phone/Google calendar too.
  const o = event.origin;
  const notes = [
    event.description,
    o ? `보낸 사람: ${o.from} <${o.fromEmail}>` : null,
    ...(o?.links ?? []).map((l) => `${l.label}: ${l.url}`),
    o ? `메일 제목: ${o.subject}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    title: event.title,
    startDate: start,
    endDate: end,
    allDay: event.all_day,
    location: event.location,
    notes: notes || undefined,
    url: o?.links[0]?.url,
    recurrenceRule: rule,
  };
}

// Returns the created calendar event ids for each stored event id. Throws if no calendar can be written to.
export async function addToDeviceCalendar(events: StoredEvent[]): Promise<Record<string, string[]>> {
  const calendar = await writableCalendar();
  if (!calendar) throw new Error("쓸 수 있는 캘린더가 없어요");

  const out: Record<string, string[]> = {};
  for (const event of events) {
    const start = toDate(event.start);
    const ids: string[] = [];
    if (!event.recurrence) {
      ids.push((await calendar.createEvent(details(event, start))).id);
    } else {
      const endDate = event.recurrence.until ? toDate(event.recurrence.until) : new Date(start.getTime() + DEFAULT_WEEKS * 7 * DAY);
      if (event.recurrence.freq === "daily") {
        ids.push((await calendar.createEvent(details(event, start, { frequency: Calendar.Frequency.DAILY, endDate }))).id);
      } else {
        // One weekly series per weekday works on both Android and iOS (daysOfTheWeek is iOS-only).
        for (const day of event.recurrence.by_day) {
          const first = new Date(start);
          first.setDate(first.getDate() + ((WEEKDAYS.indexOf(day) - start.getDay() + 7) % 7));
          ids.push((await calendar.createEvent(details(event, first, { frequency: Calendar.Frequency.WEEKLY, endDate }))).id);
        }
      }
    }
    out[event.id] = ids;
  }
  return out;
}

export async function removeFromDeviceCalendar(ids: string[]): Promise<void> {
  for (const id of ids) {
    try {
      await (await Calendar.ExpoCalendarEvent.get(id)).delete();
    } catch {
      // Already deleted by the user in the calendar app; nothing to do.
    }
  }
}
