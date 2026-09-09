export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

export interface Recurrence {
  freq: "daily" | "weekly";
  by_day: Weekday[];
  until: string | null; // YYYY-MM-DD
}

export interface MailLink {
  url: string;
  label: string; // "Zoom", "Google Meet", "Teams", or the host name
}

// Where an event came from when it was found in an email. Kept with the event so the sender and the meeting link stay one tap away.
export interface EventOrigin {
  from: string;
  fromEmail: string;
  subject: string;
  messageId: string;
  links: MailLink[];
}

// What the API returns for one event (origin is added on the phone, not by the API).
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
  origin?: EventOrigin;
}

export interface ParseResult {
  events: ParsedEvent[];
  notes: string;
}

// One inbox message that /api/gmail/scan found events in.
export interface ScannedMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string; // display name or address
  fromEmail: string;
  date: string; // ISO
  snippet: string;
  text: string; // plain body, max 6000 chars
  events: ParsedEvent[];
  notes: string;
}

// What we store on the device.
export interface StoredEvent extends ParsedEvent {
  id: string;
  createdAt: string;
  calendarEventIds?: string[]; // ids in the phone's calendar app, if synced
  notificationIds?: string[]; // scheduled reminder notifications
}

// One row in the agenda: an event on a specific date (recurring events expand into many).
export interface Occurrence<T extends ParsedEvent = StoredEvent> {
  event: T;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:mm
}

// A concrete time range that is already taken: an app event occurrence or an event from the phone calendar.
export interface BusyBlock {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  source: "app" | "phone";
}

// A free time range offered as an alternative. Local strings like event starts.
export interface Slot {
  start: string;
  end: string;
}

export interface ReplyEvent {
  title: string;
  start: string;
  conflict?: string; // what it clashes with, e.g. "CS 61B 10:30–12:00"
}
