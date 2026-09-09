import AsyncStorage from "@react-native-async-storage/async-storage";

export interface Settings {
  bigFont: boolean; // larger text for older users
  syncCalendar: boolean; // also write accepted events into the phone's calendar app
}

export const DEFAULT_SETTINGS: Settings = { bigFont: false, syncCalendar: true };

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
