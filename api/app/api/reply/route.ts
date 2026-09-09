import { NextRequest, NextResponse } from "next/server";
import { draftReply, LANGUAGES, type Language, type ReplyEvent, type Slot } from "@/lib/reply";
import { errorResponse, readSource } from "@/lib/request";

function eventList(value: unknown): ReplyEvent[] | null {
  if (!Array.isArray(value)) return null;
  const out: ReplyEvent[] = [];
  for (const v of value) {
    if (typeof v?.title !== "string" || typeof v?.start !== "string") return null;
    out.push({ title: v.title, start: v.start, conflict: typeof v.conflict === "string" ? v.conflict : undefined });
  }
  return out;
}

function slotList(value: unknown): Slot[] | null {
  if (!Array.isArray(value)) return null;
  const out: Slot[] = [];
  for (const v of value) {
    if (typeof v?.start !== "string" || typeof v?.end !== "string") return null;
    out.push({ start: v.start, end: v.end });
  }
  return out;
}

export async function POST(req: NextRequest) {
  const read = await readSource(req);
  if (read instanceof NextResponse) return read;

  const accepted = eventList(read.body.accepted ?? []);
  const declined = eventList(read.body.declined ?? []);
  const alternatives = slotList(read.body.alternatives ?? []);
  if (!accepted || !declined || !alternatives) {
    return NextResponse.json({ error: "accepted/declined must be arrays of {title, start}; alternatives of {start, end}" }, { status: 400 });
  }

  const tone = read.body.tone === "casual" ? "casual" : "formal";
  const language = LANGUAGES.includes(read.body.language as Language) ? (read.body.language as Language) : "en";

  try {
    const reply = await draftReply({ ...read.source, accepted, declined, alternatives, tone, language });
    return NextResponse.json({ reply });
  } catch (error) {
    return errorResponse(error, "reply");
  }
}
