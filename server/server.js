'use strict';
/*
 * Sentinel-AI server — no external dependencies (Node.js 18+).
 *
 *   Console API  (cookie session):  /api/...
 *   Agent API    (Bearer API key):  /api/v1/...
 *   Live updates (Server-Sent Events): /api/stream
 *   Static files: ../public
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Store, sha256 } = require('./store');
const { evaluate, defaultPolicies, RULE_TYPES, matches } = require('./policy');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const PUBLIC_DIR = path.resolve(path.join(__dirname, '..', 'public'));
const SDK_DIR = path.resolve(path.join(__dirname, '..', 'sdk'));
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';
const APPROVAL_MINUTES = Number(process.env.APPROVAL_MINUTES || 15);

const db = new Store(DATA_DIR);
const D = db.data;
const now = () => Date.now();

/* ============================ helpers ============================ */
const ROLES = { admin: 3, analyst: 2, viewer: 1 };
class HttpError extends Error { constructor(status, code, message) { super(message || code); this.status = status; this.code = code; } }
const fail = (s, c, m) => { throw new HttpError(s, c, m); };
const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40);
const fmtEur = (n) => '€' + Math.round(n).toLocaleString('en-US');
const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));

function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  const h = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$${salt}$${h}`;
}
function checkPassword(pw, stored) {
  const [, salt, h] = String(stored).split('$');
  if (!salt || !h) return false;
  const a = Buffer.from(hashPassword(pw, salt).split('$')[2], 'hex'), b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const token = (n = 32) => crypto.randomBytes(n).toString('base64url');

function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new HttpError(413, 'too_large', 'Request body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(new HttpError(400, 'bad_json', 'Body must be valid JSON')); }
    });
    req.on('error', reject);
  });
}
function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(data);
}
function cookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function isHttps(req) { return COOKIE_SECURE || req.headers['x-forwarded-proto'] === 'https'; }
function sessionCookie(req, value, maxAge) {
  return `sid=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
}
function clientIp(req) { return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress; }

/* simple in-memory rate limiter */
const buckets = new Map();
function limit(key, max, windowMs) {
  const t = now(); const b = buckets.get(key) || { n: 0, reset: t + windowMs };
  if (t > b.reset) { b.n = 0; b.reset = t + windowMs; }
  b.n++; buckets.set(key, b);
  if (b.n > max) fail(429, 'rate_limited', 'Too many attempts. Wait a few minutes and try again.');
}

/* ============================ auth ============================ */
function currentUser(req) {
  const sid = cookies(req).sid; if (!sid) return null;
  const s = D.sessions.find((x) => x.hash === sha256(sid) && x.expires > now());
  if (!s) return null;
  const u = D.users.find((x) => x.id === s.userId && !x.disabled);
  return u ? { user: u, session: s } : null;
}
function requireUser(req, minRole = 'viewer') {
  const cu = currentUser(req);
  if (!cu) fail(401, 'not_signed_in', 'Please sign in.');
  if (ROLES[cu.user.role] < ROLES[minRole]) fail(403, 'forbidden', `This needs the ${minRole} role. Ask an admin.`);
  return cu.user;
}
function startSession(req, res, user) {
  const t = token();
  D.sessions.push({ hash: sha256(t), userId: user.id, created: now(), expires: now() + 7 * 86400e3, ip: clientIp(req) });
  user.lastLogin = now();
  db.save();
  res.setHeader('Set-Cookie', sessionCookie(req, t, 7 * 86400));
}
function publicUser(u) { return { id: u.id, name: u.name, email: u.email, role: u.role, created: u.created, lastLogin: u.lastLogin || null }; }

function agentFromKey(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(sk_[A-Za-z0-9_-]+)$/);
  if (!m) fail(401, 'missing_api_key', 'Send the agent API key as: Authorization: Bearer sk_...');
  const a = D.agents.find((x) => x.keyHash === sha256(m[1]));
  if (!a) fail(401, 'invalid_api_key', 'This API key is not valid (it may have been rotated or the agent deleted).');
  return a;
}

/* ============================ live stream (SSE) ============================ */
const streams = new Map(); // orgId -> Set(res)
function broadcast(orgId, type, data) {
  const set = streams.get(orgId); if (!set) return;
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const r of set) { try { r.write(msg); } catch (e) {} }
}
setInterval(() => { for (const set of streams.values()) for (const r of set) { try { r.write(': ping\n\n'); } catch (e) {} } }, 25000);

