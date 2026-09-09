// Zero-token helpers for mail: language detection, link extraction, and template mails
// (reschedule / cancel) in the sender's language and the user's chosen tone.
import { Linking } from "react-native";
import { formatShort, toDate } from "./dates";
import type { Tone } from "./settings";
import type { ScannedMessage } from "./types";

export type Lang = "ko" | "en";

export function detectLanguage(text: string): Lang {
  return /[가-힣]/.test(text) ? "ko" : "en";
}

export interface MailLink {
  url: string;
  label: string; // "Zoom", "Google Meet", "Teams", or the host name
}

const LINK_RE = /https?:\/\/[^\s<>()"'\]]+/g;

export function extractLinks(text: string, max = 3): MailLink[] {
  const seen = new Set<string>();
  const out: MailLink[] = [];
  for (const raw of text.match(LINK_RE) ?? []) {
    const url = raw.replace(/[.,;:!?]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    let host = "";
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    const label = /zoom\.us$/.test(host) ? "Zoom" : host === "meet.google.com" ? "Google Meet" : /teams\.microsoft\.com$/.test(host) ? "Teams" : host;
    // Meeting links first, everything else after.
    if (label === "Zoom" || label === "Google Meet" || label === "Teams") out.unshift({ url, label });
    else out.push({ url, label });
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

function when(start: string, lang: Lang): string {
  const d = toDate(start);
  if (lang === "ko") return formatShort(d);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return start.includes("T") ? `${day} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : day;
}

function firstName(from: string): string {
  return from.split(/[\s<(]/)[0] || "";
}

export interface TemplateMail {
  subject: string;
  body: string;
}

// "Can we move X from A to B?"
export function rescheduleMail(m: ScannedMessage, tone: Tone, newStart: string | null): TemplateMail {
  const lang = detectLanguage(`${m.subject}\n${m.text}`);
  const ev = m.events[0];
  const title = ev?.title ?? m.subject;
  const old = ev ? when(ev.start, lang) : "";
  const next = newStart ? when(newStart, lang) : "";
  const subject = `Re: ${m.subject}`;
  if (lang === "ko") {
    const body =
      tone === "formal"
        ? `안녕하세요,\n\n말씀해 주신 ${title}${old ? ` (${old})` : ""} 일정에 사정이 생겨 시간을 조정하고 싶습니다.\n${next ? `혹시 ${next}에는 가능하실까요?` : "가능하신 다른 시간을 알려주시면 맞추겠습니다."}\n\n번거롭게 해드려 죄송합니다. 감사합니다.`
        : `안녕하세요!\n\n${title}${old ? ` (${old})` : ""} 시간에 일이 생겨서요. ${next ? `${next}는 어떠세요?` : "편한 시간 알려주시면 맞출게요."}\n\n감사합니다 :)`;
    return { subject, body };
  }
  const name = firstName(m.from);
  const body =
    tone === "formal"
      ? `Hi${name ? ` ${name}` : ""},\n\nSomething has come up and I need to reschedule ${title}${old ? ` (${old})` : ""}.\n${next ? `Would ${next} work for you?` : "Could you let me know what other times work for you?"}\n\nSorry for the inconvenience, and thank you.`
      : `Hi${name ? ` ${name}` : ""},\n\nSomething came up on my end for ${title}${old ? ` (${old})` : ""}. ${next ? `Does ${next} work instead?` : "What other time works for you?"}\n\nThanks!`;
  return { subject, body };
}

// "I have to cancel X."
export function cancelMail(m: ScannedMessage, tone: Tone): TemplateMail {
  const lang = detectLanguage(`${m.subject}\n${m.text}`);
  const ev = m.events[0];
  const title = ev?.title ?? m.subject;
  const old = ev ? when(ev.start, lang) : "";
  const subject = `Re: ${m.subject}`;
  if (lang === "ko") {
    const body =
      tone === "formal"
        ? `안녕하세요,\n\n죄송하지만 사정이 생겨 ${title}${old ? ` (${old})` : ""}에 참석하기 어려울 것 같습니다.\n다음 기회에 꼭 함께하겠습니다.\n\n양해 부탁드립니다. 감사합니다.`
        : `안녕하세요!\n\n미안한데 ${title}${old ? ` (${old})` : ""}는 사정이 생겨서 못 갈 것 같아요. 다음에 꼭 볼게요!\n\n감사합니다 :)`;
    return { subject, body };
  }
  const name = firstName(m.from);
  const body =
    tone === "formal"
      ? `Hi${name ? ` ${name}` : ""},\n\nI'm sorry, but I won't be able to make ${title}${old ? ` (${old})` : ""} after all.\nI hope we can find another time soon.\n\nThank you for understanding.`
      : `Hi${name ? ` ${name}` : ""},\n\nSorry, I can't make ${title}${old ? ` (${old})` : ""} anymore. Let's find another time!\n\nThanks!`;
  return { subject, body };
}

export function mailtoUrl(to: string, mail: TemplateMail): string {
  return `mailto:${to}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`;
}

// Gmail app compose link (iOS and Android). Falls back to the default mail app when Gmail isn't installed.
export function gmailComposeUrl(to: string, mail: TemplateMail): string {
  return `googlegmail://co?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`;
}

// Open a prefilled compose window: Gmail app first, then whatever handles mailto:. Throws if neither works.
export async function openCompose(to: string, mail: TemplateMail): Promise<void> {
  const gmail = gmailComposeUrl(to, mail);
  try {
    await Linking.openURL(gmail); // opens the Gmail app when installed; rejects otherwise
    return;
  } catch {
    // Gmail app not installed (or scheme blocked): use the default mail app
  }
  await Linking.openURL(mailtoUrl(to, mail));
}
