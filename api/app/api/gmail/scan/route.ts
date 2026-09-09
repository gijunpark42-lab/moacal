import { NextRequest, NextResponse } from "next/server";
import {
  decryptToken,
  getMessage,
  GMAIL_MOCK,
  GmailDisconnectedError,
  listRecentMessages,
  looksSchedulable,
  mockScan,
  refreshAccessToken,
  type ScannedMessage,
} from "@/lib/gmail";
import { hasEvent } from "@/lib/classify";
import { parseEvents } from "@/lib/parse";
import { checkAppKey } from "@/lib/request";

const CONCURRENCY = 3;
const SCAN_TEXT_CHARS = 4000; // emails rarely need more than this to find the date; keeps extraction tokens down

function intInRange(value: unknown, fallback: number, max: number): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) return null;
  return value;
}

export async function POST(req: NextRequest) {
  const denied = checkAppKey(req);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { token, now, timeZone, locale } = body;
  if (typeof token !== "string" || !token) return NextResponse.json({ error: "token is required" }, { status: 400 });
  if (typeof now !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(now) || typeof timeZone !== "string" || !timeZone) {
    return NextResponse.json({ error: "now (YYYY-MM-DDTHH:mm) and timeZone are required" }, { status: 400 });
  }
  const days = intInRange(body.days, 7, 30);
  const max = intInRange(body.max, 20, 50);
  if (days === null || max === null) return NextResponse.json({ error: "days must be 1-30 and max 1-50" }, { status: 400 });
  // Incremental scans: only mail that arrived after `since` (epoch ms), and never mail the phone already saw.
  const since = typeof body.since === "number" && body.since > 0 ? body.since : undefined;
  const exclude = new Set(Array.isArray(body.exclude) ? (body.exclude as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 1000) : []);

  if (token === "mock" || GMAIL_MOCK) {
    console.log("[gmail] mock mode: returning fixture messages");
    const mock = mockScan(now);
    const messages = mock.messages.filter((m) => !exclude.has(m.id));
    return NextResponse.json({ ...mock, messages, scanned: messages.length, candidates: messages.length, checkedIds: messages.map((m) => m.id) });
  }

  const stored = decryptToken(token);
  if (!stored) return NextResponse.json({ error: "gmail_disconnected" }, { status: 401 });

  try {
    const started = Date.now();
    const accessToken = await refreshAccessToken(stored.refresh_token);
    const ids = (await listRecentMessages(accessToken, days, max, since)).filter((m) => !exclude.has(m.id));
    const results: (ScannedMessage | null)[] = new Array(ids.length).fill(null);
    let candidates = 0;
    let classified = 0;

    // At most CONCURRENCY messages are fetched + parsed at a time.
    let next = 0;
    const worker = async () => {
      while (next < ids.length) {
        const i = next++;
        const mail = await getMessage(accessToken, ids[i].id);
        if (!looksSchedulable(`${mail.subject}\n${mail.text}`)) continue; // free regex gate
        candidates++;
        if (!(await hasEvent(mail.subject, mail.text))) continue; // cheap model gate
        classified++;
        const text = `Subject: ${mail.subject}\nFrom: ${mail.from} <${mail.fromEmail}>\nDate: ${mail.date}\n\n${mail.text.slice(0, SCAN_TEXT_CHARS)}`;
        const parsed = await parseEvents({ text, now, timeZone, locale: typeof locale === "string" ? locale : undefined }, { effort: "low", maxTokens: 4000 });
        if (parsed.events.length === 0) continue;
        results[i] = { id: ids[i].id, threadId: ids[i].threadId, ...mail, events: parsed.events, notes: parsed.notes };
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));

    const messages = results
      .filter((m): m is ScannedMessage => m !== null)
      .sort((a, b) => b.date.localeCompare(a.date));
    // Counts only, no content: enough to tell "nothing matched" from "something broke" in the logs.
    console.log(
      `[gmail] scan: listed ${ids.length} (since=${since ?? "none"}, excluded ${exclude.size}), regex passed ${candidates}, classifier passed ${classified}, with events ${messages.length}, ${Date.now() - started}ms`,
    );
    return NextResponse.json({ email: stored.email, messages, scanned: ids.length, candidates, checkedIds: ids.map((m) => m.id) });
  } catch (error) {
    if (error instanceof GmailDisconnectedError) {
      return NextResponse.json({ error: "gmail_disconnected" }, { status: 401 });
    }
    console.error(error);
    return NextResponse.json({ error: "scan failed" }, { status: 500 });
  }
}
