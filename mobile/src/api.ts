import { nowLocal } from "./dates";
import type { ParseResult } from "./types";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const APP_KEY = process.env.EXPO_PUBLIC_APP_KEY;

export interface ParseRequest {
  text?: string;
  image?: { data: string; mediaType: string };
}

export async function parse(input: ParseRequest): Promise<ParseResult> {
  const res = await fetch(`${API_URL}/api/parse`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(APP_KEY ? { "x-app-key": APP_KEY } : {}) },
    body: JSON.stringify({
      ...input,
      now: nowLocal(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: "ko-KR",
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}
