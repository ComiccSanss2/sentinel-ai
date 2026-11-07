# Sentinel-AI

**Self-hosted auditor and emergency stop for AI agents.**

Sentinel-AI checks every action your AI agents take **before** it happens: it lets it through,
blocks it, or holds it until a person approves. You also get pause, cut-off access and an
emergency stop (Kill-Switch) for every agent.

This is a working product, not a mock-up: real accounts with passwords, data stored on disk,
a real API for your agents, Slack/webhook notifications and a tamper-evident audit log.
It has **no dependencies** — all you need is **Node.js 18+**.

---

## 1. Run it on your computer (5 minutes)

### Windows
1. Install **Node.js LTS** from <https://nodejs.org> (Next, Next, Finish).
2. Open the project folder and **double-click `start.bat`** (it opens in Microsoft Edge).
3. Your browser opens <http://localhost:8787>. The first time, you create your
   **company account** and become its administrator.
4. Keep the black window open: that is the server. Press `Ctrl+C` to stop it.

### macOS
1. Install **Node.js LTS**: download the `.pkg` from <https://nodejs.org> and run it
   (or, with Homebrew, `brew install node`).
2. Get the project, in Terminal (Applications → Utilities → Terminal):
   ```sh
   cd ~/Desktop
   git clone https://github.com/ComiccSanss2/sentinel-ai.git
   cd sentinel-ai
   ```
   If macOS offers to install the “command line developer tools”, accept: `git` needs them.
   Without git: on GitHub click **Code → Download ZIP** and double-click the ZIP to extract it.
3. Start it:
   ```sh
   ./start.sh
   ```
   or double-click **`start.command`** in Finder. The first time macOS may block it
   (“unidentified developer”): **right-click → Open → Open**. If you downloaded the ZIP and the
   file does not start, run once: `chmod +x start.sh start.command`
4. Your browser opens <http://localhost:8787>. Keep Terminal open; press `Ctrl+C` to stop.

To update later: `git pull` inside the folder. Your data in `data/` is never touched.

### Where your data lives
The `data/` folder:
- `db.json` — current state (agents, rules, users, approvals)
- `audit.jsonl` — full history; every line is chained to the previous one with SHA-256

**Backup:** copy the `data/` folder (this is safe while the server is running).

> Running locally, it only works on this computer. To use it with colleagues, or with agents that
> run elsewhere, put it online (section 4).

---

## 2. Connect a real agent

Registering an agent in the console does **not** create or run any AI. It creates an identity
and a secret key, waiting for a real program to use it.

1. In the console: **Connect agents → Register the agent**. Copy the `sk_live_…` key
   (it is shown only once).
2. In the agent's code, before every important action (payment, email, booking, export…),
   ask Sentinel first.

**Python** (copy `sdk/sentinel_client.py` next to your agent):
```python
import os
from sentinel_client import Sentinel, Blocked, AgentStopped

sentinel = Sentinel(url="http://localhost:8787", api_key=os.environ["SENTINEL_API_KEY"])

with sentinel.guard(action="payments.transfer",
                    summary="Pay €18,400 to ACME",
                    params={"amount": 18400, "iban": "DE89..."},
                    context={"input": email_text, "input_source": "Supplier email"}) as a:
    bank.transfer(...)        # runs ONLY if Sentinel allows it (or a person approves)
```

**JavaScript / Node** (copy `sdk/sentinel-client.mjs`):
```js
const a = await sentinel.check({ action: 'payments.transfer', summary: 'Pay €18,400 to ACME',
  params: { amount: 18400, iban: 'DE89…' }, context: { input: emailText } });
await bank.transfer(...);
await a.report({ ok: true });
```

**Any other language / n8n / Zapier / Make:** one HTTP request,
`POST /api/v1/check` with the header `Authorization: Bearer sk_live_…`.
Ready-made code is on the *Connect agents* page.

What happens:
| Answer | What the agent does |
|---|---|
| `allow` | performs the action |
| `hold` | waits (the client does this for you) until a person approves or rejects; no answer within 15 min = no |
| `block` | does not perform it (`Blocked` exception) |
| agent paused / cut off / stopped | `AgentStopped` exception: the agent must stop |
| Sentinel unreachable | for safety the action is **not** performed (“fail closed”) |

**Immediate process shutdown (recommended):** on the agent's page → *Connection and settings* →
*Stop endpoint*, enter an address of your agent. Sentinel calls it with a signed message
(`X-Sentinel-Signature`) when you press Pause, Cut off access or Emergency stop. A ready example is in
`examples/example-agent.mjs`.

