export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

export interface Recurrence {
  freq: "daily" | "weekly";
  by_day: Weekday[];
  until: string | null; // YYYY-MM-DD
}

// What the API returns for one event.
export interface ParsedEvent {
  title: string;
  start: string; // "YYYY-MM-DDTHH:mm" or "YYYY-MM-DD"
  end: string | null;
  all_day: boolean;
  location: string | null;
  description: string | null;
  recurrence: Recurrence | null;
  confidence: number;
  source_excerpt: string;
}

export interface ParseResult {
  events: ParsedEvent[];
  notes: string;
}

// What we store on the device.
export interface StoredEvent extends ParsedEvent {
  id: string;
  createdAt: string;
  calendarEventIds?: string[]; // ids in the phone's calendar app, if synced
}

// One row in the agenda: a stored event on a specific date (recurring events expand into many).
export interface Occurrence {
  event: StoredEvent;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:mm
}