/* ============================ notifications ============================ */
async function post(url, body, headers = {}) {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(6000) });
    return { ok: r.ok, status: r.status };
  } catch (e) { return { ok: false, error: e.message }; }
}
function integ(orgId) { return (D.integrations[orgId] = D.integrations[orgId] || { slack_webhook: '', webhook_url: '', notify_on: { block: true, hold: true, kill: true, incident: true } }); }
async function notify(orgId, kind, text, data) {
  const cfg = integ(orgId);
  if (cfg.notify_on && cfg.notify_on[kind] === false) return;
  const results = {};
  if (cfg.slack_webhook) results.slack = await post(cfg.slack_webhook, { text: `:shield: *Sentinel-AI* — ${text}` });
  if (cfg.webhook_url) results.webhook = await post(cfg.webhook_url, { source: 'sentinel-ai', kind, text, data, ts: new Date().toISOString() });
  cfg.lastDelivery = { at: now(), kind, results }; db.save();
}
async function agentWebhook(agent, event, extra = {}) {
  if (!agent.controlUrl) return null;
  const body = JSON.stringify({ event, agent: agent.name, ts: new Date().toISOString(), ...extra });
  const sig = crypto.createHmac('sha256', agent.webhookSecret).update(body).digest('hex');
  try {
    const r = await fetch(agent.controlUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sentinel-Signature': 'sha256=' + sig }, body, signal: AbortSignal.timeout(5000) });
    return { ok: r.ok, status: r.status };
  } catch (e) { return { ok: false, error: e.message }; }
}

/* ============================ derived data ============================ */
const W = { block: 14, hold: 7, warn: 4 };
function riskAt(agent, t) {
  let s = 4;
  for (let i = D.events.length - 1; i >= 0; i--) {
    const e = D.events[i];
    if (e.t > t) continue;
    if (t - e.t > 6 * 3600e3) break;
    if (e.agentId !== agent.id) continue;
    const w = (W[e.sev] || 0) + (e.injection ? 16 : 0);
    if (w) s += w * Math.pow(0.5, (t - e.t) / (30 * 60e3));
  }
  return Math.round(Math.min(97, s));
}
function agentView(a) {
  const t = now(), risk = riskAt(a, t);
  let status = a.status;
  if (!['paused', 'isolated', 'terminated'].includes(status)) status = risk > 60 ? 'intercepted' : risk > 40 ? 'suspicious' : 'active';
  return {
    id: a.name, uid: a.id, d: slug(a.team) || 'general', team: a.team || 'General', model: a.model || '', owner: a.owner || '', does: a.description || '',
    apis: a.tools || [], perms: a.permissions || [], status, risk,
    hist: Array.from({ length: 24 }, (_, i) => riskAt(a, t - (23 - i) * 5 * 60e3)),
    ts: a.lastSeen || a.created, last: a.lastAction || 'No actions yet', keyPrefix: a.keyPrefix, controlUrl: a.controlUrl || '',
    killedAt: a.killedAt || null, killReason: a.killReason || null, created: a.created, connected: !!a.lastSeen,
  };
}
const orgAgents = (orgId) => D.agents.filter((a) => a.orgId === orgId && !a.deleted);
function pushAgents(orgId) { broadcast(orgId, 'agents', orgAgents(orgId).map(agentView)); }
function approvalView(p) { return { id: p.id, agent: p.agentName, plain: p.plain, tech: p.tech, policy: p.policy, reasons: p.reasons, amount: p.amount, created: p.created, expires: p.expires, status: p.status, by: p.by || null, at: p.at || null, actionId: p.actionId }; }
function counters(orgId) {
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const ev = D.events.filter((e) => e.orgId === orgId && e.t >= since.getTime());
  return {
    stopped: ev.filter((e) => e.sev === 'block').length,
    held: ev.filter((e) => e.sev === 'hold').length,
    injections: ev.filter((e) => e.injection).length,
    eur: ev.filter((e) => e.sev === 'block' || e.sev === 'hold').reduce((s, e) => s + (e.amount || 0), 0),
    actions: ev.filter((e) => e.kind === 'action').length,
  };
}
function eventView(e) { return { id: e.id, t: e.t, agent: e.agentName, team: e.team, sev: e.sev, plain: e.plain, tech: e.tech, policy: e.policy || null, amount: e.amount || 0, approval: e.approval || null, actionId: e.actionId || null, injection: !!e.injection, kind: e.kind }; }

function addEvent(orgId, agent, ev) {
  const e = { id: db.id('ev'), orgId, t: now(), agentId: agent ? agent.id : null, agentName: agent ? agent.name : 'system', team: agent ? slug(agent.team) || 'general' : '', ...ev };
  D.events.push(e);
  db.audit(orgId, 'event', { id: e.id, agent: e.agentName, sev: e.sev, plain: e.plain, tech: e.tech, policy: e.policy || null });
  db.save();
  broadcast(orgId, 'event', eventView(e));
  return e;
}
function audit(orgId, user, what, data = {}) { return db.audit(orgId, 'admin', { by: user ? user.email : 'system', what, ...data }); }

/* ============================ agent API logic ============================ */
function techLine(action, params) {
  let p = '';
  try { p = Object.entries(params || {}).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', '); } catch (e) {}
  return clip(`${action}(${p})`, 300);
}
const waiters = new Map(); // actionId -> Set(fn)
function settle(action) { const set = waiters.get(action.id); if (set) { for (const fn of set) fn(); waiters.delete(action.id); } }
function actionStatus(a) { return { id: a.id, status: a.status, decision: a.decision, reasons: a.reasons, decided_by: a.decidedBy || null, approval_id: a.approvalId || null }; }

