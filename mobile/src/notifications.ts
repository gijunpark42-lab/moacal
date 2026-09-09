// Local reminder notifications before each upcoming occurrence of an event.
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { expand, formatTime, horizon, occurrenceRange } from "./dates";
import type { StoredEvent } from "./types";

const MAX_PER_EVENT = 8; // upcoming occurrences to schedule (OS limits pending notifications)
const WINDOW_DAYS = 60;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("reminders", { name: "일정 알림", importance: Notifications.AndroidImportance.HIGH });
  }
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function scheduleReminders(event: StoredEvent, minutesBefore: number): Promise<string[]> {
  const ids: string[] = [];
  if (minutesBefore <= 0) return ids;
  const { from, to } = horizon(WINDOW_DAYS);
  const now = Date.now();
  for (const o of expand([event], from, to)) {
    if (ids.length >= MAX_PER_EVENT) break;
    if (!o.time) continue; // all-day events get no reminder
    const { start } = occurrenceRange(o);
    const fireAt = new Date(start.getTime() - minutesBefore * 60 * 1000);
    if (fireAt.getTime() <= now) continue;
    ids.push(
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${minutesBefore}분 뒤 · ${event.title}`,
          body: [formatTime(start), event.location].filter(Boolean).join(" · "),
          ...(Platform.OS === "android" ? { channelId: "reminders" } : {}),
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
      }),
    );
  }
  return ids;
}

export async function cancelReminders(ids: string[]): Promise<void> {
  for (const id of ids) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // Already fired or removed; nothing to do.
    }
  }
}
