// Gmail OAuth + read-only inbox scan. The server never stores tokens: the refresh token is
// encrypted with GMAIL_TOKEN_SECRET and handed to the phone, which sends it back on each scan.
// Mock mode (no GOOGLE_CLIENT_ID) never touches Google and never calls Claude.
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ParsedEvent } from "./schema";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const TOKEN_SECRET = process.env.GMAIL_TOKEN_SECRET;
export const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? "https://inbox-calendar-api.vercel.app";
export const GMAIL_MOCK = !CLIENT_ID;

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const MAX_TEXT = 6000;

export interface ScannedMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  fromEmail: string;
  date: string;
  snippet: string;
  text: string;
  events: ParsedEvent[];
  notes: string;
}

export type MailContent = Omit<ScannedMessage, "id" | "threadId" | "events" | "notes">;

// Thrown when Google rejects the refresh token (revoked, expired). The app must forget it.
export class GmailDisconnectedError extends Error {
  constructor() {
    super("gmail_disconnected");
  }
}

// ---- secrets -------------------------------------------------------------------------------

function secretKey(): Buffer {
  const key = TOKEN_SECRET ? Buffer.from(TOKEN_SECRET, "hex") : Buffer.alloc(0);
  if (key.length !== 32) throw new Error("GMAIL_TOKEN_SECRET must be 64 hex chars (32 bytes)");
  return key;
}

function redirectUri(): string {
  return `${PUBLIC_BASE_URL}/api/gmail/callback`;
}

function hmac(payload: string): string {
  return createHmac("sha256", secretKey()).update(payload).digest("base64url");
}

export function signState(returnUrl: string): string {
  const payload = Buffer.from(JSON.stringify({ return: returnUrl, nonce: randomBytes(8).toString("hex") })).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

export function verifyState(state: string): { return: string; nonce: string } | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(hmac(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data?.return !== "string" || typeof data?.nonce !== "string") return null;
    return { return: data.return, nonce: data.nonce };
  } catch {
    return null;
  }
}

export interface StoredToken {
  refresh_token: string;
  email: string;
}

// AES-256-GCM, blob = base64url(iv).base64url(ciphertext).base64url(tag)
export function encryptToken(data: StoredToken): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return [iv, ct, cipher.getAuthTag()].map((b) => b.toString("base64url")).join(".");
}

export function decryptToken(blob: string): StoredToken | null {
  const parts = blob.split(".");
  if (parts.length !== 3) return null;
  try {
    const [iv, ct, tag] = parts.map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", secretKey(), iv);
    decipher.setAuthTag(tag);
    const data = JSON.parse(Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8"));
    if (typeof data?.refresh_token !== "string" || typeof data?.email !== "string") return null;
    return { refresh_token: data.refresh_token, email: data.email };
  } catch {
    return null;
  }
}

// ---- OAuth ---------------------------------------------------------------------------------

export function buildAuthUrl(returnUrl: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: signState(returnUrl),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(form: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID ?? "", client_secret: CLIENT_SECRET ?? "", ...form }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if (data.error === "invalid_grant") throw new GmailDisconnectedError();
    throw new Error(`token endpoint ${res.status}: ${data.error ?? "unknown"}`);
  }
  return data;
}