function checkAction(agent, body) {
  if (!body || typeof body.action !== 'string' || !body.action.trim()) fail(400, 'missing_action', 'Send at least { "action": "name.of.tool" }');
  const orgId = agent.orgId;
  agent.lastSeen = now();
  if (agent.status === 'terminated') fail(403, 'agent_terminated', 'This agent was stopped for good with the emergency stop. It must not run again.');
  if (agent.status === 'isolated') fail(403, 'agent_isolated', 'This agent\'s access has been cut off by an administrator.');

  const req = { action: body.action.trim().slice(0, 120), params: body.params || {}, summary: body.summary ? clip(body.summary, 200) : '', context: body.context || {} };
  const act = { id: db.id('act'), orgId, agentId: agent.id, t: now(), action: req.action, params: req.params, summary: req.summary, context: { input: clip(req.context.input || '', 4000), input_source: clip(req.context.input_source || '', 200), reasoning: clip(req.context.reasoning || '', 4000), sources: req.context.sources || [] }, decision: 'allow', reasons: [], status: 'allowed', result: null };

  if (agent.status === 'paused') {
    act.decision = 'block'; act.status = 'blocked'; act.reasons = [{ rule: null, name: 'Agent is paused', action: 'block', detail: 'A person paused this agent. Wait until it is resumed.' }];
    D.actions.push(act); db.save();
    return { ...actionStatus(act), paused: true };
  }

  const history = D.actions.filter((a) => a.agentId === agent.id && a.t > now() - 86400e3);
  const policies = D.policies.filter((p) => p.orgId === orgId);
  const r = evaluate({ policies, req, history });
  act.decision = r.decision; act.reasons = r.reasons; act.flags = r.flags;
  act.status = r.decision === 'block' ? 'blocked' : r.decision === 'hold' ? 'pending' : 'allowed';
  r.reasons.forEach((x) => { const p = policies.find((q) => q.id === x.rule); if (p) p.hits = (p.hits || 0) + 1; });
  D.actions.push(act);

  const plainBase = req.summary || req.action;
  const sev = { allow: 'info', warn: 'warn', hold: 'hold', block: 'block' }[r.decision];
  const suffix = { allow: '', warn: ' — flagged', hold: ' — waiting for approval', block: ' — stopped' }[r.decision];
  agent.lastAction = plainBase;

  let approval = null;
  if (r.decision === 'hold') {
    approval = { id: db.id('apr'), orgId, agentId: agent.id, agentName: agent.name, actionId: act.id, plain: plainBase, tech: techLine(req.action, req.params), policy: r.reasons.map((x) => x.name).join(' · '), reasons: r.reasons, amount: r.flags.amount || 0, created: now(), expires: now() + APPROVAL_MINUTES * 60e3, status: 'pending' };
    D.approvals.push(approval); act.approvalId = approval.id;
    broadcast(orgId, 'approval', approvalView(approval));
  }
  const ev = addEvent(orgId, agent, { kind: 'action', sev, plain: plainBase + suffix, tech: techLine(req.action, req.params), policy: r.reasons.map((x) => x.name).join(' · ') || null, amount: r.flags.amount || 0, injection: r.flags.injection, approval: approval ? approval.id : null, actionId: act.id, reasons: r.reasons });

  // auto-pause rule
  const ap = policies.find((p) => p.type === 'auto_pause' && p.on);
  if ((ap && r.decision === 'block') || r.pause) {
    const c = (ap && ap.config) || { count: 3, minutes: 10 };
    const recent = D.events.filter((e) => e.agentId === agent.id && e.sev === 'block' && e.t > now() - c.minutes * 60e3).length;
    if (r.pause || recent >= c.count) {
      agent.status = 'paused';
      addEvent(orgId, agent, { kind: 'control', sev: 'warn', plain: `Paused automatically: ${r.pause ? 'a rule asked to pause it' : `${recent} actions stopped in ${c.minutes} minutes`}`, tech: `agent.auto_pause(rule=${ap ? ap.id : 'n/a'})` });
      agentWebhook(agent, 'pause', { reason: 'auto_pause' });
      notify(orgId, 'block', `${agent.name} was paused automatically after repeated stopped actions.`, { agent: agent.name });
    }
  }
  if (r.decision === 'block') notify(orgId, 'block', `${agent.name}: ${plainBase} — stopped (${r.reasons.map((x) => x.name).join(', ')})`, { action: act.id });
  if (r.decision === 'hold') notify(orgId, 'hold', `${agent.name} needs approval: ${plainBase}. Decide in the console: ${PUBLIC_URL}/app.html#/approvals`, { approval: approval.id });
  db.save();
  pushAgents(orgId);
  return { ...actionStatus(act), event_id: ev.id, expires_at: approval ? new Date(approval.expires).toISOString() : null };
}

function decideApproval(orgId, user, id, decision) {
  const p = D.approvals.find((x) => x.id === id && x.orgId === orgId);
  if (!p) fail(404, 'not_found', 'Approval not found');
  if (p.status !== 'pending') fail(409, 'already_decided', `This was already ${p.status}.`);
  if (!['approved', 'rejected'].includes(decision)) fail(400, 'bad_decision', 'decision must be approved or rejected');
  p.status = decision; p.by = user ? user.name : 'system'; p.at = now();
  const act = D.actions.find((a) => a.id === p.actionId);
  if (act) { act.status = decision; act.decidedBy = p.by; settle(act); }
  const agent = D.agents.find((a) => a.id === p.agentId);
  addEvent(orgId, agent, { kind: 'decision', sev: 'info', plain: `${decision === 'approved' ? 'Approved' : 'Rejected'} by ${p.by}: ${p.plain}`, tech: `approval.${decision}(id=${p.id})`, approval: p.id });
  db.save();
  broadcast(orgId, 'approval', approvalView(p));
  pushAgents(orgId);
  return approvalView(p);
}

setInterval(() => {
  for (const p of D.approvals) {
    if (p.status === 'pending' && p.expires < now()) {
      p.status = 'expired'; p.by = 'Timer (auto-reject)'; p.at = now();
      const act = D.actions.find((a) => a.id === p.actionId); if (act) { act.status = 'expired'; settle(act); }
      const agent = D.agents.find((a) => a.id === p.agentId);
      addEvent(p.orgId, agent, { kind: 'decision', sev: 'info', plain: `Rejected automatically after ${APPROVAL_MINUTES} minutes without a decision: ${p.plain}`, tech: `approval.expired(id=${p.id})`, approval: p.id });
      broadcast(p.orgId, 'approval', approvalView(p));
    }
  }
}, 5000);

