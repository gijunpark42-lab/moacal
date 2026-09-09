import AsyncStorage from "@react-native-async-storage/async-storage";

export type Tone = "formal" | "casual";

export interface Settings {
  bigFont: boolean; // larger text for older users
  syncCalendar: boolean; // also write accepted events into the phone's calendar app
  reminderMinutes: number; // local notification this many minutes before an event; 0 = off
  tone: Tone; // how replies and template mails are worded
}

export const DEFAULT_SETTINGS: Settings = { bigFont: false, syncCalendar: true, reminderMinutes: 30, tone: "formal" };
export const REMINDER_OPTIONS = [0, 10, 30, 60];
export const TONE_LABELS: Record<Tone, string> = { formal: "FORMAL · 격식", casual: "CASUAL · 친근" };

const KEY = "settings.v1";

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(settings));
}
