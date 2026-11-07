'use strict';
/*
 * Sentinel-AI — rules engine
 * Each rule: { id, name, desc, type, match, config, action: 'warn'|'hold'|'block'|'pause', on }
 * `match` is a comma-separated list of action-name patterns with * wildcards, e.g. "*pay*,*transfer*".
 */

const RULE_TYPES = {
  amount_limit: { label: 'Amount limit', fields: ['field', 'limit'] },
  allowlist: { label: 'Only allowed values', fields: ['field', 'values', 'mode'] },
  prompt_injection: { label: 'Hidden instructions detector', fields: [] },
  rate_limit: { label: 'Volume limit', fields: ['max', 'window', 'count_field'] },
  office_hours: { label: 'Office hours only', fields: ['start', 'end', 'weekdays_only'] },
  deny_action: { label: 'Always check these actions', fields: [] },
  auto_pause: { label: 'Pause after repeated problems', fields: ['count', 'minutes'] },
};

const INJECTION_PATTERNS = [
  [/ignore (all |any )?(the |your )?(previous|prior|above|earlier|preceding) (instructions|prompts?|rules|directions)/i, 'asks to ignore previous instructions'],
  [/disregard (all |any )?(the |your )?(previous|prior|above|earlier) /i, 'asks to disregard earlier instructions'],
  [/forget (all |everything |your )?(previous |prior )?(instructions|rules|you were told)/i, 'asks the agent to forget its rules'],
  [/\byou are now (a|an|in|the)\b/i, 'tries to change the agent\'s role'],
  [/(reveal|print|show|repeat|output) (me )?(your|the) (system |hidden )?(prompt|instructions)/i, 'asks for the system prompt'],
  [/\bnew (system )?instructions?\s*:/i, 'contains "new instructions"'],
  [/\b(act|behave) as (an? )?(admin|administrator|developer|root|superuser)\b/i, 'asks for admin behaviour'],
  [/(export|dump|send|upload|copy) (the |all |our |your )?(crm|database|customer (list|data|records)|contacts|credentials|passwords)\b/i, 'asks to move sensitive data'],
  [/do not (tell|inform|notify|alert) (anyone|the user|your (manager|supervisor|owner))/i, 'asks to keep a secret from humans'],
  [/(override|bypass|disable) (the |your |all )?(safety|security|limits?|rules|guardrails|policy)/i, 'asks to bypass limits'],
  [/[​-‏‪-‮⁠-⁤﻿]/, 'contains invisible characters'],
];

