# Inbox → Calendar (가칭: 일정비서)

이 파일은 이 프로젝트가 **무엇을, 왜, 어떻게** 만드는지 적어둔 것이다. 새 세션에서 Claude Code를 열면 이 파일부터 읽고 이어서 작업한다.

## 한 줄 요약

이메일 · 카카오톡 · 스크린샷을 던지면 AI가 일정을 찾아내고, 사용자가 수락/거절만 하면 캘린더에 들어가고 답장 초안까지 써주는 앱. (전송 버튼은 항상 사용자가 직접 누른다.)

핵심 루프: **입력(텍스트/이미지) → AI 추출 → 검토(체크박스) → 저장/캘린더 반영 → (예정) 답장 초안**

## 누구를 위한 앱인가

첫 베타 대상 두 그룹:

1. **한국 대학생** — 에브리타임 시간표 캡처, 단톡방 약속, 학교 공지 메일
2. **한인 교회 어머니들** — 주보 사진, 카톡 공지. 나이 있는 사용자라 **큰 글씨, 단순한 화면, 안드로이드 위주**

그래서 앱은 **가볍고 빨리 떠야 한다.** 무거운 라이브러리, 복잡한 네비게이션, 화려한 UI는 넣지 않는다.

## 현재 상태 (2026-09-09 기준)

첫 커밋 2026-09-08. 동작하는 프로토타입 단계.

- `api/` — Next.js 16 API. `POST /api/parse`가 텍스트 또는 base64 이미지를 받아 Claude structured output(zod 스키마)으로 이벤트 배열을 돌려준다.
  - `lib/schema.ts`: 이벤트 스키마 (title, start, end, all_day, location, description, recurrence, confidence, source_excerpt)
  - `lib/parse.ts`: 시스템 프롬프트 + Anthropic SDK 호출. 한국어 날짜/시간 표현(오전/오후/밤/새벽, "다음 주 목요일"), 시간표, 주보, 채팅 규칙이 프롬프트에 들어있다.
  - `app/api/parse/route.ts`: 입력 검증, 선택적 `x-app-key` 인증, 에러 매핑
- `mobile/` — Expo SDK 57, TypeScript, 네비게이션 라이브러리 없음(`App.tsx` 안에서 `screen` state로 화면 전환).
  - 화면 3개: **Home**(아젠다 목록) → **Add**(텍스트 붙여넣기 / 스크린샷 선택) → **Review**(추출된 일정 체크 후 확정)
  - 저장은 기기 로컬 AsyncStorage(`src/storage.ts`)만. 서버 DB 없음, 로그인 없음.
  - `src/dates.ts`: 반복 일정을 날짜별 행으로 펼치고 "오늘 · 9월 9일 (수)" 식으로 포맷.

2026-09-09 추가된 것:
- **목 모드** — `api/lib/mock.ts`, `mobile/src/mock.ts`. Claude는 서버에 `PARSE_LIVE=1`이 있을 때만 호출된다. 앱은 `EXPO_PUBLIC_MOCK=1`이면 서버 없이 샘플 데이터로 돈다.
- **답장 초안** — `POST /api/reply` (`api/lib/reply.ts`). 앱의 Reply 화면에서 "답장 초안 만들기" 버튼을 눌러야만 생성되고, 공유 시트(카톡·문자)로 넘긴다. 전송은 사용자가.
- **폰 캘린더 쓰기** — `mobile/src/calendar.ts` (expo-calendar). 확정한 일정을 기기 캘린더에 넣고, 앱에서 지우면 캘린더에서도 지운다. 종료일 모르는 반복 일정은 16주.
- **설정 화면** — 큰 글씨(1.3배), 폰 캘린더 연동 켜기/끄기. `mobile/src/settings.ts`.
- 화면 구성: Home → Add → Review → **Reply** → Home, 그리고 Settings.

**아직 없는 것**: 안드로이드 공유 시트로 받기(share intent, dev build 필요), 카톡 봇, 사용자 계정, 결제, 배포.

## 정해진 설계 결정

- **개발 중에는 Anthropic API를 절대 호출하지 않는다.** API는 실제 사용자가 쓸 때만. 서버는 `PARSE_LIVE=1`이 명시된 환경(프로덕션)에서만 Claude를 부르고, 그 외에는 `lib/mock.ts` 샘플을 돌려준다. 로컬 `.env`에는 `PARSE_LIVE`를 비워 둔다. 테스트·데모·스크린샷 전부 목 모드로 한다.

