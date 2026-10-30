# BBT

A small phone web app for logging basal body temperature each morning and spotting the patterns in it: thermal shifts (ovulation ≈ the day before), drops back to the low phase, and unusually large day-to-day changes. Readings are stored in **your own Google Sheet**. This repository contains only the app's code, never anyone's data.

## What it does

- Log a reading in a few taps; the date and time fill in automatically.
- Chart with a 3-day trend line, high phases shaded, coverline, and markers for shifts, drops and unusual changes.
- Calendar with past phases and predicted next shift and drop.
- Cycle history table: length, shift day, high-phase length, temperature rise.
- Mark a reading as "off" (late wake-up, bad night) to leave it out of the analysis.
- Optional correction for readings taken an hour or more off your usual wake time.

Shifts are detected with the standard 3-over-6 rule plus the usual exceptions (one spike in the baseline ignored, gaps in readings allowed, a 4th reading to confirm a slow rise). Drops are counted when temperatures fall back to the coverline, or well below the high phase's own average, for more than one reading.

## Setup (about 15 minutes)

### 1. Google Sheet and Apps Script

1. Create a Google Sheet with headers in row 1: `Timestamp`, `BBT`, `Notes`. Existing data in that layout works as is.
2. Open **Extensions → Apps Script**, replace the contents of `Code.gs` with the [`Code.gs`](Code.gs) from this repository, and save.
3. Click the gear icon (**Project Settings**) → **Script properties** → **Add script property**. Name it `TOKEN` and set its value to a long passphrase only you know.
4. Click **Deploy → New deployment**, choose **Web app**, set **Execute as: Me** and **Who has access: Anyone**, then deploy and authorize. Copy the URL that ends in `/exec`.

"Anyone" means anyone can *reach* the script. It answers only requests that carry your token.

### 2. Host the page on GitHub Pages

1. Fork this repository, or create a new one and upload these files.
2. Go to **Settings → Pages**, set **Source** to *Deploy from a branch*, choose `main` and `/ (root)`, and save.
3. A minute later the app is live at `https://<your-username>.github.io/<repo-name>/`.

### 3. On your phone

1. Open the page in Safari (iPhone) or Chrome (Android).
2. Tap ⚙︎ and enter the `/exec` URL and your token. They are stored only on that phone.
3. Use **Share → Add to Home Screen** to install it as an app.

### Optional: open it automatically every morning (iPhone)

Shortcuts → **Automation** → **+** → **Alarm** → **Is Stopped** → **Run Immediately** → add **Open URLs** with your app's address. Shortcuts opens the page in Safari, which keeps storage separate from the home-screen app, so enter your URL and token there once as well.

## Privacy

- No temperatures, Sheet URL or token are stored in this repository.
- Your readings live in your Google Sheet; your settings live in your phone's browser storage.
- The page is marked `noindex` so search engines won't list it.
- The only other outside request is for the chart library (Chart.js, from the jsDelivr CDN). To avoid it, download `https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js` into the repository and change the `<script src=…>` line in `index.html` to `chart.umd.min.js`.

This is a personal tracking tool, not a medical device or a method of contraception.
