import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StoredEvent } from "./types";

const KEY = "events.v1";

export async function loadEvents(): Promise<StoredEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredEvent[]) : [];
  } catch {
    return [];
  }
}

export async function saveEvents(events: StoredEvent[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(events));
}
