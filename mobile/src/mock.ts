// Fixtures used when EXPO_PUBLIC_MOCK=1 so the UI can be developed without the API server
// (and without any Claude calls). Mirrors api/lib/mock.ts.
import { toDateKey } from "./dates";
import type { ParseResult, ReplyEvent, ScannedMessage, Slot } from "./types";

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

const NOTES = "[목 데이터] 개발 모드라 실제 분석은 하지 않았어요.";

export function mockParse(hasImage: boolean, text?: string): ParseResult {
  if (hasImage || /시간표|timetable/i.test(text ?? "")) {
    return {
      events: [
        {
          title: "CS 61B",
          start: `${addDays(1)}T14:00`,
          end: `${addDays(1)}T15:00`,
          all_day: false,
          location: "Wheeler 150",
          description: null,
          recurrence: { freq: "weekly", by_day: ["MO", "WE", "FR"], until: null },
          confidence: 0.9,
          source_excerpt: "CS 61B 월수금 2-3pm Wheeler 150",
        },
        {
          title: "청년부 예배",
          start: `${addDays(3)}T11:00`,
          end: null,
          all_day: false,
          location: "본당",
          description: null,
          recurrence: { freq: "weekly", by_day: ["SU"], until: null },
          confidence: 0.8,
          source_excerpt: "매주 주일 오전 11시 청년부 예배",
        },
      ],
      notes: NOTES,
    };
  }
  return {
    events: [
      {
        title: "팀플 회의",
        start: `${addDays(2)}T19:30`,
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
        start: addDays(9),
        end: null,
        all_day: true,
        location: null,
        description: null,
        recurrence: null,
        confidence: 0.4,
        source_excerpt: "다다음주쯤 엄마 생신",
      },
    ],
    notes: NOTES,
  };
}

export function mockReply(accepted: ReplyEvent[], declined: ReplyEvent[], alternatives: Slot[]): string {
  const yes = accepted.map((e) => `${e.title} (${e.start.replace("T", " ")})`).join(", ");
  const no = declined.map((e) => e.title).join(", ");
  const hasConflict = declined.some((e) => e.conflict);
  const alts = alternatives.slice(0, 3).map((s) => s.start.replace("T", " ")).join(", ");
  return [
    "안녕하세요!",
    yes ? `${yes} 참석할게요. 일정에 넣어 두었습니다.` : "",
    no ? `${no}는 ${hasConflict ? "그 시간에 다른 일정이 있어서" : "아쉽지만"} 이번엔 어려울 것 같아요.` : "",
    no && alts ? `혹시 ${alts} 중에 괜찮은 시간 있으실까요?` : "",
    "감사합니다 :)",
    "",
    "[목 데이터] 개발 모드라 실제 답장은 생성하지 않았어요.",
  ]
    .filter(Boolean)
    .join("\n");
}

// Two inbox messages with events, mirroring the server's /api/gmail/scan fixture.
export function mockGmailMessages(): ScannedMessage[] {
  const today = new Date();
  const thursday = new Date(today);
  thursday.setDate(today.getDate() + (((4 - today.getDay() + 7) % 7) || 7));
  const thu = toDateKey(thursday);
  const korean = "교수님 안녕하세요, 지난번 말씀드린 연구 주제 관련해서 다음 주 수요일 오전 11시 면담 가능하실까요? 30분 정도면 충분할 것 같습니다.";
  const english = "Hey! We're starting a study group for the midterm. First session is Thursday 7pm at Moffitt 4th floor. Bring your notes.";
  return [
    {
      id: "mock-1",
      threadId: "mock-t1",
      subject: "면담 요청",
      from: "김민지",
      fromEmail: "minji@example.com",
      date: new Date(today.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      snippet: korean.slice(0, 80),
      text: korean,
      events: [
        {
          title: "김민지 면담",
          start: `${addDays(2)}T11:00`,
          end: `${addDays(2)}T11:30`,
          all_day: false,
          location: null,
          description: "연구 주제 관련",
          recurrence: null,
          confidence: 0.85,
          source_excerpt: "다음 주 수요일 오전 11시 면담 가능하실까요?",
        },
      ],
      notes: `${NOTES} (Gmail)`,
    },
    {
      id: "mock-2",
      threadId: "mock-t2",
      subject: "Midterm study group",
      from: "Alex Chen",
      fromEmail: "alex@example.com",
      date: new Date(today.getTime() - 26 * 60 * 60 * 1000).toISOString(),
      snippet: english.slice(0, 80),
      text: english,
      events: [
        {
          title: "Midterm study group",
          start: `${thu}T19:00`,
          end: null,
          all_day: false,
          location: "Moffitt 4th floor",
          description: "Bring your notes",
          recurrence: null,
          confidence: 0.8,
          source_excerpt: "Thursday 7pm at Moffitt 4th floor",
        },
      ],
      notes: `${NOTES} (Gmail)`,
    },
  ];
}
