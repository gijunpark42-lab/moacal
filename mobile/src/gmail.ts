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
}

// Messages from the last `days` days that contain at least one event, newest first.
export async function scanGmail(days = 7): Promise<ScannedMessage[]> {
  if (MOCK) {
    await new Promise((r) => setTimeout(r, 600));
    return mockGmailMessages();
  }
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) throw new Error("Gmail이 연결되어 있지 않아요");
  try {
    const result = await post<{ email: string; messages: ScannedMessage[] }>("/api/gmail/scan", { token, days });
    return result.messages;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && e.message === "gmail_disconnected") {
      await disconnectGmail();
      throw new Error("Gmail 연결이 끊겼어요. 다시 연결해 주세요");
    }
    throw e;
  }
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
