import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getClient, LIVE, MODEL, sourceContent, type SourceInput } from "./claude";
import { mockReply } from "./mock";

export interface ReplyEvent {
  title: string;
  start: string; // "YYYY-MM-DDTHH:mm" or "YYYY-MM-DD"
}

export interface ReplyInput extends SourceInput {
  accepted: ReplyEvent[];
  declined: ReplyEvent[];
}

const ReplySchema = z.object({
  reply: z.string().describe("The reply message text only, ready to paste. No preamble."),
});

const SYSTEM = `You draft a short reply message for the user to send back to the person who sent them the source text or image.

Rules:
- Write in the same language and register as the source (Korean chat -> casual-polite Korean ending in 요, email -> polite email style).
- Confirm the accepted events naturally (mention day/time so the other person can double-check). For declined events, decline politely without over-explaining.
- Keep it short: 1-4 sentences for chats, a brief paragraph for emails. No subject line, no signature, no placeholders for names.
- Never invent new times or commitments beyond the accepted list.`;

export async function draftReply(input: ReplyInput): Promise<string> {
  if (!LIVE) {
    console.log("[reply] mock mode: returning fixture (set PARSE_LIVE=1 to call Claude)");
    return mockReply(input.accepted, input.declined);
  }

  const fmt = (e: ReplyEvent) => `- ${e.title} @ ${e.start}`;
  const decision = `The user ACCEPTED:\n${input.accepted.map(fmt).join("\n") || "(none)"}\n\nThe user DECLINED:\n${input.declined.map(fmt).join("\n") || "(none)"}`;

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
