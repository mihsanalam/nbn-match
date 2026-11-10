# NBN Match Making Event — Website

## Description

Bilingual (বাংলা / English) single-page website for the NBN Match Making Event, built with React 19, Vite, TypeScript, and Tailwind CSS. It lets users register for the event and view event details with smooth scrolling and client-side routing.

## Features

- Bilingual support (Bengali + English)
- Smooth scrolling via Lenis
- Client-side routing via wouter
- Registration form
- Mobile-friendly responsive design (Tailwind CSS)
- Type-safe code with TypeScript
- Fast development and builds with Vite

## Tech Stack

- React 19
- Vite
- TypeScript
- Tailwind CSS 4
- Lenis (smooth scroll)
- wouter (routing)

## Getting Started

### Prerequisites
- Node.js installed
- pnpm (or npm)

### Installation

```bash
pnpm install
# or
npm install
### Run Development Server

```bash
pnpm dev
# or
npm run dev
```

Then open: [](http://localhost:5173)<http://localhost:5173>

### Build for Production

```bash
pnpm build
# or
npm run build
```

### Preview Production Build

```bash
pnpm preview
```

## Environment Variables

Create a `.env` file and add:

```bash
VITE_REGISTRATION_ENDPOINT=https://your-api.example.com/api/registrations
```

Without this, the registration form will show a "registration not yet open" notice.

## Deployment

Build output is a static site in the `dist/` folder. You can deploy it on Netlify, Vercel, Cloudflare Pages, or any static hosting service.

## Contribution

Jignesh - https://github.com/jignesh1236

## Extra

- SPA fallback via `public/_redirects` so `/register` works on direct load
- Supabase Edge Functions for candidate links (`/v/<token>`)
- TypeScript type checking available via `pnpm typecheck`