/* ============================ control actions ============================ */
async function control(orgId, user, agent, op, body = {}) {
  const prev = agent.status;
  const by = user.name;
  if (agent.status === 'terminated') fail(409, 'terminated', 'This agent was stopped for good.');
  let plain, tech, sev = 'info', extra = {};
  if (op === 'pause') { agent.status = 'paused'; plain = `Paused by ${by}`; tech = `agent.pause()`; }
  else if (op === 'resume') { if (prev !== 'paused') fail(409, 'not_paused', 'Only a paused agent can be resumed.'); agent.status = 'active'; plain = `Resumed by ${by}`; tech = `agent.resume()`; }
  else if (op === 'isolate') {
    agent.status = 'isolated'; sev = 'block'; plain = `Access cut off by ${by} — API key blocked, every call is refused`; tech = `agent.isolate()`;
  } else if (op === 'restore') { if (prev !== 'isolated') fail(409, 'not_isolated', 'Only a cut-off agent can be restored.'); agent.status = 'paused'; plain = `Access restored by ${by}. The agent stays paused until resumed.`; tech = `agent.restore()`; }
  else if (op === 'kill') {
    if (String(body.confirm || '').trim() !== agent.name) fail(400, 'confirm_mismatch', 'Type the exact agent name to confirm.');
    const reason = clip(body.reason || 'Not specified', 200);
    const t0 = process.hrtime.bigint();
    const steps = [];
    const mark = (label) => steps.push({ label, ms: Number((process.hrtime.bigint() - t0) / 1000000n) });
    agent.status = 'terminated'; agent.killedAt = now(); agent.killReason = reason; agent.killedBy = by;
    agent.keyRevoked = now(); mark('API key revoked — every new call is refused');
    let cancelled = 0;
    for (const p of D.approvals) if (p.agentId === agent.id && p.status === 'pending') { p.status = 'cancelled'; p.by = 'Emergency stop'; p.at = now(); const a = D.actions.find((x) => x.id === p.actionId); if (a) { a.status = 'cancelled'; settle(a); } cancelled++; broadcast(orgId, 'approval', approvalView(p)); }
    mark(`${cancelled} pending action${cancelled === 1 ? '' : 's'} cancelled`);
    const wh = await agentWebhook(agent, 'kill', { reason });
    mark(wh ? (wh.ok ? 'Agent\'s stop endpoint called' : `Agent's stop endpoint failed (${wh.status || wh.error})`) : 'No stop endpoint configured — agent will stop at its next call');
    const inc = { id: 'INC-' + String(1000 + D.incidents.filter((i) => i.orgId === orgId).length + 1), orgId, title: `Emergency stop: ${agent.name}`, agent: agent.name, sev: 'critical', status: 'open', opened: now(), euro: 0, timeline: [] };
    const recent = D.events.filter((e) => e.agentId === agent.id && e.sev !== 'info').slice(-5);
    inc.timeline = [...recent.map((e) => [e.t, e.plain]), [now(), `Emergency stop by ${by} · reason: ${reason}`], ...steps.map((s) => [now(), s.label])];
    inc.euro = recent.reduce((s, e) => s + (e.amount || 0), 0);
    D.incidents.push(inc); mark(`Incident ${inc.id} opened`);
    const hash = audit(orgId, user, 'kill', { agent: agent.name, reason, incident: inc.id }); mark('Sealed audit record written');
    extra = { steps, incident: inc.id, auditHash: hash };
    sev = 'kill'; plain = `Emergency stop by ${by} · reason: ${reason}`; tech = `killswitch.execute(agent=${agent.name}) incident=${inc.id}`;
    broadcast(orgId, 'incident', inc);
    notify(orgId, 'kill', `EMERGENCY STOP — ${agent.name} was stopped for good by ${by}. Reason: ${reason}. Incident ${inc.id}.`, { incident: inc.id });
  } else fail(400, 'bad_op', 'Unknown operation');

  if (op !== 'kill') { audit(orgId, user, op, { agent: agent.name }); if (['pause', 'isolate', 'resume'].includes(op)) agentWebhook(agent, op); }
  addEvent(orgId, agent, { kind: 'control', sev, plain, tech });
  db.save(); pushAgents(orgId);
  return { ok: true, agent: agentView(agent), ...extra };
}

/* ============================ org setup ============================ */
function createOrg(name) {
  const org = { id: db.id('org'), name: clip(name, 80), created: now() };
  D.orgs.push(org);
  defaultPolicies((p) => db.id(p)).forEach((p) => D.policies.push({ ...p, orgId: org.id }));
  integ(org.id);
  return org;
}
function newAgentKey(agent) {
  const key = 'sk_live_' + token(24);
  agent.keyHash = sha256(key); agent.keyPrefix = key.slice(0, 14) + '…';
  agent.webhookSecret = 'whsec_' + token(18);
  return key;
}

/* ============================ routes ============================ */
const routes = [];
const route = (method, pattern, handler) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '([^/]+)') + '$'), handler });

