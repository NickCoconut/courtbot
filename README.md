# Courtbot

A Playwright-based automation bot that books Calgary tennis courts the moment new slots open up — 30 days in advance.

## The Problem

Calgary's online tennis court booking system ([liveandplay.calgary.ca](https://liveandplay.calgary.ca)) only lets you book up to 30 days out. Popular time slots (evenings) get taken within minutes of opening. Doing this manually every day at the right time is tedious and easy to miss.

## What It Does

1. Logs into the Calgary recreation account
2. Calculates the target date (today + 30 days)
3. Loads availability for all evening slots (5 PM–9 PM) in a single pass
4. Finds the first pair of consecutive available 1-hour slots
5. Books both slots back-to-back into the cart
6. Sends an email notification via [Resend](https://resend.com) to alert the user to complete payment
7. Keeps the browser open so the user can pay through the Moneris payment page

If no consecutive slots are available (already booked or court closed early), it sends a notification email instead of booking.

## Tech Stack

- [Playwright](https://playwright.dev) — browser automation
- [Resend](https://resend.com) — transactional email
- [dotenv](https://github.com/motdotla/dotenv) — environment variable management
- Node.js

## Why Headed Mode

The Moneris payment iframe used by the City of Calgary is cross-origin and PCI-compliant by design — it cannot be automated. The bot handles all the tedious form-filling and stops at the payment step, leaving the browser open for the user to complete payment manually.

## Setup

**1. Clone the repo**
```bash
git clone git@github.com:YOUR_USERNAME/courtbot.git
cd courtbot
```

**2. Install dependencies**
```bash
npm install
npx playwright install chromium
```

**3. Configure environment variables**
```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

| Variable | Description |
|---|---|
| `CALGARY_USERNAME` | Your liveandplay.calgary.ca account email |
| `CALGARY_PASSWORD` | Your liveandplay.calgary.ca account password |
| `RESEND_API_KEY` | API key from [resend.com](https://resend.com) |
| `NOTIFY_EMAIL` | Email address to receive booking notifications |

**4. Run the bot**
```bash
node booker.js
```

The bot will open a Chromium window, book the courts, and send you an email when it's done. Go to the browser and complete the Moneris payment, then close the window.

## Notes

- Bookings are non-refundable per Calgary's policy
- The bot targets **Glenmore Athletic Park — Tennis #6** (Southwest) by default — update the venue/location option values in `booker.js` to change this
- The booking season runs April 15 to October 31
