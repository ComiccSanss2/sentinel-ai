# SENTINEL-AI — website + console (demo)

No installation needed. Everything runs in your browser; all data is fictional.

## How to launch
1. Open this folder (Desktop\B2B\sentinel-site).
2. Double-click **index.html** -> the public website opens.
3. Click **Open the live demo** (or double-click **app.html**) -> the console opens with a guided tour.

Optional, if you prefer a local web address:
    python -m http.server 8080
then visit http://localhost:8080

Internet is only used to load the fonts; without it, system fonts are used.
Your changes (stopped agents, rules, decisions) are saved in this browser.
To start over: Settings -> Reset demo.

## Folder structure
    index.html              Public website (what the product is, how it works)
    app.html                The console (single-page app with these pages):
                              Overview, Agents, Agent detail, Activity, Approvals,
                              Incidents, Rules, Connected apps, Settings, Help
    css/app.css             Design tokens (dark + light) and console styles
    css/landing.css         Website styles
    js/data.js              Demo company: agents, rules, apps, team, glossary
    js/engine.js            Live simulation, saving, and all actions (pause, stop...)
    js/ui.js                Shared components: badges, gauge, charts, toasts, modals
    js/pages/*.js           One file per console page
    js/tour.js              First-time guided tour
    js/app.js               Menu, top bar, router, search, notifications, shortcuts
    assets/favicon.svg      Icon
