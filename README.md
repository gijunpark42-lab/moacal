# Inbox → Calendar (prototype)

- `api/` — Next.js API. `POST /api/parse` turns text or an image into calendar events. `POST /api/reply` drafts a reply for the accepted/declined events.
- `mobile/` — Expo app. Paste text or pick a screenshot → review → phone calendar + reply draft → agenda.

Claude is called only when the API runs with `PARSE_LIVE=1` (production). Everywhere else both the API and the app use built-in sample data. See `CLAUDE.md` for the project brief.

## Run

```
cd mobile && cp .env.example .env   # EXPO_PUBLIC_MOCK=1: no server, no API calls
npx expo start                      # scan the QR with Expo Go

cd api && cp .env.example .env      # ANTHROPIC_API_KEY only matters in production
npm run dev                         # http://localhost:3000 (mock responses)
```