- **시간은 타임존 없는 로컬 시각 문자열**로 다룬다. `"2026-09-15T15:00"` 또는 종일이면 `"2026-09-15"`. 폰이 자기 타임존으로 해석한다. 서버에 `now`와 `timeZone`을 같이 보내서 "내일", "다음 주" 같은 상대 날짜를 푼다.
- **confidence < 0.5인 일정은 Review 화면에서 기본 체크 해제.** 모델이 추측한 건 사용자가 직접 켜야 들어간다.
- **모델**: 프로토타입은 `claude-opus-5` (`PARSE_MODEL` env로 교체 가능). 프로덕션 계획은 싼 분류기(gpt-5-nano / Gemini Flash-Lite 급)로 "일정 있음/없음" 먼저 거르고, Sonnet 5로 추출.
- **의존성 최소.** 새 패키지를 추가하려면 먼저 이유를 말하고 확인받는다.
- UI 문자열은 한국어. 코드 주석/변수명은 영어.
- 제품 먼저, 사업·법무는 나중에.

## 사업 쪽 제약 (코드 짤 때도 기억할 것)

- 개발자는 **F-1 비자(UC Berkeley)** → 미국 내 사업 운영 불가. 계획은 **어머니 명의 한국 개인사업자**, 개발자는 무급 개발자. 미국 수익화는 OPT 이후.
  - 따라서 결제/구독/회사 설정을 건드리는 작업은 반드시 이 제약을 먼저 확인.
- **if(kakao)26 (2026-10-13~14)** 에서 카나나 캘린더 기능 발표를 보고 나서 카톡 봇에 투자할지 결정. 그 전엔 카톡 연동에 힘 쓰지 않는다.
- 사업계획서(26장): `InboxToCalendar_사업계획서.pptx` / `.pdf`. 원래 `fall2026-schedule` 폴더에 있었음. 이 저장소로 옮기면 `docs/` 아래에 둘 것.

## 다음 할 일 (후보 — 우선순위는 사용자가 정한다)

세부 로드맵은 아직 확정되지 않았다. 지금까지 나온 자연스러운 다음 단계:

1. **폰에서 직접 돌려보기** — Expo Go로 Home→Add→Review→Reply 흐름, 캘린더 권한, 큰 글씨 모드 확인 (목 모드로)
2. **안드로이드 공유 시트 연동** — 카톡/메일에서 "공유 → 일정비서"로 바로 보내기 (Expo Go 불가, dev build 필요)
3. **API 배포** — Vercel에 올리고 `PARSE_LIVE=1`, `APP_KEY` 설정. 이때부터만 실제 Claude 호출
4. **실제 입력으로 정확도 테스트** — 배포 후 베타 사용자의 실제 캡처로. 개발자가 로컬에서 API를 돌려보는 건 금지
5. **프로덕션 모델 구성** — 싼 분류기 + Sonnet 5 추출로 교체

완료: 목 모드, 기기 캘린더 쓰기, 답장 초안, 큰 글씨 모드 (2026-09-09)

## 배포 (2026-09-09)

- API: Vercel 프로젝트 `inbox-calendar-api` (팀 gijun42), Root Directory `api`. 프로덕션 URL **https://inbox-calendar-api.vercel.app**
- 프로덕션 환경변수: `ANTHROPIC_API_KEY`, `PARSE_LIVE=1`, `APP_KEY`, `PARSE_MODEL=claude-sonnet-5`. 여기서만 실제 Claude가 호출된다.
- 재배포: `cd api && vercel --prod`. 환경변수 변경: `vercel env add NAME production`.
- 폰 앱은 `mobile/.env`(gitignore됨)에 위 URL과 `APP_KEY`가 들어 있다. `EXPO_PUBLIC_MOCK=1`로 바꾸면 개발 모드.
- GitHub: https://github.com/gijunpark42-lab/inbox-calendar (private)

## 실행 방법

```
# 앱만 볼 때 (서버 불필요, API 호출 없음)
cd mobile
cp .env.example .env       # EXPO_PUBLIC_MOCK=1 이 기본
npx expo start             # Expo Go로 QR 스캔

# 서버까지 같이 볼 때 (여전히 API 호출 없음 — PARSE_LIVE 비워둠)
cd api
npm run dev                # http://localhost:3000, 응답은 lib/mock.ts 샘플
# mobile/.env 에서 EXPO_PUBLIC_MOCK= 비우고 EXPO_PUBLIC_API_URL 을 PC의 LAN IP로

# 타입체크
cd api && npx tsc --noEmit -p .
cd mobile && npx tsc --noEmit -p .
```

## Claude Code 작업 규칙

- 이 파일을 먼저 읽는다. 위 결정 사항과 어긋나는 제안은 이유를 밝히고 확인받는다.
- 작게, 딱 요청받은 만큼만 바꾼다. 요청 안 한 리팩토링·기능 추가 금지.
- **`.env`에만 키를 둔다. `.env.example`에 진짜 키를 쓰지 않는다.**
- **`PARSE_LIVE=1`을 로컬에서 켜지 않는다.** 확인용이라도 안 된다. API 호출은 사용자 몫.
- 결정이 바뀌면 이 파일의 해당 섹션을 같이 고친다.
