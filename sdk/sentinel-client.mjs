/**
 * Sentinel-AI client for JavaScript agents (Node 18+, Deno, Bun, browsers) — no dependencies.
 *
 *   import { Sentinel, Blocked, AgentStopped } from './sentinel-client.mjs';
 *   const sentinel = new Sentinel({ url: 'http://localhost:8787', apiKey: process.env.SENTINEL_API_KEY });
 *
 *   const action = await sentinel.check({
 *     action: 'payments.transfer', summary: 'Pay €18,400 to ACME',
 *     params: { amount: 18400, iban: 'DE89…' },
 *     context: { input: emailText, inputSource: 'Supplier email' },
 *   });                                      // throws Blocked / AgentStopped / Unreachable
 *   const tx = await bank.transfer(...);     // only reached if allowed or approved
 *   await action.report({ ok: true, output: { tx: tx.id } });
 */
export class SentinelError extends Error {}
export class Blocked extends SentinelError { constructor(msg, reasons = [], actionId = null, status = null) { super(msg); this.reasons = reasons; this.actionId = actionId; this.status = status; } }
export class AgentStopped extends SentinelError { constructor(msg, status) { super(msg); this.status = status; } }
export class Unreachable extends SentinelError {}

export class Action {
  constructor(client, d) { this._c = client; this.id = d.id; this.decision = d.decision; this.status = d.status; this.reasons = d.reasons || []; }
  async report({ ok = true, output = null, error = null } = {}) {
    try { await this._c._req('POST', `/api/v1/actions/${this.id}/result`, { ok, output, error }); } catch (e) { /* best effort */ }
  }
}

export class Sentinel {
  constructor({ url, apiKey, timeoutMs = 10000, failOpen = false }) {
    if (!apiKey || !apiKey.startsWith('sk_')) throw new Error('apiKey must be the agent key starting with sk_ (from the Connect page)');
    this.url = url.replace(/\/$/, ''); this.apiKey = apiKey; this.timeoutMs = timeoutMs; this.failOpen = failOpen;
  }
  async _req(method, path, body, timeoutMs) {
    let r;
    try {
      r = await fetch(this.url + path, { method, headers: { Authorization: 'Bearer ' + this.apiKey, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs || this.timeoutMs) });
    } catch (e) { throw new Unreachable(`Cannot reach Sentinel at ${this.url}: ${e.message}`); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (d.error === 'agent_terminated' || d.error === 'agent_isolated') throw new AgentStopped(d.message, d.error.replace('agent_', ''));
      throw new SentinelError(`${d.error || r.status}: ${d.message || r.statusText}`);
    }
    return d;
  }
  status() { return this._req('GET', '/api/v1/status'); }

  async check({ action, params = {}, summary = '', context = {}, waitForApproval = true, maxWaitMs = null }) {
    const ctx = { input: context.input, input_source: context.inputSource || context.input_source, reasoning: context.reasoning, sources: context.sources };
    let r;
    try { r = await this._req('POST', '/api/v1/check', { action, params, summary, context: ctx }); }
    catch (e) { if (e instanceof Unreachable && this.failOpen) return new Action(this, { id: 'offline', decision: 'allow', status: 'allowed' }); throw e; }
    if (r.paused) throw new AgentStopped('This agent is paused in Sentinel. Wait until a person resumes it.', 'paused');
    if (r.decision === 'allow' || r.decision === 'warn') return new Action(this, r);
    if (r.decision === 'block') throw new Blocked('Stopped by Sentinel: ' + r.reasons.map((x) => `${x.name} — ${x.detail}`).join('; '), r.reasons, r.id, 'blocked');
    if (!waitForApproval) throw new Blocked('Waiting for a person to approve in Sentinel', r.reasons, r.id, 'pending');
    const deadline = maxWaitMs ? Date.now() + maxWaitMs : null;
    for (;;) {
      let s;
      try { s = await this._req('GET', `/api/v1/actions/${r.id}/wait?timeout=25`, null, 35000); }
      catch (e) { if (e instanceof Unreachable) { await new Promise((ok) => setTimeout(ok, 3000)); continue; } throw e; }
      if (s.status === 'approved') return new Action(this, s);
      if (s.status !== 'pending') throw new Blocked(`Not approved (${s.status})`, s.reasons, r.id, s.status);
      if (deadline && Date.now() > deadline) throw new Blocked('Still waiting for approval after maxWaitMs', r.reasons, r.id, 'pending');
    }
  }

  /** Runs fn only if allowed; reports success or failure automatically. */
  async guard(opts, fn) {
    const a = await this.check(opts);
    try { const out = await fn(a); await a.report({ ok: true, output: out ?? null }); return out; }
    catch (e) { await a.report({ ok: false, error: String(e && e.message || e) }); throw e; }
  }
}

/** Verify X-Sentinel-Signature on your stop endpoint (Node). */
export async function verifySignature(rawBody, header, secret) {
  const { createHmac, timingSafeEqual } = await import('node:crypto');
  const exp = Buffer.from('sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex'));
  const got = Buffer.from(header || '');
  return exp.length === got.length && timingSafeEqual(exp, got);
}
