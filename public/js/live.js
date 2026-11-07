/* ==========================================================
   SENTINEL-AI — live data layer
   Talks to the Sentinel server: loads state, listens to live
   updates (Server-Sent Events) and sends your actions.
   ========================================================== */
(function () {
  /* ---------- event bus ---------- */
  const handlers = {};
  S.on = (n, fn) => { (handlers[n] = handlers[n] || []).push(fn); };
  S.emit = (n, d) => (handlers[n] || []).forEach((fn) => { try { fn(d); } catch (e) { console.error(e); } });

  /* ---------- API ---------- */
  S.api = async (method, path, body) => {
    const r = await fetch(path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Sentinel': '1' }, body: body ? JSON.stringify(body) : undefined });
    let data = null; try { data = await r.json(); } catch (e) {}
    if (r.status === 401 && path !== '/api/auth/login') { location.href = 'login.html'; throw new Error('Please sign in'); }
    if (!r.ok) { const err = new Error((data && data.message) || `Request failed (${r.status})`); err.code = data && data.error; throw err; }
    return data;
  };
  S.fail = (e) => S.toast({ title: 'That did not work', body: S.esc(e.message), color: 'var(--kill)', icon: 'warn', sticky: true });

  /* ---------- local display settings (per browser) ---------- */
  const SKEY = 'sentinel-settings';
  const defaults = { mode: 'simple', theme: 'dark', size: 'normal', tourDone: false, welcomeHidden: false, notify: { toasts: true } };
  let settings = defaults;
  try { settings = { ...defaults, ...JSON.parse(localStorage.getItem(SKEY) || '{}') }; } catch (e) {}
  S.save = () => { try { localStorage.setItem(SKEY, JSON.stringify(S.state.settings)); } catch (e) {} };

  /* ---------- load ---------- */
  S.load = async () => {
    const d = await S.api('GET', '/api/state');
    S.state = { ...d, settings: S.state ? S.state.settings : settings };
    S.buildTeams();
    S.role = d.me.role;
    return S.state;
  };
  S.refresh = async () => { await S.load(); S.emit('agents'); S.emit('approval'); S.emit('policies'); };

  /* ---------- live stream ---------- */
  S.connect = () => {
    const es = new EventSource('/api/stream');
    const upsert = (list, item, key = 'id') => { const i = list.findIndex((x) => x[key] === item[key]); if (i >= 0) list[i] = item; else list.unshift(item); };
    es.addEventListener('event', (m) => {
      const e = JSON.parse(m.data);
      S.state.events.unshift(e); if (S.state.events.length > 600) S.state.events.length = 600;
      const c = S.state.counters;
      if (e.kind === 'action') c.actions++;
      if (e.sev === 'block') c.stopped++;
      if (e.sev === 'hold') c.held++;
      if (e.injection) c.injections++;
      if (e.sev === 'block' || e.sev === 'hold') c.eur += e.amount || 0;
      if (S.live) S.emit('event', e);
    });
    es.addEventListener('agents', (m) => { S.state.agents = JSON.parse(m.data); S.buildTeams(); S.emit('agents'); });
    es.addEventListener('approval', (m) => { const p = JSON.parse(m.data); const isNew = !S.state.approvals.some((x) => x.id === p.id); upsert(S.state.approvals, p); S.emit('approval', isNew ? p : null); });
    es.addEventListener('incident', (m) => { upsert(S.state.incidents, JSON.parse(m.data)); S.emit('incident'); });
    es.addEventListener('policies', (m) => { S.state.policies = JSON.parse(m.data); S.emit('policies'); });
    es.onopen = () => { S.online = true; S.emit('online', true); };
    es.onerror = () => { S.online = false; S.emit('online', false); };
    S._es = es;
  };
  // risk decays over time on the server: refresh the agent list every 30 s
  setInterval(async () => { try { const d = await S.api('GET', '/api/state'); S.state.agents = d.agents; S.state.counters = d.counters; S.state.policies = d.policies; S.buildTeams(); S.emit('agents'); } catch (e) {} }, 30000);

  /* ---------- helpers used by pages ---------- */
  S.agent = (id) => S.state.agents.find((a) => a.id === id);
  S.policy = (id) => S.state.policies.find((p) => p.id === id);
  S.pending = () => S.state.approvals.filter((a) => a.status === 'pending');
  S.alive = (a) => !['terminated', 'isolated', 'paused'].includes(a.status);
  S.can = (role) => ({ admin: 3, analyst: 2, viewer: 1 }[S.role] >= { admin: 3, analyst: 2, viewer: 1 }[role]);
  S.fmtEur = (n) => '€' + Math.round(n || 0).toLocaleString('en-US');
  S.live = true;
  S.globalRisk = () => {
    const live = S.state.agents.filter((a) => a.status !== 'terminated');
    if (!live.length) return 0;
    const sorted = live.map((a) => a.risk).sort((a, b) => b - a);
    const top = sorted.slice(0, 3).reduce((s, v) => s + v, 0) / Math.min(3, sorted.length);
    const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
    return Math.round(Math.min(99, avg * 0.55 + top * 0.45));
  };

  /* activity series for the chart: actions per second, last 120 s, by team */
  S.series = { teams: {}, STOP: [], ANOM: [] };
  S.buildSeries = () => {
    const N = 120, end = Math.floor(Date.now() / 1000), teams = {};
    Object.keys(S.DEPT).forEach((k) => (teams[k] = new Array(N).fill(0)));
    const stop = new Array(N).fill(0);
    for (const e of S.state.events) {
      const s = Math.floor(e.t / 1000), i = N - 1 - (end - s);
      if (i < 0) break;
      if (i >= N) continue;
      if (e.kind === 'action') { if (!teams[e.team]) teams[e.team] = new Array(N).fill(0); teams[e.team][i]++; }
      if (e.sev === 'block' || e.sev === 'hold') stop[i]++;
    }
    S.series = { teams, STOP: stop, ANOM: stop.map((v) => (v ? 1 : 0)) };
  };

  /* ---------- actions ---------- */
  const enc = encodeURIComponent;
  S.act = {
    pause: (id) => S.api('POST', `/api/agents/${enc(id)}/pause`),
    resume: (id) => S.api('POST', `/api/agents/${enc(id)}/resume`),
    isolate: (id) => S.api('POST', `/api/agents/${enc(id)}/isolate`),
    restore: (id) => S.api('POST', `/api/agents/${enc(id)}/restore`),
    kill: (id, reason, confirm) => S.api('POST', `/api/agents/${enc(id)}/kill`, { reason, confirm }),
    decide: (apId, decision) => S.api('POST', `/api/approvals/${enc(apId)}/decide`, { decision }),
    resolveIncident: (id) => S.api('POST', `/api/incidents/${enc(id)}/resolve`, {}),
  };

  setInterval(() => { if (S.live && S.state) S.emit('tick'); }, 1000);
})();