/* --- setup / auth --- */
route('GET', '/api/setup-status', () => ({ needsSetup: D.users.length === 0 }));
route('POST', '/api/auth/signup', async (req, res, b) => {
  if (D.users.length > 0 && process.env.ALLOW_SIGNUP !== '1') fail(403, 'signup_closed', 'This Sentinel already has an owner. Ask an admin to invite you.');
  limit('signup:' + clientIp(req), 10, 3600e3);
  const name = clip(b.name || '', 80).trim(), email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || ''), orgName = String(b.org || '').trim();
  if (!orgName || !name) fail(400, 'missing_fields', 'Company name and your name are required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'bad_email', 'Enter a valid email address.');
  if (pw.length < 10) fail(400, 'weak_password', 'Use a password of at least 10 characters.');
  if (D.users.some((u) => u.email === email)) fail(409, 'email_taken', 'An account with this email already exists.');
  const org = createOrg(orgName);
  const user = { id: db.id('usr'), orgId: org.id, name, email, role: 'admin', password: hashPassword(pw), created: now() };
  D.users.push(user);
  audit(org.id, user, 'org_created', { org: org.name });
  startSession(req, res, user);
  return { ok: true, user: publicUser(user), org };
});
route('POST', '/api/auth/login', async (req, res, b) => {
  const email = String(b.email || '').trim().toLowerCase();
  limit('login:' + clientIp(req) + ':' + email, 8, 15 * 60e3);
  const u = D.users.find((x) => x.email === email && !x.disabled);
  if (!u || !checkPassword(String(b.password || ''), u.password)) { await new Promise((r) => setTimeout(r, 400)); fail(401, 'bad_credentials', 'Email or password is not correct.'); }
  startSession(req, res, u);
  audit(u.orgId, u, 'login', { ip: clientIp(req) });
  return { ok: true, user: publicUser(u) };
});
route('POST', '/api/auth/logout', (req, res) => {
  const cu = currentUser(req);
  if (cu) D.sessions = D.sessions.filter((s) => s !== cu.session);
  db.save();
  res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
  return { ok: true };
});
route('GET', '/api/invite/:token', (req, res, b, [t]) => {
  const inv = D.invites.find((i) => i.hash === sha256(t) && !i.used && i.expires > now());
  if (!inv) fail(404, 'invite_invalid', 'This invitation link is not valid or has expired. Ask your admin for a new one.');
  const org = D.orgs.find((o) => o.id === inv.orgId);
  return { email: inv.email, role: inv.role, org: org.name };
});
route('POST', '/api/auth/accept-invite', async (req, res, b) => {
  const inv = D.invites.find((i) => i.hash === sha256(String(b.token || '')) && !i.used && i.expires > now());
  if (!inv) fail(404, 'invite_invalid', 'This invitation link is not valid or has expired.');
  const name = clip(b.name || '', 80).trim(), pw = String(b.password || '');
  if (!name) fail(400, 'missing_fields', 'Your name is required.');
  if (pw.length < 10) fail(400, 'weak_password', 'Use a password of at least 10 characters.');
  if (D.users.some((u) => u.email === inv.email)) fail(409, 'email_taken', 'An account with this email already exists.');
  const user = { id: db.id('usr'), orgId: inv.orgId, name, email: inv.email, role: inv.role, password: hashPassword(pw), created: now() };
  D.users.push(user); inv.used = now();
  audit(inv.orgId, user, 'invite_accepted', { email: user.email, role: user.role });
  startSession(req, res, user);
  return { ok: true, user: publicUser(user) };
});
route('POST', '/api/me/password', async (req, res, b) => {
  const u = requireUser(req);
  if (!checkPassword(String(b.current || ''), u.password)) fail(400, 'bad_password', 'Your current password is not correct.');
  if (String(b.next || '').length < 10) fail(400, 'weak_password', 'Use a password of at least 10 characters.');
  u.password = hashPassword(String(b.next)); db.save(); audit(u.orgId, u, 'password_changed');
  return { ok: true };
});

/* --- console state --- */
route('GET', '/api/me', (req) => { const u = requireUser(req); return { user: publicUser(u), org: D.orgs.find((o) => o.id === u.orgId) }; });
route('GET', '/api/state', (req) => {
  const u = requireUser(req); const o = u.orgId;
  const cfg = integ(o);
  return {
    org: D.orgs.find((x) => x.id === o), me: publicUser(u),
    agents: orgAgents(o).map(agentView),
    policies: D.policies.filter((p) => p.orgId === o),
    ruleTypes: RULE_TYPES,
    approvals: D.approvals.filter((p) => p.orgId === o).slice(-300).reverse().map(approvalView),
    incidents: D.incidents.filter((i) => i.orgId === o).slice().reverse(),
    events: D.events.filter((e) => e.orgId === o).slice(-400).reverse().map(eventView),
    counters: counters(o),
    team: D.users.filter((x) => x.orgId === o).map((x) => ({ ...publicUser(x), disabled: !!x.disabled })),
    invites: D.invites.filter((i) => i.orgId === o && !i.used && i.expires > now()).map((i) => ({ id: i.id, email: i.email, role: i.role, expires: i.expires })),
    integrations: { slack_webhook: cfg.slack_webhook ? cfg.slack_webhook.replace(/(services\/[^/]+\/)[^/]+\/.*/, '$1•••') : '', slack_set: !!cfg.slack_webhook, webhook_url: cfg.webhook_url, notify_on: cfg.notify_on, lastDelivery: cfg.lastDelivery || null },
    server: { publicUrl: PUBLIC_URL, approvalMinutes: APPROVAL_MINUTES, time: now(), platform: process.platform, node: process.execPath, guard: path.resolve(__dirname, '..', 'integrations', 'mcp-guard', 'sentinel-mcp-guard.mjs'), hook: path.resolve(__dirname, '..', 'integrations', 'claude-code', 'sentinel-hook.mjs') },
  };
});
route('GET', '/api/stream', (req, res) => {
  const u = requireUser(req);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 3000\n\n');
  const set = streams.get(u.orgId) || new Set(); set.add(res); streams.set(u.orgId, set);
  req.on('close', () => set.delete(res));
  return null;
});
route('GET', '/api/counters', (req) => counters(requireUser(req).orgId));
route('GET', '/api/policies', (req) => { const u = requireUser(req); return D.policies.filter((p) => p.orgId === u.orgId); });

