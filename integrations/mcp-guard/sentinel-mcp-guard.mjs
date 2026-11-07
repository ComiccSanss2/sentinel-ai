#!/usr/bin/env node
/**
 * Sentinel MCP Guard — puts Sentinel-AI between an AI client (Claude Desktop, Claude Code,
 * Cursor…) and any local MCP server (e.g. Roblox Studio). No dependencies, Node 18+.
 *
 * Every "tools/call" the AI makes is first sent to Sentinel:
 *   allow → forwarded to the real server, result reported back to Sentinel
 *   block → the AI gets an error explaining why; the real server never sees the call
 *   hold  → waits up to SENTINEL_HOLD_WAIT seconds for a person to approve in the console;
 *           if still undecided, the AI is told to wait and retry the same call later
 *   agent paused / cut off / stopped → every call is refused
 *   Sentinel unreachable → refused (fail closed) unless SENTINEL_FAIL_OPEN=1
 *
 * Usage in an MCP client config:
 *   "command": "node",
 *   "args": ["/path/to/sentinel-mcp-guard.mjs", "--prefix", "roblox", "--", <real command>, <real args>...],
 *   "env": { "SENTINEL_URL": "http://localhost:8787", "SENTINEL_API_KEY": "sk_live_..." }
 *
 * Options (before "--"):
 *   --prefix NAME   action names become NAME.<tool>   (default: mcp)
 *   --skip LIST     comma list of tool patterns that are NOT checked (read-only tools), * wildcard
 * Env:
 *   SENTINEL_URL, SENTINEL_API_KEY (required), SENTINEL_HOLD_WAIT (seconds, default 45),
 *   SENTINEL_FAIL_OPEN=1 (allow when Sentinel is down — not recommended)
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import readline from 'node:readline';

/* ---------- arguments ---------- */
const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
if (sep < 0 || sep === argv.length - 1) { console.error('[sentinel-guard] usage: sentinel-mcp-guard.mjs [--prefix name] [--skip a,b] -- <command> [args...]'); process.exit(2); }
const opts = argv.slice(0, sep), child = argv.slice(sep + 1);
const opt = (k, d) => { const i = opts.indexOf(k); return i >= 0 ? opts[i + 1] : d; };
const PREFIX = opt('--prefix', process.env.SENTINEL_PREFIX || 'mcp');
const SKIP = (opt('--skip', process.env.SENTINEL_SKIP || '')).split(',').map((s) => s.trim()).filter(Boolean).map((p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'));
const URL = (process.env.SENTINEL_URL || 'http://localhost:8787').replace(/\/$/, '');
const KEY = process.env.SENTINEL_API_KEY || '';
const HOLD_WAIT = Number(process.env.SENTINEL_HOLD_WAIT || 45);
const FAIL_OPEN = process.env.SENTINEL_FAIL_OPEN === '1';
const log = (...a) => console.error('[sentinel-guard]', ...a); // stderr only: stdout is the MCP channel
if (!KEY.startsWith('sk_')) log('WARNING: SENTINEL_API_KEY is missing — every tool call will be refused.');

/* ---------- start the real MCP server ---------- */
const isWinScript = process.platform === 'win32' && /\.(bat|cmd)$/i.test(child[0]);
const proc = spawn(child[0], child.slice(1), { stdio: ['pipe', 'pipe', 'inherit'], shell: isWinScript, env: process.env, windowsHide: true });
proc.on('exit', (code) => { log('real server exited with code', code); process.exit(code ?? 0); });
proc.on('error', (e) => { log('cannot start the real server:', e.message); process.exit(1); });

const toClient = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const toServer = (line) => proc.stdin.write(line + '\n');

/* ---------- Sentinel API ---------- */
async function api(method, path, body, timeoutMs = 10000) {
  const r = await fetch(URL + path, { method, headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.message || 'HTTP ' + r.status); e.code = d.error; throw e; }
  return d;
}

/* ---------- human-readable summaries ---------- */
const first = (s, n = 90) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
function summarize(tool, a = {}) {
  switch (tool) {
    case 'execute_luau': case 'run_code': return `Run Luau code in Roblox Studio: ${first(a.code || a.command || a.source)}`;
    case 'run_script_in_play_mode': return `Run a script in play mode: ${first(a.code || a.script)}`;
    case 'multi_edit': { const files = [].concat(a.edits || a.files || []).map((e) => e.path || e.script || e.target).filter(Boolean); return `Edit ${files.length || ''} script${files.length === 1 ? '' : 's'}${files.length ? ': ' + first(files.join(', '), 80) : ''}`; }
    case 'insert_asset': case 'insert_model': return `Insert an asset from the Creator Store: ${first(a.asset_id || a.assetId || a.query || a.name || '')}`;
    case 'upload_image': return 'Upload an image to Roblox';
    case 'generate_mesh': case 'generate_material': case 'generate_procedural_model': case 'generate_texture': case 'generate_avatar': case 'generate_scene': return `${tool.replace('generate_', 'Generate a ').replace('_', ' ')}: ${first(a.prompt || a.description || '')}`;
    case 'start_stop_play': return `${a.mode === 'stop' ? 'Stop' : 'Start'} a play test`;
    case 'user_keyboard_input': case 'user_mouse_input': case 'character_navigation': return 'Control the player in a play test';
    case 'http_get': return `Download a web page: ${first(a.url)}`;
    default: return `Use the "${tool}" tool`;
  }
}
function params(tool, a = {}) {
  const out = {};
  for (const [k, v] of Object.entries(a || {})) {
    if (typeof v === 'string') out[k] = v.length > 3000 ? v.slice(0, 3000) + `… (${v.length} chars)` : v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else { const s = JSON.stringify(v); out[k] = s.length > 3000 ? s.slice(0, 3000) + '…' : v; }
  }
  return out;
}

/* ---------- held calls: remember them so an identical retry can go through once approved ---------- */
const held = new Map(); // hash(tool+args) -> actionId
const pendingResults = new Map(); // jsonrpc id -> sentinel action id
const hashOf = (tool, a) => createHash('sha256').update(tool + '|' + JSON.stringify(a || {})).digest('hex');

function deny(id, text) { toClient({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `⛔ Sentinel-AI: ${text}` }], isError: true } }); }

