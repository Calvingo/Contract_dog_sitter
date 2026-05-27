# contract_dog_sitter

Silicon Paws Retreat agreement form with bilingual UI, signature capture, and Gmail email notifications.

`ADMIN_EMAIL` accepts a single address or a comma-separated list to send the notification to multiple recipients.

## Setup

```bash
npm install
cp .env.example .env.local
# Edit .env.local with your Gmail credentials
npm run dev
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GMAIL_USER` | Gmail address used to send emails |
| `GMAIL_APP_PASSWORD` | Google App Password (16 chars) |
| `ADMIN_EMAIL` | Email to receive submission notifications |

## Deploy (Vercel)

1. Push to GitHub `Calvingo/Contract_dog_sitter`
2. Import repo in Vercel
3. Add the three environment variables above
4. Deploy

## Scripts

- `npm run dev` — local development
- `npm run build` — production build
- `npm run start` — run production server
