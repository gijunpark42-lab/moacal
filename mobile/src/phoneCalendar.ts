// Reads what is already in the phone's calendar app so the agenda and conflict checks see the user's real schedule.
import * as Calendar from "expo-calendar";
import type { BusyBlock } from "./types";

export async function hasCalendarPermission(): Promise<boolean> {
  const { status } = await Calendar.getCalendarPermissions();
  return status === "granted";
}

// Events between from and to from every calendar on the phone, minus the ones this app created itself.
export async function listPhoneEvents(from: Date, to: Date, ownIds: Set<string>): Promise<BusyBlock[]> {
  if (!(await hasCalendarPermission())) return [];
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  if (calendars.length === 0) return [];
  const events = await Calendar.listEvents(calendars, from, to);
  const out: BusyBlock[] = [];
  for (const e of events) {
    if (ownIds.has(e.id)) continue;
    const start = new Date(e.startDate);
    const end = new Date(e.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    out.push({ id: e.id, title: e.title || "(제목 없음)", start, end, allDay: !!e.allDay, source: "phone" });
  }
  return out;
}
