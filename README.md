# Inbox → Calendar (prototype)

- `api/` — Next.js API. `POST /api/parse` turns text or an image into calendar events with Claude.
- `mobile/` — Expo app. Paste text or pick a screenshot → review → agenda.

## Run

```
cd api && cp .env.example .env   # put ANTHROPIC_API_KEY in .env
npm run dev                       # http://localhost:3000

cd mobile && cp .env.example .env # set EXPO_PUBLIC_API_URL to your PC's LAN IP
npx expo start                    # scan the QR with Expo Go
```
