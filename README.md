# Learnraiser

A basic Vue app for a minutes-based campaign. People submit the time they spent through Google Forms, Google Sheets stores the responses, and this public dashboard shows total minutes, progress, donors, and team totals.

## Run Locally

```sh
npm install
npm run dev
```

## Configure The Campaign

Copy `.env.example` to `.env` and update the values:

```sh
VITE_CAMPAIGN_NAME="Learnraiser"
VITE_CAMPAIGN_GOAL=10000
VITE_CAMPAIGN_END_DATE="2026-06-30"
VITE_GOOGLE_FORM_URL="https://forms.gle/your-form"
VITE_MINUTES_API_URL="https://script.google.com/macros/s/your-script-id/exec"
VITE_GOOGLE_SHEET_CSV_URL=""
VITE_USE_SAMPLE_DATA=false
VITE_REFRESH_SECONDS=30
```

If `VITE_MINUTES_API_URL` and `VITE_GOOGLE_SHEET_CSV_URL` are empty, the dashboard shows no donors yet. Set `VITE_USE_SAMPLE_DATA=true` only when you want local placeholder data.

## Google Form Fields

Your current form only needs these required fields:

- Name: short text
- Minutes: number greater than 0
- Team Page: dropdown

The app expects each donation record to have these fields:

```json
{
  "name": "Ari Cohen",
  "team": "North Team",
  "minutes": 45,
  "message": "",
  "timestamp": "2026-04-28T19:30:00.000Z",
  "showName": true
}
```

The Apps Script maps your form's `Team Page` column into the app's `team` field.

## Google Apps Script Endpoint

This is the recommended way to make donors, teams, and progress update from the Google Form responses.

1. Open the Google Form.
2. Click **Responses**.
3. Click **Link to Sheets** or open the existing response spreadsheet.
4. In the response spreadsheet, go to **Extensions > Apps Script**.
5. Paste the code from `google-apps-script/Code.js`.
6. Click **Deploy > New deployment > Web app**.
7. Use these deployment settings:
   - Execute as: `Me`
   - Who has access: `Anyone`
8. Copy the web app URL into `VITE_MINUTES_API_URL` in `.env`.
9. Restart the local dev server.

The included Apps Script reads rows from `Form Responses 1`. If your response tab has a different name, update this line in the script:

```js
const SHEET_NAME = 'Form Responses 1'
```

The script supports normal JSON and JSONP. The Vue app tries normal JSON first, then uses JSONP for Apps Script if the browser blocks the request because of CORS.

## Auto Updates

The dashboard refreshes the response feed every `VITE_REFRESH_SECONDS` seconds. The default is 30 seconds. Each refresh adds a cache-busting query parameter so newly submitted Google Form responses can appear without reloading the page.

## Published CSV Alternative

You can also publish the response sheet as CSV and put that URL in `VITE_GOOGLE_SHEET_CSV_URL`.

The Apps Script option is usually better because it lets the spreadsheet stay normal while exposing only the fields this dashboard needs.

## Deploy

This app works well on Vercel, Netlify, or Cloudflare Pages.

- Build command: `npm run build`
- Output directory: `dist`

Set the same environment variables in your hosting provider before deploying.