/* --- agents --- */
route('POST', '/api/agents', (req, res, b) => {
  const u = requireUser(req, 'admin');
  const name = slug(b.name).replace(/^-|-$/g, '');
  if (!name || name.length < 3) fail(400, 'bad_name', 'Give the agent a name of at least 3 letters (letters, numbers and dashes).');
  if (orgAgents(u.orgId).some((a) => a.name.toLowerCase() === name)) fail(409, 'name_taken', 'An agent with this name already exists.');
  const list = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((s) => String(s).trim()).filter(Boolean).slice(0, 30);
  const a = { id: db.id('agt'), orgId: u.orgId, name, team: clip(b.team || 'General', 40), description: clip(b.description || '', 300), model: clip(b.model || '', 60), owner: clip(b.owner || u.name, 80), tools: list(b.tools), permissions: list(b.permissions), controlUrl: '', status: 'active', created: now() };
  const key = newAgentKey(a);
  D.agents.push(a);
  audit(u.orgId, u, 'agent_created', { agent: a.name });
  addEvent(u.orgId, a, { kind: 'control', sev: 'info', plain: `Agent registered by ${u.name}`, tech: `agent.create(name=${a.name})` });
  db.save(); pushAgents(u.orgId);
  return { agent: agentView(a), apiKey: key, webhookSecret: a.webhookSecret };
});
const findAgent = (u, name) => { const a = orgAgents(u.orgId).find((x) => x.name === decodeURIComponent(name)); if (!a) fail(404, 'not_found', 'Agent not found'); return a; };
route('PUT', '/api/agents/:name', (req, res, b, [n]) => {
  const u = requireUser(req, 'admin'); const a = findAgent(u, n);
  const list = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((s) => String(s).trim()).filter(Boolean).slice(0, 30);
  if (b.team != null) a.team = clip(b.team, 40);
  if (b.description != null) a.description = clip(b.description, 300);
  if (b.model != null) a.model = clip(b.model, 60);
  if (b.owner != null) a.owner = clip(b.owner, 80);
  if (b.tools != null) a.tools = list(b.tools);
  if (b.permissions != null) a.permissions = list(b.permissions);
  if (b.controlUrl != null) { const v = String(b.controlUrl).trim(); if (v && !/^https?:\/\//.test(v)) fail(400, 'bad_url', 'The stop endpoint must start with http:// or https://'); a.controlUrl = v; }
  audit(u.orgId, u, 'agent_updated', { agent: a.name }); db.save(); pushAgents(u.orgId);
  return { agent: agentView(a) };
});
route('POST', '/api/agents/:name/rotate-key', (req, res, b, [n]) => {
  const u = requireUser(req, 'admin'); const a = findAgent(u, n);
  if (a.status === 'terminated') fail(409, 'terminated', 'A stopped agent cannot get a new key.');
  const key = newAgentKey(a); audit(u.orgId, u, 'key_rotated', { agent: a.name }); db.save();
  return { apiKey: key, webhookSecret: a.webhookSecret };
});
route('DELETE', '/api/agents/:name', (req, res, b, [n]) => {
  const u = requireUser(req, 'admin'); const a = findAgent(u, n);
  a.deleted = now(); a.keyHash = 'deleted:' + a.keyHash; audit(u.orgId, u, 'agent_deleted', { agent: a.name }); db.save(); pushAgents(u.orgId);
  return { ok: true };
});
route('POST', '/api/agents/:name/:op', async (req, res, b, [n, op]) => {
  const need = { pause: 'analyst', resume: 'analyst', isolate: 'analyst', restore: 'admin', kill: 'admin' }[op];
  if (!need) fail(404, 'not_found', 'Unknown operation');
  const u = requireUser(req, need); const a = findAgent(u, n);
  return control(u.orgId, u, a, op, b);
});
route('GET', '/api/agents/:name/actions', (req, res, b, [n]) => {
  const u = requireUser(req); const a = findAgent(u, n);
  return D.actions.filter((x) => x.agentId === a.id).slice(-50).reverse().map((x) => ({ id: x.id, t: x.t, action: x.action, params: x.params, summary: x.summary, context: x.context, decision: x.decision, status: x.status, reasons: x.reasons, result: x.result, decidedBy: x.decidedBy || null }));
});

/* --- approvals --- */
route('POST', '/api/approvals/:id/decide', (req, res, b, [id]) => { const u = requireUser(req, 'analyst'); const r = decideApproval(u.orgId, u, id, b.decision); audit(u.orgId, u, 'approval_' + b.decision, { approval: id }); return r; });

/* --- rules --- */
function cleanRule(b, r = {}) {
  if (b.name != null) r.name = clip(String(b.name).trim() || 'Untitled rule', 80);
  if (b.desc != null) r.desc = clip(b.desc, 300);
  if (b.type != null) { if (!RULE_TYPES[b.type]) fail(400, 'bad_type', 'Unknown rule type'); r.type = b.type; }
  if (b.match != null) r.match = clip(String(b.match).trim() || '*', 200);
  if (b.action != null) { if (!['warn', 'hold', 'block', 'pause'].includes(b.action)) fail(400, 'bad_action', 'Unknown rule action'); r.action = b.action; }
  if (b.on != null) r.on = !!b.on;
  if (b.config != null && typeof b.config === 'object') {
    const c = { ...(r.config || {}), ...b.config };
    ['limit', 'max', 'start', 'end', 'count', 'minutes'].forEach((k) => { if (c[k] != null) c[k] = Number(c[k]) || 0; });
    if (c.values && !Array.isArray(c.values)) c.values = String(c.values).split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    r.config = c;
  }
  return r;
}
route('POST', '/api/policies', (req, res, b) => {
  const u = requireUser(req, 'admin');
  const r = cleanRule({ name: 'New rule', desc: '', match: '*', action: 'hold', on: true, config: {}, ...b }, { id: db.id('rule'), orgId: u.orgId, hits: 0, created: now() });
  if (!r.type) fail(400, 'bad_type', 'Choose a rule type');
  D.policies.push(r); audit(u.orgId, u, 'rule_created', { rule: r.name }); db.save(); broadcast(u.orgId, 'policies', D.policies.filter((p) => p.orgId === u.orgId));
  return r;
});
route('PUT', '/api/policies/:id', (req, res, b, [id]) => {
  const u = requireUser(req, 'admin');
  const r = D.policies.find((p) => p.id === id && p.orgId === u.orgId); if (!r) fail(404, 'not_found', 'Rule not found');
  cleanRule(b, r); audit(u.orgId, u, 'rule_updated', { rule: r.name, on: r.on, action: r.action, config: r.config }); db.save(); broadcast(u.orgId, 'policies', D.policies.filter((p) => p.orgId === u.orgId));
  return r;
});
const PRESETS = {
  roblox: [
    ['Running code in Roblox Studio needs a person', 'Before the AI runs Luau code in your place, a person must approve it.', 'deny_action', 'roblox.execute_luau,roblox.run_code,roblox.run_script_in_play_mode', {}, 'hold'],
    ['Creator Store assets need a person', 'Free models can hide malicious scripts (backdoors). Inserting any asset waits for a person.', 'deny_action', 'roblox.insert_asset,roblox.insert_model', {}, 'hold'],
    ['Uploads and web downloads need a person', 'Uploading images to Roblox or downloading web pages waits for a person.', 'deny_action', 'roblox.upload_image,roblox.http_get', {}, 'hold'],
    ['Script edits: hourly limit', 'If the AI edits scripts more than the limit in one hour, further edits wait for a person.', 'rate_limit', 'roblox.multi_edit', { max: 60, window: 'hour', count_field: '' }, 'hold'],
    ['AI generation: daily limit', 'Limits how many meshes, materials and models the AI can generate per day.', 'rate_limit', 'roblox.generate_*', { max: 100, window: 'day', count_field: '' }, 'block'],
  ],
};
route('POST', '/api/policies/preset', (req, res, b) => {
  const u = requireUser(req, 'admin');
  const list = PRESETS[b.preset]; if (!list) fail(404, 'not_found', 'Unknown preset');
  const have = new Set(D.policies.filter((p) => p.orgId === u.orgId).map((p) => p.name));
  let added = 0;
  for (const [name, desc, type, match, config, action] of list) {
    if (have.has(name)) continue;
    D.policies.push({ id: db.id('rule'), orgId: u.orgId, name, desc, type, match, config, action, on: true, hits: 0, created: now() }); added++;
  }
  audit(u.orgId, u, 'preset_added', { preset: b.preset, added }); db.save(); broadcast(u.orgId, 'policies', D.policies.filter((p) => p.orgId === u.orgId));
  return { added, policies: D.policies.filter((p) => p.orgId === u.orgId) };
});
route('DELETE', '/api/policies/:id', (req, res, b, [id]) => {
  const u = requireUser(req, 'admin');
  const i = D.policies.findIndex((p) => p.id === id && p.orgId === u.orgId); if (i < 0) fail(404, 'not_found', 'Rule not found');
  const [r] = D.policies.splice(i, 1); audit(u.orgId, u, 'rule_deleted', { rule: r.name }); db.save(); broadcast(u.orgId, 'policies', D.policies.filter((p) => p.orgId === u.orgId));
  return { ok: true };
});

/* --- incidents --- */
route('POST', '/api/incidents/:id/resolve', (req, res, b, [id]) => {
  const u = requireUser(req, 'analyst');
  const i = D.incidents.find((x) => x.id === id && x.orgId === u.orgId); if (!i) fail(404, 'not_found', 'Incident not found');
  i.status = 'resolved'; i.timeline.push([now(), `Marked resolved by ${u.name}${b.note ? ': ' + clip(b.note, 300) : ''}`]);
  audit(u.orgId, u, 'incident_resolved', { incident: id }); db.save(); broadcast(u.orgId, 'incident', i);
  return i;
});

/* --- team --- */
route('POST', '/api/team/invite', (req, res, b) => {
  const u = requireUser(req, 'admin');
  const email = String(b.email || '').trim().toLowerCase(), role = ROLES[b.role] ? b.role : 'viewer';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'bad_email', 'Enter a valid email address.');
  if (D.users.some((x) => x.email === email)) fail(409, 'email_taken', 'This person already has an account.');
  const t = token(24);
  D.invites.push({ id: db.id('inv'), orgId: u.orgId, email, role, hash: sha256(t), expires: now() + 7 * 86400e3, by: u.id });
  audit(u.orgId, u, 'invite_created', { email, role }); db.save();
  return { link: `${PUBLIC_URL}/login.html#invite=${t}`, expires: now() + 7 * 86400e3 };
});
route('PUT', '/api/team/:id', (req, res, b, [id]) => {
  const u = requireUser(req, 'admin');
  const m = D.users.find((x) => x.id === id && x.orgId === u.orgId); if (!m) fail(404, 'not_found', 'Member not found');
  if (b.role && ROLES[b.role]) {
    if (m.id === u.id && b.role !== 'admin') fail(400, 'self_demote', 'You cannot remove your own admin role.');
    m.role = b.role;
  }
  if (b.disabled != null) {
    if (m.id === u.id) fail(400, 'self_disable', 'You cannot disable your own account.');
    m.disabled = !!b.disabled; if (m.disabled) D.sessions = D.sessions.filter((s) => s.userId !== m.id);
  }
  audit(u.orgId, u, 'member_updated', { email: m.email, role: m.role, disabled: !!m.disabled }); db.save();
  return publicUser(m);
});
route('DELETE', '/api/invites/:id', (req, res, b, [id]) => { const u = requireUser(req, 'admin'); D.invites = D.invites.filter((i) => !(i.id === id && i.orgId === u.orgId)); db.save(); return { ok: true }; });

/* --- integrations --- */
route('PUT', '/api/integrations', (req, res, b) => {
  const u = requireUser(req, 'admin'); const cfg = integ(u.orgId);
  const okUrl = (v) => !v || /^https:\/\//.test(v) || /^http:\/\/(localhost|127\.0\.0\.1)/.test(v);
  if (b.slack_webhook != null && !String(b.slack_webhook).includes('•••')) { if (!okUrl(b.slack_webhook)) fail(400, 'bad_url', 'The Slack webhook must start with https://'); cfg.slack_webhook = String(b.slack_webhook).trim(); }
  if (b.webhook_url != null) { if (!okUrl(b.webhook_url)) fail(400, 'bad_url', 'The webhook must start with https://'); cfg.webhook_url = String(b.webhook_url).trim(); }
  if (b.notify_on) cfg.notify_on = { ...cfg.notify_on, ...b.notify_on };
  audit(u.orgId, u, 'integrations_updated', {}); db.save();
  return { ok: true };
});
route('POST', '/api/integrations/test', async (req) => {
  const u = requireUser(req, 'admin'); const cfg = integ(u.orgId);
  if (!cfg.slack_webhook && !cfg.webhook_url) fail(400, 'nothing_configured', 'Save a Slack or webhook address first.');
  await notify(u.orgId, 'test', `Test message from ${u.name}. If you can read this, notifications work.`, {});
  return cfg.lastDelivery;
});

/* --- audit & export --- */
route('GET', '/api/audit/verify', (req) => { requireUser(req); return db.verifyAudit(); });
route('GET', '/api/events.csv', (req, res) => {
  const u = requireUser(req);
  const rows = [['time', 'agent', 'team', 'result', 'what happened', 'technical', 'rules', 'amount']].concat(D.events.filter((e) => e.orgId === u.orgId).map((e) => [new Date(e.t).toISOString(), e.agentName, e.team, e.sev, e.plain, e.tech, e.policy || '', e.amount || '']));
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="sentinel-activity.csv"' });
  res.end(csv); return null;
});

/* --- AGENT API (Bearer sk_...) --- */
route('GET', '/api/v1/status', (req) => {
  const a = agentFromKey(req); a.lastSeen = now(); db.save();
  return { agent: a.name, status: a.status, allowed_to_run: !['terminated', 'isolated', 'paused'].includes(a.status) };
});
route('POST', '/api/v1/check', (req, res, b) => {
  const a = agentFromKey(req);
  limit('agent:' + a.id, Number(process.env.AGENT_RATE || 600), 60e3);
  return checkAction(a, b);
});
route('GET', '/api/v1/actions/:id', (req, res, b, [id]) => {
  const a = agentFromKey(req); const act = D.actions.find((x) => x.id === id && x.agentId === a.id);
  if (!act) fail(404, 'not_found', 'Action not found'); return actionStatus(act);
});
route('GET', '/api/v1/actions/:id/wait', (req, res, b, [id]) => {
  const a = agentFromKey(req); const act = D.actions.find((x) => x.id === id && x.agentId === a.id);
  if (!act) fail(404, 'not_found', 'Action not found');
  if (act.status !== 'pending') return actionStatus(act);
  const timeout = Math.min(55, Math.max(1, Number(new URL(req.url, 'http://x').searchParams.get('timeout') || 25))) * 1000;
  return new Promise((resolve) => {
    const set = waiters.get(act.id) || new Set();
    const done = () => { clearTimeout(t); set.delete(done); resolve(actionStatus(act)); };
    const t = setTimeout(done, timeout);
    set.add(done); waiters.set(act.id, set);
    req.on('close', () => { clearTimeout(t); set.delete(done); });
  });
});
route('POST', '/api/v1/actions/:id/result', (req, res, b, [id]) => {
  const a = agentFromKey(req); const act = D.actions.find((x) => x.id === id && x.agentId === a.id);
  if (!act) fail(404, 'not_found', 'Action not found');
  if (!['allowed', 'approved'].includes(act.status)) fail(409, 'not_allowed', `This action was ${act.status}; it must not be executed.`);
  act.result = { ok: b.ok !== false, output: clip(JSON.stringify(b.output ?? null), 2000), error: b.error ? clip(b.error, 500) : null, at: now() };
  if (b.ok === false) addEvent(a.orgId, a, { kind: 'result', sev: 'warn', plain: `Action failed: ${act.summary || act.action} — ${clip(b.error || 'unknown error', 120)}`, tech: `${act.action} → error`, actionId: act.id });
  db.save(); return { ok: true };
});

/* ============================ static files ============================ */
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.py': 'text/x-python; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8' };
const SEC = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};
function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/app') pathname = '/app.html';
  if (pathname === '/login') pathname = '/login.html';
  const isSdk = pathname.startsWith('/sdk/');
  const root = isSdk ? SDK_DIR : PUBLIC_DIR;
  const rel = isSdk ? pathname.slice(4) : pathname;
  const file = path.join(root, path.normalize(decodeURIComponent(rel)).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(root + path.sep)) return send(res, 403, 'Forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': /\.(html)$/.test(file) ? 'no-cache' : 'public, max-age=300', ...SEC });
    fs.createReadStream(file).pipe(res);
  });
}

