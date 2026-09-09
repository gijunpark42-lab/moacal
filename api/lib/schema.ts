import { z } from "zod";

// Local wall-clock times, no timezone suffix. The phone renders them in its own zone.
// "2026-09-15T15:00" for timed events, "2026-09-15" for all-day events.
export const EventSchema = z.object({
  title: z.string().describe("Short event title in the user's language"),
  start: z.string().describe("Local start. 'YYYY-MM-DDTHH:mm' or 'YYYY-MM-DD' for all-day"),
  end: z.string().nullable().describe("Local end in the same format, or null if unknown"),
  all_day: z.boolean(),
  location: z.string().nullable(),
  description: z.string().nullable().describe("Extra details worth keeping (room, link, who), or null"),
  recurrence: z
    .object({
      freq: z.enum(["daily", "weekly"]),
      by_day: z.array(z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"])),
      until: z.string().nullable().describe("'YYYY-MM-DD' last date, or null if unknown"),
    })
    .nullable()
    .describe("Only for repeating events such as class timetables. null for one-off events"),
  confidence: z.number().min(0).max(1).describe("How sure the date/time is correct"),
  source_excerpt: z.string().describe("The exact words the event was taken from"),
});

export const ParseResultSchema = z.object({
  events: z.array(EventSchema),
  notes: z.string().describe("Anything ambiguous the user should double-check, in their language. Empty string if none"),
});

export type ParsedEvent = z.infer<typeof EventSchema>;
export type ParseResult = z.infer<typeof ParseResultSchema>;
