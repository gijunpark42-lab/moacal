import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ParseResultSchema, type ParseResult } from "./schema";

const client = new Anthropic();
const MODEL = process.env.PARSE_MODEL ?? "claude-opus-5";

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export interface ParseInput {
  text?: string;
  image?: { data: string; mediaType: ImageMediaType };
  now: string; // device local time, "YYYY-MM-DDTHH:mm"
  timeZone: string; // IANA, e.g. "Asia/Seoul"
  locale?: string; // e.g. "ko-KR"
}

const SYSTEM = `You extract calendar events from text or images (screenshots of chats, emails, timetables, posters, church bulletins, notices).

Rules:
- Resolve relative dates ("다음 주 목요일", "내일", "this Friday", "이번 주말") against the provided current date and timezone. Korean weeks start on Monday.
- Korean time words: 오전 = AM, 오후 = PM, 낮 12시 = 12:00, 밤 = PM/evening, 새벽 = early morning. "3시 반" = 3:30.
- Class timetables (시간표, 에브리타임 style grids): one event per class with weekly recurrence and the weekdays it meets. If the semester end date is not shown, set until to null.
- Church bulletins (주보) and notices often list several events. Extract every one that has a date or a recurring weekday.
- Chats: only extract things that were actually agreed or proposed with a concrete date. Do not invent times. If only a date is known, make it all-day.
- Keep titles short and in the same language as the source. Put room numbers, links, and people in description.
- Use confidence below 0.5 when the year, date, or time is guessed.
- If there is no event at all, return an empty events array and explain in notes.`;

export async function parseEvents(input: ParseInput): Promise<ParseResult> {
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
    text: input.text ? `${header}\n\nSource text:\n${input.text}` : `${header}\n\nExtract the events from the image.`,
  });

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    output_config: { effort: "medium", format: zodOutputFormat(ParseResultSchema) },
  });

  if (response.stop_reason === "refusal") {
    return { events: [], notes: "이 내용은 처리할 수 없습니다." };
  }
  if (!response.parsed_output) {
    throw new Error("Model returned output that did not match the schema");
  }
  return response.parsed_output;
}
