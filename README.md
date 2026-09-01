# Clark Performance – website

A website for selling sport-specific training programs (football, basketball, tennis,
handball, ice hockey, track & field, combat sports – in-season and off-season, plus
general vertical jump/speed/strength programs, and a beginner strength/explosiveness
program).

Built as a **fully dependency-free Node.js website** (no `npm install` required) — plain
HTML/CSS/JS on the frontend, and a small Node server that only uses built-in modules
(`http`, `fs`, `crypto`). This makes it simple to run and move anywhere.

## Getting started

```bash
node server.js
```

Open <http://localhost:3000> in your browser. The admin panel is at
<http://localhost:3000/admin/login.html>.

Copy `.env.example` to `.env` and fill in your own values (see below) before making the
site public.

```bash
cp .env.example .env
```

## What's already set up

- **Home page, program catalog (with filters), a program detail page, an About Me page, an
  athlete gallery, and a contact form** — all styled to match your logo (black/white/blue,
  Barlow Condensed/Barlow).
- **18 programs** pre-loaded based on what you described: every sport (football,
  basketball, tennis, handball, ice hockey, track & field, combat sports) with its own
  in-season and off-season program, plus general programs (vertical jump/explosiveness,
  speed, strength), and a dedicated beginner strength/explosiveness program.
- **Admin panel** (`/admin`) where you can:
  - edit the image, description and price for every program, and upload the PDF that
    gets delivered on purchase
  - add/remove images and video (link or file) and quotes from athletes you've trained
    (marketing)
  - edit the "About Me" section (image, text, highlights)
  - edit the homepage hero (the big top section): the small label, headline, subtext, and
    the background video (upload your own to replace it, or remove it to go back to the
    default one)
  - view submitted contact form messages
  - view orders
  - change basic settings (contact email, Instagram, tagline)
- **Purchases & payment**: wired up to Stripe Checkout (see below to activate) — this
  automatically supports **Visa/Mastercard/Amex, Apple Pay and Google Pay** with no extra
  setup, because Checkout is hosted on Stripe's own domain (wallet buttons just show up
  automatically on phones/browsers that support them). After a successful purchase, the
  customer lands on an order page showing a download link to the PDF — this link is
  unique per purchase and can't be guessed.
- **Contact form**: always stored locally in `data/contact-submissions.json` and shown in
  the admin panel, with optional email notification via Resend.
- **Mobile-friendly**: tested at phone widths — collapsing nav menu, stacked layout,
  touch-sized buttons, and admin panel all work on a phone browser, not just desktop.
- No app advertising anywhere — everything happens on the website (buy → pay →
  download PDF).

## Enabling payment (Stripe)

The checkout flow is fully coded, but needs your own Stripe keys to actually take
payments:

1. Create an account at [stripe.com](https://dashboard.stripe.com).
2. Get your **Secret key** under *Developers → API keys*, and set it as
   `STRIPE_SECRET_KEY` in `.env`.
3. Set `SITE_URL` in `.env` to the actual address the site runs on once live.
4. (Recommended) Create a webhook endpoint in Stripe pointing to
   `https://yoursite.com/api/stripe/webhook` for the `checkout.session.completed` event,
   and paste the signing secret as `STRIPE_WEBHOOK_SECRET`.
   - Purchases still work without a webhook: the order page checks with Stripe itself
     whether the payment went through. The webhook just makes it more robust.
5. Restart the server.

Prices live on each program (editable in admin) and are set in **NOK**. If you want to
sell in a different currency, that's a small edit in `server.js` (the
`createCheckoutSession` function sets `currency` to `nok`) plus updating the displayed
prices in `public/js/site.js` (`formatPrice`).

### Apple Pay / Google Pay

Nothing to configure — Stripe Checkout shows the Apple Pay or Google Pay button
automatically to visitors whose phone/browser supports it, with no domain verification
needed (that's only required for the separate "Payment Element" approach, which this site
doesn't use). If wallets don't appear for you while testing: they only show up on `https://`
(not on plain `http://` — a real domain has HTTPS by default on most hosts), and only on a
device that actually has Apple Pay / Google Pay set up.

## Admin password

Set `ADMIN_PASSWORD` in `.env` to something you choose. Without this, the server uses a
default password and prints a clear warning in the console on startup — don't leave the
site publicly accessible without having changed this.

## Adding images/PDFs

Everything is done in the admin panel (`/admin`):

- **Program images**: upload under each program. Automatically shown on the home page,
  program catalog and program page.
- **Program PDF**: upload under each program. The PDF is *not* publicly accessible — it's
  only delivered via the unique download link a customer gets after a completed purchase.
- **Athlete images/video**: the "Athletes" tab — add name, sport, quote, and an image
  and/or video (a link or an uploaded file) for each athlete you want to feature.

## Folder structure

```
public/            Frontend (HTML/CSS/JS) — what's shown in the browser
  admin/            Admin login and dashboard
  img/uploads/       Uploaded program/athlete images (public)
  video/uploads/      Uploaded athlete videos (public)
data/               Content and "database" (JSON files)
  programs.json      All programs
  athletes.json       Athlete gallery
  about.json          "About Me" text
  settings.json        Basic settings
  orders.json           Orders (filled automatically by Stripe)
  contact-submissions.json  Submitted contact forms
  uploads/pdfs/          Uploaded program PDFs (NOT publicly accessible)
server.js           The entire backend server
```

Because the content lives in plain JSON files, you can also edit it directly in these
files if you prefer that over the admin panel.

## Next step: MCP / AI design tools (21st.dev, ui-ux-pro-max)

You asked for these to be added later — they aren't something the site itself needs to
run, they're tools *I* (Claude Code) use when you ask for further design or code help on
the project:

- **ui-ux-pro-max**: already installed and active in this Claude Code setup.
- **21st.dev / magic-mcp**: registered, but waiting for you to run `21st login` yourself
  (requires a browser) and set `API_KEY_21ST` as an environment variable before it can be
  used.

These don't affect the `.env` file above or the live site.

## Deployment

The site is a completely normal Node.js app with no dependencies, so it can run anywhere
that supports Node 18+: a VPS, Render, Railway, Fly.io, etc. Set the environment variables
from `.env.example` in your host's environment variable settings, and start with
`node server.js`. Whatever host you pick gives you free HTTPS automatically (required for
real Stripe payments and for Apple Pay to appear) and an option to connect your own
domain.

### Simplest path: Render.com

1. Push this folder to a GitHub repository (private is fine).
2. On [render.com](https://render.com), create a **new Web Service** and connect that repo.
3. Build command: leave empty (or `echo skip`, since there's nothing to install). Start
   command: `node server.js`.
4. Under **Environment**, add the variables from `.env.example`: `SITE_URL` (Render gives
   you a URL like `https://clark-performance.onrender.com` — use that, or your own domain
   once connected), `ADMIN_PASSWORD`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
5. Deploy. Then, if you own a domain, add it under the service's **Custom Domain** setting
   and point your domain's DNS at Render as instructed there.

Railway and Fly.io work the same way (connect the repo, set the same environment
variables, start command `node server.js`).

One thing to know about all of these free/cheap hosting options: `data/` (programs,
orders, uploaded images/PDFs) is stored as plain files next to the app. On most hosts
that's fine as long as you use their **persistent disk / volume** option (so it isn't
wiped on every redeploy) — Render, Railway and Fly.io all offer this.
