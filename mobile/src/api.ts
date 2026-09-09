import { nowLocal } from "./dates";
import { mockParse, mockReply } from "./mock";
import type { ParseResult, ReplyEvent, Slot } from "./types";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const APP_KEY = process.env.EXPO_PUBLIC_APP_KEY;
// EXPO_PUBLIC_MOCK=1 skips the server entirely. The server itself also refuses to call Claude
// unless PARSE_LIVE=1, so development never spends API credits.
export const MOCK = process.env.EXPO_PUBLIC_MOCK === "1";

export interface Source {
  text?: string;
  image?: { data: string; mediaType: string };
  email?: { to: string; subject: string }; // set when the text came from a Gmail message, so Reply can answer it
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TIMEOUT_MS = 120_000; // a Gmail scan can take a minute; anything longer is treated as a failure, not a spinner forever

export async function post<T>(path: string, body: object): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(APP_KEY ? { "x-app-key": APP_KEY } : {}) },
      body: JSON.stringify({
        ...body,
        now: nowLocal(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: "ko-KR",
      }),
      signal: controller.signal,
    });
  } catch (e) {
    throw new ApiError(0, controller.signal.aborted ? "서버 응답이 너무 오래 걸려요. 다시 시도해 주세요" : `서버에 연결하지 못했어요 (${e instanceof Error ? e.message : "network"})`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err.error ?? `HTTP ${res.status}`);
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

export async function reply(
  source: Source,
  accepted: ReplyEvent[],
  declined: ReplyEvent[],
  alternatives: Slot[],
  tone: "formal" | "casual",
  language: "ko" | "en" | "ja" | "vi" | "zh",
): Promise<string> {
  if (MOCK) {
    await sleep(600);
    return `[${language}] ${mockReply(accepted, declined, alternatives)}`;
  }
  const result = await post<{ reply: string }>("/api/reply", { ...source, accepted, declined, alternatives, tone, language });
  return result.reply;
}