export async function exchangeCode(code: string): Promise<{ accessToken: string; refreshToken: string }> {
  const data = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  if (typeof data.access_token !== "string" || typeof data.refresh_token !== "string") {
    throw new Error("token response missing access_token/refresh_token");
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const data = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
  if (typeof data.access_token !== "string") throw new Error("token response missing access_token");
  return data.access_token;
}

async function gmailGet<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${GMAIL_API}${path}`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) throw new GmailDisconnectedError();
  if (!res.ok) throw new Error(`gmail ${path} ${res.status}`);
  return (await res.json()) as T;
}

export async function getProfileEmail(accessToken: string): Promise<string> {
  const profile = await gmailGet<{ emailAddress?: string }>(accessToken, "/profile");
  if (!profile.emailAddress) throw new Error("profile missing emailAddress");
  return profile.emailAddress;
}

// ---- messages ------------------------------------------------------------------------------

// `sinceMs` narrows the search to mail received after that moment (incremental scans); otherwise the last `days` days.
export async function listRecentMessages(accessToken: string, days: number, max: number, sinceMs?: number): Promise<{ id: string; threadId: string }[]> {
  const window = sinceMs ? `after:${Math.floor(sinceMs / 1000)}` : `newer_than:${days}d`;
  const q = `${window} -category:promotions -category:social -in:spam -in:trash`;
  const params = new URLSearchParams({ q, maxResults: String(max) });
  const data = await gmailGet<{ messages?: { id: string; threadId: string }[] }>(accessToken, `/messages?${params}`);
  return data.messages ?? [];
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

interface GmailMessage extends GmailPart {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart & { headers?: { name: string; value: string }[] };
}

function findPart(part: GmailPart | undefined, mime: string): string | null {
  if (!part) return null;
  if (part.mimeType === mime && part.body?.data) return part.body.data;
  for (const p of part.parts ?? []) {
    const found = findPart(p, mime);
    if (found) return found;
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h[1-6]|blockquote|table)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseFrom(header: string): { from: string; fromEmail: string } {
  const m = header.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { from: m[1].trim() || m[2].trim(), fromEmail: m[2].trim() };
  const addr = header.trim();
  return { from: addr, fromEmail: addr };
}

export async function getMessage(accessToken: string, id: string): Promise<MailContent> {
  const msg = await gmailGet<GmailMessage>(accessToken, `/messages/${id}?format=full`);
  const headers = msg.payload?.headers ?? [];
  const header = (name: string) => headers.find((h) => h.name.toLowerCase() === name)?.value ?? "";

  const plain = findPart(msg.payload, "text/plain");
  const html = plain ? null : findPart(msg.payload, "text/html");
  let text = plain ? Buffer.from(plain, "base64url").toString("utf8") : html ? htmlToText(Buffer.from(html, "base64url").toString("utf8")) : "";
  text = text.replace(/\r\n/g, "\n").trim().slice(0, MAX_TEXT);

  const ms = Number(msg.internalDate);
  const date = Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : new Date(header("date") || Date.now()).toISOString();

  return {
    subject: header("subject"),
    ...parseFrom(header("from")),
    date,
    snippet: decodeEntities(msg.snippet ?? ""),
    text,
  };
}

// Cheap prefilter so Claude only sees mail that might mention a date or time.
const SCHEDULE_HINT = new RegExp(
  [
    "\\d+\\s*(월|일|시|분)",
    "오전|오후|내일|모레|다음\\s*주|이번\\s*주|주말|요일|저녁|아침|점심|새벽|밤",
    "\\b(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?\\b",
    "\\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?\\s*\\d",
    "\\btomorrow\\b|\\btonight\\b|\\bnext\\s+week\\b|\\bthis\\s+week(end)?\\b",
    "\\d{1,2}:\\d{2}",
    "\\d{1,2}\\s*(am|pm)\\b",
  ].join("|"),
  "i",
);

export function looksSchedulable(text: string): boolean {
  return SCHEDULE_HINT.test(text);
}

// ---- mock ----------------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function nextWeekday(dateKey: string, weekday: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const diff = (weekday - new Date(y, m - 1, d).getDay() + 7) % 7 || 7;
  return addDays(dateKey, diff);
}

function isoHoursAgo(now: string, hours: number): string {
  return new Date(new Date(`${now}:00Z`).getTime() - hours * 3600_000).toISOString();
}

export function mockScan(now: string): { email: string; messages: ScannedMessage[] } {
  const today = now.slice(0, 10);
  const meeting = addDays(today, 2);
  const thursday = nextWeekday(today, 4);
  const notes = "[목 데이터] 개발 모드라 실제 Gmail은 읽지 않았어요.";
  const koreanText =
    "안녕하세요 기준 학생,\n\n지난번에 말씀드린 프로젝트 관련해서 다음 주 수요일 오전 11시 면담 가능하실까요? 30분 정도면 충분할 것 같습니다. 제 연구실(Soda 721)에서 뵙겠습니다.\n\n감사합니다.\n김교수 드림";
  const englishText =
    "Hey everyone,\n\nWe're starting a CS 61B study group this Thursday at 7pm in Moffitt 4th floor. Bring your project 1 questions - we'll go over the midterm topics too.\n\nSee you there,\nAlex";
  return {
    email: "mock@example.com",
    messages: [
      {
        id: "mock-1",
        threadId: "mock-thread-1",
        subject: "면담 일정 확인",
        from: "김교수",
        fromEmail: "prof.kim@example.com",
        date: isoHoursAgo(now, 3),
        snippet: "지난번에 말씀드린 프로젝트 관련해서 다음 주 수요일 오전 11시 면담 가능하실까요?",
        text: koreanText,
        events: [
          {
            title: "김교수님 면담",
            start: `${meeting}T11:00`,
            end: `${meeting}T11:30`,
            all_day: false,
            location: "Soda 721",
            description: "프로젝트 관련 면담",
            recurrence: null,
            confidence: 0.85,
            source_excerpt: "다음 주 수요일 오전 11시 면담 가능하실까요?",
          },
        ],
        notes,
      },
      {
        id: "mock-2",
        threadId: "mock-thread-2",
        subject: "CS 61B study group Thursday",
        from: "Alex Chen",
        fromEmail: "alex@example.com",
        date: isoHoursAgo(now, 26),
        snippet: "We're starting a CS 61B study group this Thursday at 7pm in Moffitt 4th floor.",
        text: englishText,
        events: [
          {
            title: "CS 61B study group",
            start: `${thursday}T19:00`,
            end: null,
            all_day: false,
            location: "Moffitt 4th floor",
            description: "Bring project 1 questions; midterm topics",
            recurrence: null,
            confidence: 0.8,
            source_excerpt: "this Thursday at 7pm in Moffitt 4th floor",
          },
        ],
        notes,
      },
    ],
  };
}

// ---- route helpers -------------------------------------------------------------------------

// Only deep links back into the app (Expo Go, dev build) or local dev hosts may receive the token.
const RETURN_PREFIXES = ["exp://", "exps://", "inboxcalendar://", "http://localhost", "http://10.", "http://192.168."];

export function isAllowedReturnUrl(url: string): boolean {
  return RETURN_PREFIXES.some((p) => url.startsWith(p));
}

export function appendQuery(url: string, params: Record<string, string>): string {
  return `${url}${url.includes("?") ? "&" : "?"}${new URLSearchParams(params)}`;
}
