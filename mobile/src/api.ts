import { nowLocal } from "./dates";
import { mockParse, mockReply } from "./mock";
import type { ParsedEvent, ParseResult } from "./types";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const APP_KEY = process.env.EXPO_PUBLIC_APP_KEY;
// EXPO_PUBLIC_MOCK=1 skips the server entirely. The server itself also refuses to call Claude
// unless PARSE_LIVE=1, so development never spends API credits.
export const MOCK = process.env.EXPO_PUBLIC_MOCK === "1";

export interface Source {
  text?: string;
  image?: { data: string; mediaType: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(APP_KEY ? { "x-app-key": APP_KEY } : {}) },
    body: JSON.stringify({
      ...body,
      now: nowLocal(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: "ko-KR",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function parse(source: Source): Promise<ParseResult> {
  if (MOCK) {
    await sleep(600);
    return mockParse(!!source.image, source.text);
  }
  return post<ParseResult>("/api/parse", source);
}

export async function reply(source: Source, accepted: ParsedEvent[], declined: ParsedEvent[]): Promise<string> {
  const pick = (events: ParsedEvent[]) => events.map((e) => ({ title: e.title, start: e.start }));
  if (MOCK) {
    await sleep(600);
    return mockReply(accepted, declined);
  }
  const result = await post<{ reply: string }>("/api/reply", { ...source, accepted: pick(accepted), declined: pick(declined) });
  return result.reply;
}
