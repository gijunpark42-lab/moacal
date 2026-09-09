import { getClient, LIVE } from "./claude";

// Cheap yes/no gate before the expensive extraction: does this email actually propose or announce
// something with a date or time? Runs on a small model; the extraction model only sees emails that pass.
const CLASSIFY_MODEL = process.env.CLASSIFY_MODEL ?? "claude-haiku-4-5-20251001";
const MAX_CHARS = 2500;

const SYSTEM = `You decide whether an email contains a schedulable event for the recipient: a meeting, class, appointment, deadline, gathering, or service with a concrete date and/or time (absolute like "9/16 11:00" or relative like "next Wednesday 11am", "내일 오후 3시").
Answer with exactly one word: YES or NO.
NO for newsletters, receipts, promotions, shipping notices, generic reminders without a specific time, and emails that only mention past dates.`;

export async function hasEvent(subject: string, text: string): Promise<boolean> {
  if (!LIVE) return true; // mock mode never reaches here, but keep the gate open if it ever does
  const response = await getClient().messages.create({
    model: CLASSIFY_MODEL,
    max_tokens: 5,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Subject: ${subject}\n\n${text.slice(0, MAX_CHARS)}` }],
  });
  const answer = response.content.find((c) => c.type === "text")?.text.trim().toUpperCase() ?? "";
  return answer.startsWith("Y");
}
