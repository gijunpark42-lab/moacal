import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { type ImageMediaType, type SourceInput } from "./claude";

interface RawBody {
  text?: string;
  image?: { data?: string; mediaType?: string };
  now?: string;
  timeZone?: string;
  locale?: string;
  [key: string]: unknown;
}

// Phones often report the original file type (image/png for a screenshot) even after the picker
// re-encoded it as JPEG, and Claude rejects a mismatch. So trust the bytes, not the label.
function sniffImageType(base64: string): ImageMediaType | null {
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("UklGR")) return "image/webp";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  return null;
}

// Shared by /api/parse and /api/reply: app-key check, JSON parsing, and source validation.
export async function readSource(req: NextRequest): Promise<{ source: SourceInput; body: RawBody } | NextResponse> {
  const appKey = process.env.APP_KEY;
  if (appKey && req.headers.get("x-app-key") !== appKey) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: RawBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const text = body.text?.trim();
  const mediaType = body.image?.data ? sniffImageType(body.image.data) : null;
  const image = body.image?.data && mediaType ? { data: body.image.data, mediaType } : undefined;
  if (body.image?.data && !image) {
    return NextResponse.json({ error: "unsupported image format (use jpeg, png, webp, or gif)" }, { status: 400 });
  }
  if (!text && !image) {
    return NextResponse.json({ error: "text or image is required" }, { status: 400 });
  }
  if (!body.now || !body.timeZone) {
    return NextResponse.json({ error: "now and timeZone are required" }, { status: 400 });
  }
  return { source: { text, image, now: body.now, timeZone: body.timeZone, locale: body.locale }, body };
}

export function errorResponse(error: unknown, what: string): NextResponse {
  if (error instanceof Anthropic.RateLimitError) {
    return NextResponse.json({ error: "busy, try again" }, { status: 429 });
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  console.error(error);
  return NextResponse.json({ error: `${what} failed` }, { status: 500 });
}
