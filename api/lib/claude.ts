import Anthropic from "@anthropic-ai/sdk";

// Live calls to Claude happen ONLY when PARSE_LIVE=1 is set explicitly.
// Local dev, tests, and previews use the fixtures in mock.ts instead. Set PARSE_LIVE=1 in the
// production environment (Vercel) so real users get real parsing.
export const LIVE = process.env.PARSE_LIVE === "1";
export const MODEL = process.env.PARSE_MODEL ?? "claude-opus-5";

let client: Anthropic | null = null;
export function getClient(): Anthropic {
  if (!LIVE) throw new Error("Claude is disabled outside PARSE_LIVE=1");
  return (client ??= new Anthropic());
}

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
export const MEDIA_TYPES: ImageMediaType[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export interface SourceInput {
  text?: string;
  image?: { data: string; mediaType: ImageMediaType };
  now: string; // device local time, "YYYY-MM-DDTHH:mm"
  timeZone: string; // IANA, e.g. "Asia/Seoul"
  locale?: string; // e.g. "ko-KR"
}

export function sourceContent(input: SourceInput, fallbackInstruction: string): Anthropic.ContentBlockParam[] {
  const content: Anthropic.ContentBlockParam[] = [];
  if (input.image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: input.image.mediaType, data: input.image.data },
    });
  }
  const header = `Current local date and time: ${input.now} (${input.timeZone}${input.locale ? `, ${input.locale}` : ""}).`;
  content.push({
    type: "text",
    text: input.text ? `${header}\n\nSource text:\n${input.text}` : `${header}\n\n${fallbackInstruction}`,
  });
  return content;
}
