import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getClient, LIVE, MODEL, sourceContent, type SourceInput } from "./claude";
import { mockReply } from "./mock";

export interface ReplyEvent {
  title: string;
  start: string; // "YYYY-MM-DDTHH:mm" or "YYYY-MM-DD"
  conflict?: string; // what it clashes with in the user's calendar, e.g. "CS 61B 10:30–12:00"
}

export interface Slot {
  start: string; // "YYYY-MM-DDTHH:mm"
  end: string;
}

export type Tone = "formal" | "casual";

export interface ReplyInput extends SourceInput {
  accepted: ReplyEvent[];
  declined: ReplyEvent[];
  alternatives: Slot[]; // free times the user could offer instead of the declined events
  tone: Tone;
}

const ReplySchema = z.object({
  reply: z.string().describe("The reply message text only, ready to paste. No preamble."),
});

const SYSTEM = `You draft a short reply message for the user to send back to the person who sent them the source text or image.

Rules:
- LANGUAGE: reply in exactly the language the source is written in. English email -> English reply. Korean -> Korean. Mixed -> the language of the main body. Never translate into another language.
- TONE is given as FORMAL or CASUAL. FORMAL: polite business style (Korean: 격식 있는 존댓말 "~습니다/~드립니다"; English: courteous, complete sentences, "Thank you"). CASUAL: friendly and relaxed (Korean: 부드러운 존댓말 "~요"; English: short, warm, contractions ok). Never use Korean 반말.
- Confirm the accepted events naturally (mention day/time so the other person can double-check).
- For declined events: if a conflict reason is given, mention briefly that the user already has something then (do not name the conflicting event unless it is clearly fine to share, e.g. "수업이 있어서"). Then, if alternative slots are provided, offer two or three of them as options.
- Keep it short: 1-4 sentences for chats, a brief paragraph for emails. No subject line, no signature, no placeholders for names.
- Never invent times beyond the accepted list and the given alternatives.`;

export async function draftReply(input: ReplyInput): Promise<string> {
  if (!LIVE) {
    console.log("[reply] mock mode: returning fixture (set PARSE_LIVE=1 to call Claude)");
    return mockReply(input.accepted, input.declined, input.alternatives);
  }

  const fmt = (e: ReplyEvent) => `- ${e.title} @ ${e.start}${e.conflict ? ` (conflicts with: ${e.conflict})` : ""}`;
  const decision = [
    `TONE: ${input.tone.toUpperCase()}`,
    `The user ACCEPTED:\n${input.accepted.map(fmt).join("\n") || "(none)"}`,
    `The user DECLINED:\n${input.declined.map(fmt).join("\n") || "(none)"}`,
    `Free alternative slots the user can offer:\n${input.alternatives.map((s) => `- ${s.start} to ${s.end}`).join("\n") || "(none)"}`,
  ].join("\n\n");

  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 2000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      { role: "user", content: [...sourceContent(input, "The source is the image above."), { type: "text", text: decision }] },
    ],
    output_config: { effort: "low", format: zodOutputFormat(ReplySchema) },
  });

  if (response.stop_reason === "refusal") return "";
  if (!response.parsed_output) throw new Error("Model returned output that did not match the schema");
  return response.parsed_output.reply;
}
