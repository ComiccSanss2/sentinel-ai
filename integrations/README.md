# Connect Claude to Sentinel-AI

Two ways, depending on how you use Claude. In both cases **Sentinel must be running**
(`start.bat` / `./start.sh`) and Claude must run **on the same computer** (or Sentinel must be
online — see the main README).

## A. Claude Desktop + Roblox Studio (MCP Guard)

`mcp-guard/sentinel-mcp-guard.mjs` sits between Claude and the Roblox Studio MCP server.
Every command that changes your game goes through Sentinel first; read-only commands do not.

1. Sentinel console → **Connect agents** → register an agent (e.g. `claude-roblox`), copy the key.
2. On the same page, **Claude + Roblox Studio** tab: copy the ready-made configuration
   (key and paths included).
3. Claude Desktop → Settings → Developer → **Edit Config** → replace the `Roblox_Studio` entry with
   the copied one → quit Claude completely and reopen it.
4. Console → **Rules** → **Add Roblox Studio rules** (Luau code, Creator Store assets and uploads
   wait for your approval).

If *Quick connect* is turned on for Claude in Roblox Studio, Studio may rewrite the entry and open a
second connection that bypasses the guard: turn it off (Assistant → Manage MCP Servers → Quick
connect) and keep the manual configuration.

What Claude sees when an action is waiting: a message telling it to let you know and to retry the
same action after you approve it. Once approved, the retry goes through.

The guard works with **any local (stdio) MCP server**, not only Roblox Studio — wrap the server's
command the same way:
```json
"command": "node",
"args": ["/path/to/sentinel-mcp-guard.mjs", "--prefix", "myapp", "--skip", "list_*,get_*", "--", "<server command>", "<args>"],
"env": { "SENTINEL_URL": "http://localhost:8787", "SENTINEL_API_KEY": "sk_live_..." }
```
Actions then appear in Sentinel as `myapp.<tool>`, and rules can target them (e.g. `myapp.send_*`).

## B. Claude Code (all tools)

`claude-code/sentinel-hook.mjs` is a *PreToolUse hook*: Claude Code runs it before every selected tool
(Roblox Studio, terminal, file writes, MCP connectors) and obeys its answer. The ready-made
configuration is in Connect agents → **Claude Code (all tools)** tab; paste it into
`~/.claude/settings.json`.

## Limits
- Sentinel only checks what goes through the guard or the hook. If an app is also connected to
  Claude another way (e.g. Quick connect, or a remote connector added in claude.ai), those calls are
  not checked.
- If Sentinel is off, actions are refused for safety (set `SENTINEL_FAIL_OPEN=1` to change this).
