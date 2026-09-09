import { NextRequest, NextResponse } from "next/server";
import { draftReply, type ReplyEvent } from "@/lib/reply";
import { errorResponse, readSource } from "@/lib/request";

function eventList(value: unknown): ReplyEvent[] | null {
  if (!Array.isArray(value)) return null;
  const out: ReplyEvent[] = [];
  for (const v of value) {
    if (typeof v?.title !== "string" || typeof v?.start !== "string") return null;
    out.push({ title: v.title, start: v.start });
  }
  return out;
}

export async function POST(req: NextRequest) {
  const read = await readSource(req);
  if (read instanceof NextResponse) return read;

  const accepted = eventList(read.body.accepted ?? []);
  const declined = eventList(read.body.declined ?? []);
  if (!accepted || !declined) {
    return NextResponse.json({ error: "accepted/declined must be arrays of {title, start}" }, { status: 400 });
  }

  try {
    const reply = await draftReply({ ...read.source, accepted, declined });
    return NextResponse.json({ reply });
  } catch (error) {
    return errorResponse(error, "reply");
  }
}
