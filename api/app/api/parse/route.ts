import { NextRequest, NextResponse } from "next/server";
import { parseEvents } from "@/lib/parse";
import { errorResponse, readSource } from "@/lib/request";

export async function POST(req: NextRequest) {
  const read = await readSource(req);
  if (read instanceof NextResponse) return read;

  try {
    return NextResponse.json(await parseEvents(read.source));
  } catch (error) {
    return errorResponse(error, "parse");
  }
}
