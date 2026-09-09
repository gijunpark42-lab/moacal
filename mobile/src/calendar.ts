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

// The calendar new events are written to. iOS: the system default (falls back to any writable one, e.g. when iCloud
// calendar is off); Android: the primary account calendar, else Google, else the first writable.
export async function pickWritableCalendar(): Promise<Calendar.ExpoCalendar | null> {
  if (Platform.OS === "ios") {
    try {
      const def = Calendar.getDefaultCalendarSync();
      if (def?.allowsModifications !== false) return def;
    } catch {
      // no default calendar (iCloud off, no accounts); fall through to the list
    }
  }
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  const writable = calendars.filter((c) => c.allowsModifications);
  return writable.find((c) => c.isPrimary) ?? writable.find((c) => c.source?.type === "com.google") ?? writable[0] ?? null;
}

const writableCalendar = pickWritableCalendar;

function details(event: StoredEvent, start: Date, rule?: Calendar.RecurrenceRule): EventDetails {
  const end = event.all_day ? new Date(start.getTime() + DAY) : event.end ? toDate(event.end) : new Date(start.getTime() + HOUR);
  return {
    title: event.title,
    startDate: start,
    endDate: end,
    allDay: event.all_day,
    location: event.location,
    notes: event.description ?? undefined,
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
