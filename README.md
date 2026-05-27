# contract_dog_sitter

Silicon Paws Retreat pet boarding agreement form with signature capture, PDF receipts, Gmail notifications, and admin decision links.

## Setup

```bash
npm install
cp .env.example .env.local
# Edit .env.local
npm run dev
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GMAIL_USER` | Gmail address used to send emails |
| `GMAIL_APP_PASSWORD` | Google App Password (16 chars) |
| `ADMIN_EMAIL` | Comma-separated admin notification emails |
| `APP_SECRET` | Random secret (16+ chars) for signing decision links |
| `NEXT_PUBLIC_APP_URL` | Public site URL, e.g. `https://your-app.vercel.app` |

On Vercel, `VERCEL_URL` is used as fallback if `NEXT_PUBLIC_APP_URL` is not set, but setting `NEXT_PUBLIC_APP_URL` explicitly is recommended.

## Features

- Customer receives a **PDF attachment** with all form data and signature
- Admins receive notification email with **Accept / Reject / Meet & Greet** buttons
- Clicking a button emails the customer automatically (links valid 7 days)

## Deploy (Vercel)

1. Push to GitHub `Calvingo/Contract_dog_sitter`
2. Import repo in Vercel
3. Add all environment variables above
4. Deploy

## Scripts

- `npm run dev` — local development
- `npm run build` — production build
- `npm run start` — run production server
