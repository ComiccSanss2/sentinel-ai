#!/usr/bin/env node
/**
 * Sentinel-AI hook for Claude Code (PreToolUse). No dependencies, Node 18+.
 * Claude Code runs it before every matching tool call and obeys its answer.
 *
 * In ~/.claude/settings.json (all projects) or .claude/settings.json (one project):
 * {
 *   "env": { "SENTINEL_URL": "http://localhost:8787", "SENTINEL_API_KEY": "sk_live_..." },
 *   "hooks": { "PreToolUse": [ { "matcher": "mcp__Roblox_Studio__.*|Bash|Write|Edit",
 *       "hooks": [ { "type": "command", "command": "node /path/to/sentinel-hook.mjs", "timeout": 600 } ] } ] }
 * }
 *
 * allow → Claude continues normally · block → the tool call is denied with the reason
 * hold  → waits (up to SENTINEL_HOLD_WAIT s, default 540) for a person to approve in the console
 * Sentinel unreachable → denied (fail closed) unless SENTINEL_FAIL_OPEN=1
 */
const URL = (process.env.SENTINEL_URL || 'http://localhost:8787').replace(/\/$/, '');
const KEY = process.env.SENTINEL_API_KEY || '';
const HOLD_WAIT = Number(process.env.SENTINEL_HOLD_WAIT || 540);

const out = (decision, reason) => { process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason } })); process.exit(0); };
const deny = (reason) => out('deny', 'Sentinel-AI: ' + reason);

async function api(method, path, body, timeoutMs = 10000) {
  const r = await fetch(URL + path, { method, headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.message || 'HTTP ' + r.status); e.code = d.error; throw e; }
  return d;
}
const clip = (v, n = 3000) => (typeof v === 'string' && v.length > n ? v.slice(0, n) + `… (${v.length} chars)` : v);
function describe(tool, a) {
  const m = tool.match(/^mcp__(.+?)__(.+)$/);
  const server = m ? m[1].toLowerCase().replace(/[^a-z0-9]+/g, '_') : 'claude';
  const name = m ? m[2] : tool;
  const ns = /roblox/.test(server) ? 'roblox' : m ? server : 'claude';
  const first = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 90);
  const summary = {
    Bash: `Run a terminal command: ${first(a.command)}`, Write: `Write the file ${a.file_path}`, Edit: `Edit the file ${a.file_path}`,
    execute_luau: `Run Luau code in Roblox Studio: ${first(a.code)}`, multi_edit: 'Edit scripts in Roblox Studio', insert_asset: `Insert an asset from the Creator Store: ${first(a.asset_id || a.query)}`,
    upload_image: 'Upload an image to Roblox', http_get: `Download a web page: ${first(a.url)}`,
  }[name] || `Use the "${name}" tool`;
  return { action: `${ns}.${name}`, summary };
}

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', async () => {
  let ev; try { ev = JSON.parse(raw); } catch (e) { deny('could not read the tool call.'); }
  const a = ev.tool_input || {};
  const params = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, typeof v === 'object' ? clip(JSON.stringify(v)) : clip(v)]));
  const { action, summary } = describe(ev.tool_name, a);
  try {
    const r = await api('POST', '/api/v1/check', { action, summary, params, context: { input_source: `Claude Code session ${String(ev.session_id || '').slice(0, 8)} in ${ev.cwd || ''}` } });
    if (r.paused) deny('this agent is PAUSED in Sentinel. Stop and tell the user.');
    const why = (r.reasons || []).map((x) => `${x.name} — ${x.detail}`).join('; ');
    if (r.decision === 'allow' || r.decision === 'warn') process.exit(0); // no opinion: normal Claude Code permissions apply
    if (r.decision === 'block') deny(`blocked by a company rule: ${why}. Do not retry or work around it; explain to the user.`);
    process.stderr.write(`Sentinel: waiting for a person to approve "${summary}"…\n`);
    const end = Date.now() + HOLD_WAIT * 1000;
    while (Date.now() < end) {
      const s = await api('GET', `/api/v1/actions/${r.id}/wait?timeout=25`, null, 35000);
      if (s.status === 'approved') process.exit(0);
      if (s.status !== 'pending') deny(`a person did not approve this action (${s.status}). Ask the user what to do.`);
    }
    deny(`still waiting for approval in the Sentinel console (${why}). Tell the user, then retry after they approve.`);
  } catch (e) {
    if (e.code === 'agent_terminated') deny('this agent was STOPPED FOR GOOD with the emergency stop. Do not perform any more actions.');
    if (e.code === 'agent_isolated') deny('this agent\'s access was CUT OFF by an administrator. Stop and tell the user.');
    if (process.env.SENTINEL_FAIL_OPEN === '1') process.exit(0);
    deny(`Sentinel cannot be reached (${e.message}), so for safety the action was refused. Start the Sentinel server.`);
  }
});
