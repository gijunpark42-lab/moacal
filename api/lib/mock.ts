// Fixed sample results used instead of calling Claude during development.
// Real API calls happen only when PARSE_LIVE=1 (see claude.ts).
import type { ParseResult } from "./schema";

const pad = (n: number) => String(n).padStart(2, "0");

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function mockParse(input: { text?: string; image?: unknown; now: string }): ParseResult {
  const today = input.now.slice(0, 10);
  const looksLikeTimetable = !!input.image || /시간표|timetable/i.test(input.text ?? "");

  if (looksLikeTimetable) {
    return {
      events: [
        {
          title: "CS 61B",
          start: `${addDays(today, 1)}T14:00`,
          end: `${addDays(today, 1)}T15:00`,
          all_day: false,
          location: "Wheeler 150",
          description: null,
          recurrence: { freq: "weekly", by_day: ["MO", "WE", "FR"], until: null },
          confidence: 0.9,
          source_excerpt: "CS 61B 월수금 2-3pm Wheeler 150",
        },
        {
          title: "청년부 예배",
          start: `${addDays(today, 3)}T11:00`,
          end: null,
          all_day: false,
          location: "본당",
          description: null,
          recurrence: { freq: "weekly", by_day: ["SU"], until: null },
          confidence: 0.8,
          source_excerpt: "매주 주일 오전 11시 청년부 예배",
        },
      ],
      notes: "[목 데이터] 개발 모드라 실제 분석은 하지 않았어요.",
    };
  }

  return {
    events: [
      {
        title: "팀플 회의",
        start: `${addDays(today, 2)}T19:30`,
        end: null,
        all_day: false,
        location: "도서관 스터디룸 3",
        description: "발표 자료 나눠오기",
        recurrence: null,
        confidence: 0.85,
        source_excerpt: "목요일 저녁 7시 반 도서관 스터디룸 3에서 보자",
      },
      {
        title: "엄마 생신",
        start: addDays(today, 9),
        end: null,
        all_day: true,
        location: null,
        description: null,
        recurrence: null,
        confidence: 0.4,
        source_excerpt: "다다음주쯤 엄마 생신",
      },
    ],
    notes: "[목 데이터] 개발 모드라 실제 분석은 하지 않았어요.",
  };
}

export function mockReply(accepted: { title: string; start: string }[], declined: { title: string; start: string }[]): string {
  const yes = accepted.map((e) => `${e.title} (${e.start.replace("T", " ")})`).join(", ");
  const no = declined.map((e) => e.title).join(", ");
  return [
    "안녕하세요!",
    yes ? `${yes} 참석할게요. 일정에 넣어 두었습니다.` : "",
    no ? `${no}는 아쉽지만 이번엔 어려울 것 같아요.` : "",
    "감사합니다 :)",
    "",
    "[목 데이터] 개발 모드라 실제 답장은 생성하지 않았어요.",
  ]
    .filter(Boolean)
    .join("\n");
}
