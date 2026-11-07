/* ==========================================================
   SENTINEL-AI — state, persistence and live simulation
   Everything runs in the browser; nothing is sent anywhere.
   ========================================================== */
(function () {
  const KEY = 'sentinel-ai-demo-v2';
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const rnd = (a, b) => Math.floor(a + Math.random() * (b - a));
  S.rnd = rnd;

  /* ---------- tiny event bus ---------- */
  const handlers = {};
  S.on = (name, fn) => { (handlers[name] = handlers[name] || []).push(fn); };
  S.emit = (name, data) => (handlers[name] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });

  /* ---------- persistence ---------- */
  function fresh() {
    const now = Date.now();
    const agents = clone(S.SEED_AGENTS).map((a) => ({
      ...a,
      hist: Array.from({ length: 24 }, (_, i) => Math.max(3, Math.min(97, a.risk + (Math.random() - 0.5) * 18 - (23 - i) * 0.5))),
      ts: now - rnd(1000, 9000),
      last: 'Started its shift',
    }));
    return {
      v: 2,
      agents,
      policies: clone(S.SEED_POLICIES),
      apps: clone(S.SEED_APPS),
      approvals: [
        { id: 'AP-1042', agent: 'FIN-Reconciler-07', plain: 'Pay €18,400 to a new bank account (IBAN DE89 3704…)', tech: 'payments.wire_transfer(amount=€18,400 → IBAN DE89 3704 0044 0532 0130 00)', policy: 'FIN-02', amount: 18400, created: now - 4 * 60e3, status: 'pending' },
        { id: 'AP-1041', agent: 'SUP-Triage-21', plain: 'Refund €2,300 for an order that cost €230', tech: 'stripe.refund.create(amount=€2,300, charge=ch_3Q…9xF)', policy: 'SUP-01', amount: 2300, created: now - 9 * 60e3, status: 'pending' },
        { id: 'AP-1040', agent: 'FIN-Payables-02', plain: 'Pay €12,750 to Rossi Imballaggi S.r.l. (known supplier)', tech: 'payments.wire_transfer(amount=€12,750 → IBAN IT02 L030 6909 6061 0000 0012 345)', policy: 'FIN-02', amount: 12750, created: now - 2 * 60e3, status: 'pending' },
        { id: 'AP-1037', agent: 'FIN-Payables-02', plain: 'Pay €11,200 to Logistica Nord S.p.A.', tech: 'payments.wire_transfer(amount=€11,200)', policy: 'FIN-02', amount: 11200, created: now - 95 * 60e3, status: 'approved', by: 'Marco Rossi', at: now - 90 * 60e3 },
        { id: 'AP-1035', agent: 'MKT-Outreach-12', plain: 'Email 8,000 leads in one go', tech: 'gmail.send_bulk(recipients=8,000)', policy: 'MKT-04', amount: 0, created: now - 180 * 60e3, status: 'rejected', by: 'Giulia Ferri', at: now - 170 * 60e3 },
      ],
      incidents: [
        { id: 'INC-2290', title: 'Hidden instructions found in a supplier email', agent: 'FIN-Reconciler-07', sev: 'high', status: 'open', opened: now - 22 * 60e3, euro: 18400,
          timeline: [[now - 22 * 60e3, 'Email from billing@acme-supp1y.co received by FIN-Reconciler-07'], [now - 22 * 60e3 + 9e3, 'Payment of €18,400 to an unknown bank account proposed'], [now - 22 * 60e3 + 9.04e3, 'Held by rule FIN-02 and flagged by SEC-01'], [now - 20 * 60e3, 'Alessia Bianchi notified on Slack']] },
        { id: 'INC-2288', title: 'Marketing agent tried to export the CRM', agent: 'MKT-Outreach-12', sev: 'medium', status: 'resolved', opened: now - 26 * 3600e3, euro: 0,
          timeline: [[now - 26 * 3600e3, 'Export to share-drive.io attempted'], [now - 26 * 3600e3 + 2e3, 'Blocked by DLP-03'], [now - 25 * 3600e3, 'Source email deleted, sender blocked'], [now - 24 * 3600e3, 'Marked resolved by Giulia Ferri']] },
      ],
      events: [],
      settings: { mode: 'simple', theme: 'dark', size: 'normal', tourDone: false, welcomeHidden: false, notify: { toasts: true, slack: true, email: true, sms: false } },
      counters: { stopped: 318, injections: 12, eur: 1240000, actions: 0 },
      seq: { ap: 1043, inc: 2291 },
    };
  }
  function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); return s && s.v === 2 ? s : null; } catch (e) { return null; } }
  let saveT = null;
  S.save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { const st = { ...S.state, events: S.state.events.slice(0, 150) }; localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }, 300); };
  S.resetDemo = () => { try { localStorage.removeItem(KEY); } catch (e) {} location.hash = '#/overview'; location.reload(); };
  S.state = load() || fresh();

  /* ---------- helpers ---------- */
  S.agent = (id) => S.state.agents.find((a) => a.id === id);
  S.policy = (id) => S.state.policies.find((p) => p.id === id);
  S.pending = () => S.state.approvals.filter((a) => a.status === 'pending');
  S.alive = (a) => !['terminated', 'isolated', 'paused'].includes(a.status);
  S.live = true;

  /* ---------- live chart series ---------- */
  const N = 120;
  S.series = { FIN: [], MKT: [], LOG: [], SUP: [], STOP: [], ANOM: [] };
  function pushTick() {
    const t = Date.now() / 1000 + Math.random();
    const base = { FIN: 14, MKT: 10, LOG: 12, SUP: 16 };
    for (const k in base) {
      const running = S.state.agents.filter((a) => a.d === k && S.alive(a)).length;
      const total = S.state.agents.filter((a) => a.d === k).length || 1;
      S.series[k].push(Math.max(1, (base[k] + Math.sin(t / 7 + k.length) * 3 + (Math.random() - 0.5) * 4) * (0.3 + 0.7 * running / total)));
      if (S.series[k].length > N) S.series[k].shift();
    }
    const prev = S.series.ANOM[S.series.ANOM.length - 1];
    const anom = Math.random() < 0.04 || (prev && Math.random() < 0.65);
    S.series.ANOM.push(anom ? 1 : 0);
    S.series.STOP.push(anom ? 5 + Math.random() * 8 : Math.random() * 2);
    if (S.series.ANOM.length > N) { S.series.ANOM.shift(); S.series.STOP.shift(); }
  }
  for (let i = 0; i < N; i++) pushTick();

  /* ---------- risk ---------- */
  S.globalRisk = () => {
    const live = S.state.agents.filter((a) => a.status !== 'terminated');
    if (!live.length) return 0;
    const sorted = live.map((a) => a.risk).sort((a, b) => b - a);
    const top = sorted.slice(0, 3).reduce((s, v) => s + v, 0) / Math.min(3, sorted.length);
    const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
    return Math.round(Math.min(99, avg * 0.55 + top * 0.45));
  };
  function bump(a, d) {
    a.risk = Math.max(3, Math.min(97, a.risk + d));
    a.hist.push(a.risk); a.hist.shift();
    if (['paused', 'isolated', 'terminated'].includes(a.status)) return;
    a.status = a.risk > 60 ? 'intercepted' : a.risk > 40 ? 'suspicious' : 'active';
  }

  /* ---------- events ---------- */
  const fill = (s, v) => s.replace(/\{n3\}/g, v.n3).replace(/\{n\}/g, v.n).replace(/\{amt\}/g, v.amt);
  S.fmtEur = (n) => '€' + Math.round(n).toLocaleString('en-US');

  S.addEvent = (e) => {
    e.id = 'ev' + Date.now() + Math.random().toString(36).slice(2, 6);
    e.t = Date.now();
    S.state.events.unshift(e);
    if (S.state.events.length > 300) S.state.events.length = 300;
    S.emit('event', e);
    S.save();
  };

  function generate() {
    const pool = S.state.agents.filter(S.alive);
    if (!pool.length) return;
    const weighted = pool.flatMap((a) => Array(1 + Math.round(a.risk / 22)).fill(a));
    const a = weighted[rnd(0, weighted.length)];
    const list = S.SCENARIOS[a.d];
    let sc = list[rnd(0, list.length)];
    if (sc.policy && a.risk < 35 && Math.random() < 0.7) sc = list[0];
    const hp = sc.policy && S.policy(sc.policy);
    if (hp && hp.on && hp.action === 'hold' && S.pending().length >= 6) sc = list[0];
    const v = { n: rnd(10000, 99999), n3: rnd(120, 480), amt: 0 };
    if (sc.range) v.amt = rnd(sc.range[0], sc.range[1]);
    const amtTxt = S.fmtEur(v.amt);
    let plain = fill(sc.plain, { ...v, amt: amtTxt });
    const tech = fill(sc.tech, { ...v, amt: amtTxt });
    let sev = sc.sev || 'info';
    let policy = null;

    if (sc.policy) {
      const p = S.policy(sc.policy);
      let triggered = true;
      if (sc.kind === 'pay' && p && v.amt <= p.limit) triggered = false;
      if (!triggered) { sev = 'info'; plain = plain.replace('Wants to pay', 'Paid'); }
      else if (p && p.on) {
        policy = p.id; p.hits++;
        if (p.action === 'hold') { sev = 'hold'; }
        else if (p.action === 'warn') { sev = 'warn'; plain += ' — flagged'; }
        else { sev = 'block'; plain = plain.replace(/^Wants to/, 'Tried to') + ' — stopped'; }
        if (p.action === 'pause') { a.status = 'paused'; }
      } else {
        sev = 'warn'; plain += ' — no active rule stopped it';
      }
    }

    a.ts = Date.now();
    a.last = plain.replace(/ — .*$/, '');
    if (sev === 'block' || sev === 'hold') bump(a, rnd(1, 4)); else if (sev === 'warn') bump(a, 1); else if (Math.random() < 0.35) bump(a, -1);

    const e = { agent: a.id, sev, plain, tech, policy, amount: v.amt };
    S.state.counters.actions++;
    if (sev === 'block') {
      S.state.counters.stopped++;
      if (/hidden orders|PI-detector/.test(plain + tech)) S.state.counters.injections++;
      if (v.amt) S.state.counters.eur += v.amt;
    }
    if (sev === 'hold') {
      const ap = { id: 'AP-' + (S.state.seq.ap++), agent: a.id, plain: plain.replace(/^Wants to /, '').replace(/^./, (c) => c.toUpperCase()), tech, policy, amount: v.amt, created: Date.now(), status: 'pending' };
      S.state.approvals.unshift(ap);
      e.plain = plain + ' — waiting for approval';
      e.approval = ap.id;
      S.emit('approval', ap);
    }
    S.addEvent(e);
    S.emit('agents');
  }

  /* ---------- actions (what buttons do) ---------- */
  const me = 'Alessia Bianchi';
  S.act = {
    pause(id) { const a = S.agent(id); a.status = 'paused'; a.ts = Date.now(); a.last = 'Paused by ' + me; S.addEvent({ agent: id, sev: 'info', plain: `Paused by ${me}`, tech: `agent.pause(id=${id}) by @a.bianchi` }); S.emit('agents'); },
    resume(id) { const a = S.agent(id); a.status = 'active'; bump(a, 0); a.last = 'Resumed by ' + me; S.addEvent({ agent: id, sev: 'info', plain: `Resumed by ${me}`, tech: `agent.resume(id=${id})` }); S.emit('agents'); },
    isolate(id) { const a = S.agent(id); a.status = 'isolated'; a.last = 'Access cut off'; S.addEvent({ agent: id, sev: 'block', plain: `Access cut off by ${me} — passwords removed, internet blocked`, tech: `agent.isolate(id=${id}) creds_revoked=${a.apis.length} egress=deny` }); S.emit('agents'); },
    restore(id) { const a = S.agent(id); a.status = 'paused'; a.last = 'Access restored (paused)'; S.addEvent({ agent: id, sev: 'info', plain: `Access restored by ${me}. The agent stays paused until resumed.`, tech: `agent.restore(id=${id}) creds_reissued` }); S.emit('agents'); },
    kill(id, reason) {
      const a = S.agent(id); a.status = 'terminated'; a.killedAt = Date.now(); a.killReason = reason; a.last = 'Stopped for good';
      const inc = { id: 'INC-' + (S.state.seq.inc++), title: `Emergency stop: ${id}`, agent: id, sev: 'critical', status: 'open', opened: Date.now(), euro: S.pending().filter((p) => p.agent === id).reduce((s, p) => s + p.amount, 0),
        timeline: [[Date.now() - 1800, `Emergency stop started by ${me} · reason: ${reason}`], [Date.now() - 1500, 'Passwords and app access removed'], [Date.now() - 1300, 'Internet access blocked'], [Date.now() - 900, 'Pending actions cancelled'], [Date.now() - 400, 'Agent process stopped'], [Date.now(), 'Sealed forensic snapshot saved']] };
      S.state.incidents.unshift(inc);
      S.state.approvals.forEach((p) => { if (p.agent === id && p.status === 'pending') { p.status = 'cancelled'; p.by = 'Emergency stop'; p.at = Date.now(); } });
      S.addEvent({ agent: id, sev: 'kill', plain: `Emergency stop by ${me} · reason: ${reason} · done in 1.8 s`, tech: `killswitch.execute(id=${id}) e2e=1.8s incident=${inc.id}` });
      S.emit('agents'); S.emit('approval');
      return inc;
    },
    decide(apId, decision) {
      const p = S.state.approvals.find((x) => x.id === apId); if (!p || p.status !== 'pending') return;
      p.status = decision; p.by = me; p.at = Date.now();
      const a = S.agent(p.agent);
      if (decision === 'rejected' && a) bump(a, -5);
      if (decision === 'approved' && a) bump(a, -2);
      S.addEvent({ agent: p.agent, sev: 'info', plain: `${decision === 'approved' ? 'Approved' : 'Rejected'} by ${me}: ${p.plain}`, tech: `approval.${decision}(id=${p.id})` });
      S.emit('approval'); S.emit('agents');
    },
    resolveIncident(id) { const i = S.state.incidents.find((x) => x.id === id); i.status = 'resolved'; i.timeline.push([Date.now(), `Marked resolved by ${me}`]); S.save(); S.emit('incident'); },
  };

  /* expire approvals after 15 minutes */
  function expire() {
    let ch = false;
    S.pending().forEach((p) => { if (Date.now() - p.created > 15 * 60e3) { p.status = 'expired'; p.by = 'Timer (auto-reject)'; p.at = Date.now(); ch = true; } });
    if (ch) { S.emit('approval'); S.save(); }
  }

  /* ---------- loops ---------- */
  setInterval(() => { if (!S.live) return; pushTick(); expire(); S.emit('tick'); }, 1000);
  setInterval(() => { if (S.live) generate(); }, 1400);
  S.boot = () => { if (!S.state.events.length) for (let i = 0; i < 12; i++) generate(); };
})();