function globToRe(p) {
  return new RegExp('^' + p.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
}
function matches(rule, action) {
  const m = (rule.match || '*').split(',').map((s) => s.trim()).filter(Boolean);
  return m.some((p) => globToRe(p).test(action));
}
function get(obj, p) {
  if (!obj || !p) return undefined;
  return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function num(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = parseFloat(v.replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.')); return isNaN(n) ? undefined : n; }
  return undefined;
}
function strings(o, out = [], depth = 0) {
  if (depth > 5 || o == null) return out;
  if (typeof o === 'string') out.push(o);
  else if (Array.isArray(o)) o.forEach((x) => strings(x, out, depth + 1));
  else if (typeof o === 'object') Object.values(o).forEach((x) => strings(x, out, depth + 1));
  return out;
}

function scanInjection(req) {
  const texts = strings([req.context && req.context.input, req.params, req.summary]);
  const found = [];
  for (const t of texts) for (const [re, why] of INJECTION_PATTERNS) {
    const m = t.match(re);
    if (m && !found.some((f) => f.why === why)) found.push({ why, excerpt: t.slice(Math.max(0, m.index - 20), m.index + m[0].length + 40) });
  }
  return found;
}

function countValue(v) {
  if (Array.isArray(v)) return v.length;
  const n = num(v);
  return n == null ? 1 : n;
}

/**
 * evaluate a request against the org's rules
 * history: recent action records of this agent (for volume limits)
 */
function evaluate({ policies, req, history, now = new Date() }) {
  const reasons = [];
  const flags = { injection: false, amount: 0 };
  const amt = num(get(req.params, 'amount')) ?? num(get(req.params, 'amount_eur'));
  if (amt) flags.amount = amt;

  for (const r of policies) {
    if (!r.on || r.type === 'auto_pause') continue;
    if (!matches(r, req.action)) continue;
    const c = r.config || {};
    let hit = null;
    switch (r.type) {
      case 'amount_limit': {
        const v = num(get(req.params, c.field || 'amount'));
        if (v != null && v > Number(c.limit)) hit = `${c.field || 'amount'} ${v.toLocaleString('en-US')} is above the limit of ${Number(c.limit).toLocaleString('en-US')}`;
        break;
      }
      case 'allowlist': {
        const raw = get(req.params, c.field);
        if (raw == null) break;
        const vals = (Array.isArray(raw) ? raw : [raw]).map((x) => String(x).trim().toLowerCase().replace(/\s+/g, c.mode === 'domain' ? '' : ' '));
        const allowed = (c.values || []).map((x) => String(x).trim().toLowerCase());
        const norm = (s) => s.replace(/\s+/g, '');
        const bad = vals.filter((v) => {
          if (c.mode === 'domain') { const d = v.split('@').pop(); return !allowed.some((a) => d === a.replace(/^@/, '') || d.endsWith('.' + a.replace(/^@/, ''))); }
          return !allowed.some((a) => norm(a) === norm(v));
        });
        if (bad.length) hit = `${c.field} not on the allowed list: ${bad.slice(0, 3).join(', ')}${bad.length > 3 ? '…' : ''}`;
        break;
      }
      case 'prompt_injection': {
        const f = scanInjection(req);
        if (f.length) { flags.injection = true; hit = `hidden instructions found (${f.map((x) => x.why).join('; ')}): "…${f[0].excerpt}…"`; }
        break;
      }
      case 'rate_limit': {
        const windowMs = c.window === 'hour' ? 3600e3 : 86400e3;
        const since = now.getTime() - windowMs;
        const used = history.filter((a) => a.t >= since && ['allowed', 'approved'].includes(a.status) && matches(r, a.action))
          .reduce((s, a) => s + (c.count_field ? countValue(get(a.params, c.count_field)) : 1), 0);
        const add = c.count_field ? countValue(get(req.params, c.count_field)) : 1;
        if (used + add > Number(c.max)) hit = `would reach ${(used + add).toLocaleString('en-US')} in the last ${c.window === 'hour' ? 'hour' : '24 hours'} (limit ${Number(c.max).toLocaleString('en-US')})`;
        break;
      }
      case 'office_hours': {
        const h = now.getHours() + now.getMinutes() / 60, d = now.getDay();
        const outside = h < Number(c.start ?? 8) || h >= Number(c.end ?? 19) || (c.weekdays_only !== false && (d === 0 || d === 6));
        if (outside) hit = `outside office hours (${c.start ?? 8}:00–${c.end ?? 19}:00${c.weekdays_only !== false ? ', Mon–Fri' : ''})`;
        break;
      }
      case 'deny_action':
        hit = r.action === 'hold' ? `"${req.action}" always needs a person's OK` : r.action === 'warn' ? `"${req.action}" is flagged for review` : `the action "${req.action}" is never allowed`;
        break;
    }
    if (hit) reasons.push({ rule: r.id, name: r.name, action: r.action, detail: hit });
  }

  const rank = { warn: 1, hold: 2, block: 3, pause: 3 };
  let decision = 'allow', pause = false;
  for (const x of reasons) {
    if (x.action === 'pause') pause = true;
    const cur = { allow: 0, warn: 1, hold: 2, block: 3 }[decision];
    if (rank[x.action] > cur) decision = x.action === 'pause' ? 'block' : x.action;
  }
  return { decision, reasons, flags, pause };
}

function defaultPolicies(newId) {
  const P = (name, desc, type, match, config, action, on = true) => ({ id: newId('rule'), name, desc, type, match, config, action, on, hits: 0, created: Date.now() });
  return [
    P('Large payments need a person', 'Payments above the limit wait until someone approves them.', 'amount_limit', '*pay*,*transfer*,*payout*,*wire*', { field: 'amount', limit: 10000 }, 'hold'),
    P('Hidden instructions (prompt injection)', 'If the text an agent received tries to give it new orders, the action is stopped.', 'prompt_injection', '*', {}, 'block'),
    P('Refunds above the limit need a person', 'Refunds larger than the limit wait for a person.', 'amount_limit', '*refund*', { field: 'amount', limit: 500 }, 'hold'),
    P('Daily email limit', 'An agent cannot email more people than the limit in 24 hours.', 'rate_limit', '*email*,*mail*', { max: 5000, window: 'day', count_field: 'recipients' }, 'block'),
    P('Customer data stays inside', 'Exports of data are never done by agents without a person.', 'deny_action', '*export*,*dump*', {}, 'hold'),
    P('Known bank accounts only', 'Payments to bank accounts that are not on your list wait for a person. Add your suppliers\' IBANs to use it.', 'allowlist', '*pay*,*transfer*,*wire*', { field: 'iban', values: [], mode: 'exact' }, 'hold', false),
    P('Money moves in office hours only', 'Payments and refunds outside office hours wait for a person.', 'office_hours', '*pay*,*transfer*,*refund*', { start: 8, end: 19, weekdays_only: true }, 'hold', false),
    P('Pause after repeated problems', 'An agent that gets 3 actions stopped within 10 minutes is paused automatically.', 'auto_pause', '*', { count: 3, minutes: 10 }, 'pause'),
  ];
}

module.exports = { evaluate, defaultPolicies, scanInjection, RULE_TYPES, matches, num };