### Connect Claude (e.g. Claude working on your Roblox game)
No code needed: in the console, **Connect agents** → the **Claude + Roblox Studio** tab (for Claude
Desktop) or **Claude Code (all tools)** generates a ready-to-paste configuration.
Details in [`integrations/README.md`](integrations/README.md).

### Try it without touching real systems
- **Connect agents → Try it now**: sends test actions from your browser.
- Or run the example agent (it does not execute anything real):
  ```
  PowerShell:   $env:SENTINEL_API_KEY="sk_live_..."; node examples/example-agent.mjs
  macOS/Linux:  SENTINEL_API_KEY=sk_live_... node examples/example-agent.mjs
  ```

---

## 3. Team, rules, notifications

- **Settings → Team → Invite someone**: you get an invitation link to send to your colleague
  (valid for 7 days, single use). Roles:
  *Admin* everything · *Analyst* approve, pause, cut off · *Viewer* read only.
- **Rules**: amount limits, allow-lists of IBANs or email domains, a hidden-instructions
  (prompt injection) detector, volume limits, office hours, always-checked actions, automatic pause.
  Each rule can *ask a person*, *block*, *only warn* or *block and pause the agent*.
  Ready-made rule packs are available (e.g. **Add Roblox Studio rules**).
- **Connect agents → Notifications**: Slack incoming webhook (Apps → Incoming Webhooks) or any
  webhook (Teams, PagerDuty, your SIEM).
- **Settings → Audit log → Check now**: verifies that the history has not been altered.

---

## 4. Put it online for your company

You need a server (e.g. a VPS from Hetzner, OVH or DigitalOcean for about €5/month, or a company PC
that is always on) and a domain, e.g. `sentinel.yourcompany.com`.

**With Docker (recommended, automatic HTTPS):**
1. Point the domain to the server's IP (DNS record of type A).
2. Copy the folder to the server; in `docker-compose.yml` and `Caddyfile` replace
   `sentinel.yourcompany.com` with your domain.
3. `docker compose up -d` — Caddy obtains and renews the HTTPS certificate by itself.

**Without Docker:** `HOST=0.0.0.0 PUBLIC_URL=https://your.domain COOKIE_SECURE=1 node server/server.js`
behind a reverse proxy with HTTPS (Caddy, Nginx), started as a service.

Useful variables:
| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 8787 | port |
| `HOST` | 127.0.0.1 | `0.0.0.0` to accept connections from the network |
| `PUBLIC_URL` | http://localhost:8787 | public address (invitation links, notifications) |
| `DATA_DIR` | ./data | where data is stored |
| `COOKIE_SECURE` | — | `1` when serving over HTTPS |
| `APPROVAL_MINUTES` | 15 | maximum time to approve |
| `ALLOW_SIGNUP` | — | `1` to allow more companies to sign up (multi-tenant) |

**Never expose Sentinel to the internet without HTTPS.**

---

## 5. Security and limits — please read

What is included: scrypt password hashing, HttpOnly sessions, CSRF protection, login rate limiting,
API keys stored only as hashes, HMAC-signed stop messages, roles, a hash-chained audit log.

What to know before using it with real money:
- **Sentinel only stops what goes through Sentinel.** If an agent has direct access to the bank and
  “forgets” to ask, Sentinel does not see it. The strong setup is to give bank/API credentials
  **only** to the code that calls Sentinel, and route every action through the client.
- The prompt-injection detector is rule-based: it blocks common tricks, not all of them. Combine it
  with amount limits and IBAN allow-lists.
- JSON file storage: suitable for a single company (dozens of agents, thousands of actions a day).
  Very high volumes need a database.
- No password reset by email: an admin disables the account and sends a new invitation.
- An independent security review (penetration test) is recommended before production use.

---

## Project structure

```
server/server.js     API, accounts, sessions, action checks, emergency stop, notifications
server/policy.js     rules engine and hidden-instructions detector
server/store.js      on-disk storage and hash-chained audit log
public/              website (index.html), sign-in (login.html), console (app.html)
sdk/                 Python and JavaScript clients for agents
examples/            example agent (Node and Python)
integrations/        connect Claude Desktop (MCP, e.g. Roblox Studio) and Claude Code (hook)
start.bat            start on Windows (double-click)
start.command        start on macOS (double-click) · start.sh from Terminal
demo/                static demo without a server (simulated data): open demo/index.html
prototype/           first single-page prototype: open prototype/index.html
Dockerfile, docker-compose.yml, Caddyfile   put it online with HTTPS
```