async function waitDecision(actionId, seconds) {
  const end = Date.now() + seconds * 1000;
  for (;;) {
    const left = Math.ceil((end - Date.now()) / 1000);
    if (left <= 0) return 'pending';
    const s = await api('GET', `/api/v1/actions/${actionId}/wait?timeout=${Math.min(25, left)}`, null, 35000);
    if (s.status !== 'pending') return s.status;
  }
}

async function handleCall(msg, line) {
  const tool = msg.params && msg.params.name, args = (msg.params && msg.params.arguments) || {};
  if (SKIP.some((re) => re.test(tool))) return toServer(line);
  const h = hashOf(tool, args);
  try {
    // a retry of a call that was held earlier
    if (held.has(h)) {
      const st = (await api('GET', `/api/v1/actions/${held.get(h)}`)).status;
      if (st === 'approved') { held.delete(h); pendingResults.set(msg.id, null); return toServer(line); }
      if (st === 'pending') return deny(msg.id, 'this action is still waiting for a person to approve it in the Sentinel console (Approvals page). Tell the user, wait, then retry the exact same call.');
      held.delete(h);
      return deny(msg.id, `a person did not approve this action (${st}). Do not try to do it another way; ask the user what to do.`);
    }
    const r = await api('POST', '/api/v1/check', { action: `${PREFIX}.${tool}`, summary: summarize(tool, args), params: params(tool, args), context: { input_source: `${PREFIX} tool call via MCP` } });
    if (r.paused) return deny(msg.id, 'this agent is PAUSED by a person in Sentinel. Stop working and tell the user.');
    if (r.decision === 'allow' || r.decision === 'warn') { pendingResults.set(msg.id, r.id); return toServer(line); }
    const why = (r.reasons || []).map((x) => `${x.name} — ${x.detail}`).join('; ');
    if (r.decision === 'block') return deny(msg.id, `this action was blocked by a company rule: ${why}. Do not retry it or try to achieve it another way; explain to the user.`);
    // hold
    log(`waiting for approval: ${summarize(tool, args)}`);
    const st = await waitDecision(r.id, HOLD_WAIT);
    if (st === 'approved') { pendingResults.set(msg.id, r.id); return toServer(line); }
    if (st === 'pending') { held.set(h, r.id); return deny(msg.id, `this action needs a person's approval (${why}). It is waiting in the Sentinel console under Approvals. Tell the user, and retry the exact same call after they approve it.`); }
    return deny(msg.id, `a person did not approve this action (${st}). Do not try to do it another way; ask the user what to do.`);
  } catch (e) {
    if (e.code === 'agent_terminated') return deny(msg.id, 'this agent was STOPPED FOR GOOD with the emergency stop. Do not perform any more actions. Tell the user.');
    if (e.code === 'agent_isolated') return deny(msg.id, 'this agent\'s access has been CUT OFF by an administrator. Stop and tell the user.');
    if (e.code === 'invalid_api_key' || e.code === 'missing_api_key') return deny(msg.id, 'the Sentinel API key is missing or invalid, so actions are refused. Tell the user to check SENTINEL_API_KEY.');
    if (FAIL_OPEN) { log('Sentinel unreachable, FAIL_OPEN is set — forwarding:', e.message); return toServer(line); }
    return deny(msg.id, `Sentinel cannot be reached (${e.message}), so for safety the action was not done. Tell the user to start the Sentinel server.`);
  }
}

/* ---------- client → server ---------- */
readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', (line) => {
  if (!line.trim()) return;
  let msg; try { msg = JSON.parse(line); } catch (e) { return toServer(line); }
  if (msg && msg.method === 'tools/call' && msg.id != null) handleCall(msg, line);
  else toServer(line);
}).on('close', () => { try { proc.stdin.end(); } catch (e) {} });

/* ---------- server → client (report results) ---------- */
readline.createInterface({ input: proc.stdout, crlfDelay: Infinity }).on('line', (line) => {
  process.stdout.write(line + '\n');
  try {
    const m = JSON.parse(line);
    if (m && m.id != null && pendingResults.has(m.id)) {
      const aid = pendingResults.get(m.id); pendingResults.delete(m.id);
      if (aid) {
        const ok = !m.error && !(m.result && m.result.isError);
        const text = m.result && Array.isArray(m.result.content) ? m.result.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n') : '';
        api('POST', `/api/v1/actions/${aid}/result`, { ok, output: text.slice(0, 1500), error: ok ? null : (m.error ? m.error.message : text.slice(0, 300)) }).catch(() => {});
      }
    }
  } catch (e) { /* not JSON: pass through */ }
});
