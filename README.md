# NBN Match Making Event — Website

Bilingual (বাংলা / English) single-page website for the NBN Match Making Event, built with **React 19 + Vite 7 + TypeScript + Tailwind CSS 4**, smooth scrolling via Lenis, and client-side routing via wouter.

## Project structure

```
├── public/            static assets (images, favicons, robots.txt, _redirects)
├── src/
│   ├── components/    SiteHeader, LanguageToggle, ErrorBoundary, ui/card
│   ├── hooks/         use-lenis, use-scroll-direction
│   ├── lib/           copy/text data, language context, registration form + service
│   ├── pages/         home, register, not-found
│   ├── App.tsx        routes: / , /register
│   └── index.css      global styles
├── index.html
├── vite.config.ts
└── tsconfig.json
```

## Getting started

```bash
pnpm install        # or: npm install
pnpm dev            # dev server → http://localhost:5173
pnpm build          # production build → dist/
pnpm preview        # preview the production build
pnpm typecheck      # TypeScript check
```

## Registration submissions

The registration form (`/register`) collects entries client-side. To receive real submissions, set one environment variable (see `.env.example`):

```bash
VITE_REGISTRATION_ENDPOINT=https://your-api.example.com/api/registrations
```

The form will `POST` the entries as JSON to that URL. Without it, the form shows a "registration not yet open" notice.

## Event gender capacity

Apply `supabase/migrations/012_gender_capacity.sql` in the Supabase SQL Editor
before deploying the matching app changes. The migration requires existing event
capacities to be zero (unlimited) or non-negative even numbers; it reports any
legacy event codes that need correction before it can be applied. For finite
capacities, half the places are reserved for men and half for women. The database
serializes registrations per event and rejects registrations when the selected
gender's places or the event's total capacity are full.

## Deploying

Build output is a static site in `dist/`.

- **Netlify / Cloudflare Pages**: build command `pnpm build`, publish directory `dist`. The included `public/_redirects` provides the SPA fallback so `/register` works on direct load.
- **Vercel**: add a rewrite so all routes serve `index.html`:

  ```json
  { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
  ```

- **Any host with sub-path** (e.g. GitHub Pages project site): build with `BASE_PATH=/your-repo/ pnpm build`.

## Candidate links (Supabase Edge Functions)

Candidate links (`/v/<token>`) call five Edge Functions: `candidate-open`,
`candidate-profiles`, `candidate-my-requests`, `candidate-send-request` and
`candidate-withdraw-request`. The React app talks to them cross-origin, so the
functions must be **redeployed** after any change in `supabase/functions`:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase functions deploy --project-ref <project-ref>
```

The functions reflect the caller's `Origin` by default (see `.env.example` for
the optional strict allow-list). If a link opens but profile data never loads,
open the browser devtools Network tab: a CORS error on `candidate-open` /
`candidate-profiles` means the deployed function is old and needs the command
above.
