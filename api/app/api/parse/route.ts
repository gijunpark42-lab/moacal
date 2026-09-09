import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { parseEvents, type ImageMediaType } from "@/lib/parse";

const MEDIA_TYPES: ImageMediaType[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(req: NextRequest) {
  const appKey = process.env.APP_KEY;
  if (appKey && req.headers.get("x-app-key") !== appKey) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    text?: string;
    image?: { data?: string; mediaType?: string };
    now?: string;
    timeZone?: string;
    locale?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const text = body.text?.trim();
  const image =
    body.image?.data && MEDIA_TYPES.includes(body.image.mediaType as ImageMediaType)
      ? { data: body.image.data, mediaType: body.image.mediaType as ImageMediaType }
      : undefined;
  if (!text && !image) {
    return NextResponse.json({ error: "text or image is required" }, { status: 400 });
  }
  if (!body.now || !body.timeZone) {
    return NextResponse.json({ error: "now and timeZone are required" }, { status: 400 });
  }

  try {
    const result = await parseEvents({ text, image, now: body.now, timeZone: body.timeZone, locale: body.locale });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "busy, try again" }, { status: 429 });
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
    }
    console.error(error);
    return NextResponse.json({ error: "parse failed" }, { status: 500 });
  }
}
