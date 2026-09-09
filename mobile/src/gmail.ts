// Gmail connection: the OAuth flow runs on the API, which hands back an encrypted refresh-token blob.
// The blob lives only in the phone's secure store; the server keeps nothing between requests.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { API_URL, ApiError, MOCK, post } from "./api";
import { mockGmailMessages } from "./mock";
import type { ScannedMessage } from "./types";

const TOKEN_KEY = "gmail.token";
const EMAIL_KEY = "gmail.email";
const HANDLED_KEY = "gmail.handled.v1";

export interface GmailConnection {
  email: string;
}

export async function getGmailConnection(): Promise<GmailConnection | null> {
  const [token, email] = await Promise.all([SecureStore.getItemAsync(TOKEN_KEY), SecureStore.getItemAsync(EMAIL_KEY)]);
  return token && email ? { email } : null;
}

async function store(token: string, email: string): Promise<GmailConnection> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(EMAIL_KEY, email);
  return { email };
}

// Opens Google consent in the system browser; the API redirects back to our deep link with the token. Null if the user cancelled.
export async function connectGmail(): Promise<GmailConnection | null> {
  if (MOCK) return store("mock", "mock@example.com");
  const returnUrl = Linking.createURL("gmail");
  const result = await WebBrowser.openAuthSessionAsync(`${API_URL}/api/gmail/auth?return=${encodeURIComponent(returnUrl)}`, returnUrl);
  if (result.type !== "success") return null;
  const { queryParams } = Linking.parse(result.url);
  const token = queryParams?.token;
  const email = queryParams?.email;
  if (typeof token !== "string" || typeof email !== "string" || !token || !email) return null;
  return store(token, email);
}

export async function disconnectGmail(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(EMAIL_KEY);
  await clearScanCache();
}

// Messages from the last `days` days that contain at least one event, newest first.
// Everything the last scans produced, kept on the phone so switching tabs or restarting the app
// never re-reads (and re-pays for) mail that was already looked at.
export interface ScanCache {
  messages: ScannedMessage[]; // mails with events, newest first
  knownIds: string[]; // every mail id the server has looked at, newest first
  lastScanAt: number; // epoch ms of the last completed scan
  lastScanned: number; // how many new mails the last scan looked at
}

const CACHE_KEY = "gmail.scan.v1";
const MAX_KNOWN_IDS = 1000;
const MAX_MESSAGES = 200;
const OVERLAP_MS = 60 * 60 * 1000; // re-list the last hour too; `knownIds` stops duplicates

export async function loadScanCache(): Promise<ScanCache | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as ScanCache) : null;
  } catch {
    return null;
  }
}

async function saveScanCache(cache: ScanCache): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export async function clearScanCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}

// Drop one mail from the list. Its id stays in knownIds, so it is never re-read either.
export async function hideMessage(id: string): Promise<ScanCache | null> {
  const cache = await loadScanCache();
  if (!cache) return null;
  const next = { ...cache, messages: cache.messages.filter((m) => m.id !== id) };
  await saveScanCache(next);
  return next;
}

// Scans only mail that arrived since the last scan and merges it into the cache.
export async function scanGmail(days = 7): Promise<ScanCache> {
  const cache = await loadScanCache();
  const startedAt = Date.now();
  const since = cache ? Math.max(0, cache.lastScanAt - OVERLAP_MS) : undefined;
  const exclude = cache?.knownIds ?? [];

  let found: ScannedMessage[];
  let checkedIds: string[];
  if (MOCK) {
    await new Promise((r) => setTimeout(r, 600));
    found = mockGmailMessages().filter((m) => !exclude.includes(m.id));
    checkedIds = found.map((m) => m.id);
  } else {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) throw new Error("Gmail이 연결되어 있지 않아요");
    try {
      const result = await post<{ messages: ScannedMessage[]; scanned?: number; checkedIds?: string[] }>("/api/gmail/scan", {
        token,
        days,
        since,
        exclude,
      });
      found = result.messages;
      checkedIds = result.checkedIds ?? result.messages.map((m) => m.id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && e.message === "gmail_disconnected") {
        await disconnectGmail();
        throw new Error("Gmail 연결이 끊겼어요. 다시 연결해 주세요");
      }
      throw e;
    }
  }

  const seen = new Set(found.map((m) => m.id));
  const messages = [...found, ...(cache?.messages ?? []).filter((m) => !seen.has(m.id))]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_MESSAGES);
  const knownIds = [...checkedIds, ...exclude.filter((id) => !checkedIds.includes(id))].slice(0, MAX_KNOWN_IDS);
  const next: ScanCache = { messages, knownIds, lastScanAt: startedAt, lastScanned: checkedIds.length };
  await saveScanCache(next);
  return next;
}

// Ids of messages the user already reviewed, so they drop out of the list.
export async function loadHandled(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(HANDLED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export async function markHandled(id: string): Promise<void> {
  const handled = await loadHandled();
  handled.add(id);
  await AsyncStorage.setItem(HANDLED_KEY, JSON.stringify([...handled]));
}