/* ============================ server ============================ */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    if (!p.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      return serveStatic(req, res, p);
    }
    // CSRF guard for the console API: browsers cannot add this header cross-site without CORS (which we never enable)
    if (!p.startsWith('/api/v1/') && req.method !== 'GET' && req.headers['x-sentinel'] !== '1') fail(403, 'csrf', 'Missing X-Sentinel header.');
    const r = routes.find((x) => x.method === req.method && x.re.test(p));
    if (!r) fail(404, 'not_found', 'Unknown API endpoint');
    const params = p.match(r.re).slice(1);
    const body = ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {};
    const out = await r.handler(req, res, body, params);
    if (out !== null && !res.writableEnded) send(res, 200, out);
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.code || 'server_error', message: e instanceof HttpError ? e.message : 'Something went wrong on the server. Check the server window for details.' });
  }
});

function shutdown() { console.log('\nSaving data and stopping…'); db.flush(); process.exit(0); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  SENTINEL-AI is running');
  console.log(`  Open:      ${PUBLIC_URL}`);
  console.log(`  Data:      ${DATA_DIR}`);
  console.log(`  Agent API: ${PUBLIC_URL}/api/v1/check`);
  console.log(D.users.length ? `  Accounts:  ${D.users.length} user(s), ${D.agents.filter((a) => !a.deleted).length} agent(s)` : '  First time: open the address above and create your company account.');
  console.log('  Stop:      press Ctrl+C in this window');
  console.log('');
});

module.exports = { server, db };
