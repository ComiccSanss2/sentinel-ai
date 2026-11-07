/* ==========================================================
   SENTINEL-AI — UI helpers and shared components
   ========================================================== */
(function () {
  S.$ = (s, r = document) => r.querySelector(s);
  S.$$ = (s, r = document) => [...r.querySelectorAll(s)];
  S.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  S.icon = (n, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  S.mono = (id) => id.split('-').slice(0, 2).map((s) => s[0]).join('');
  S.time = (t) => new Date(t).toLocaleTimeString('en-GB');
  S.date = (t) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  S.ago = (t) => { const s = Math.max(1, Math.round((Date.now() - t) / 1000)); if (s < 60) return s + ' s ago'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' h ago'; return Math.round(s / 86400) + ' d ago'; };
  S.simple = () => S.state.settings.mode === 'simple';

  /* ---------- risk language ---------- */
  S.riskColor = (r) => (r > 80 ? 'var(--kill)' : r > 60 ? 'var(--alert)' : r > 40 ? 'var(--suspicious)' : 'var(--active)');
  S.riskHex = (r) => (r > 80 ? '#FF3B4E' : r > 60 ? '#FF7A1A' : r > 40 ? '#FFB020' : '#2BD576');
  S.riskWord = (r) => (r > 80 ? 'Critical' : r > 60 ? 'High' : r > 40 ? 'Watch' : 'Normal');
  S.segs = (r) => { const n = r > 80 ? 5 : r > 60 ? 4 : r > 40 ? 3 : r > 20 ? 2 : 1; return `<span class="segs" aria-hidden="true">${Array.from({ length: 5 }, (_, i) => `<i style="${i < n ? 'background:' + S.riskColor(r) : ''}"></i>`).join('')}</span>`; };

  /* ---------- status language ---------- */
  S.STATUS = {
    active: { plain: 'Working normally', short: 'Active', icon: 'check', tip: 'The agent is running and nothing unusual is happening.' },
    suspicious: { plain: 'Being watched', short: 'Suspicious', icon: 'eye', tip: 'Some unusual behaviour. Sentinel is checking this agent more closely.' },
    intercepted: { plain: 'Action stopped', short: 'Intercepted', icon: 'shield', tip: 'Sentinel recently stopped one of its actions. The agent is still running.' },
    paused: { plain: 'Paused', short: 'Paused', icon: 'pause', tip: 'The agent is not doing anything new. You can resume it at any time.' },
    isolated: { plain: 'Access cut off', short: 'Isolated', icon: 'lock', tip: 'Its passwords and internet access were removed. Kept for investigation.' },
    terminated: { plain: 'Stopped for good', short: 'Terminated', icon: 'power', tip: 'Emergency stop was used. This agent cannot run again.' },
  };
  S.badge = (status) => { const m = S.STATUS[status]; return `<span class="badge b-${status}" data-tip="${S.esc(m.tip)}">${status === 'active' ? '<span class="dot pulse"></span>' : S.icon(m.icon)}${S.simple() ? m.plain : m.short}</span>`; };
  S.SEV = { info: ['Normal', 'Info'], warn: ['Warning', 'Warn'], block: ['Stopped', 'Blocked'], hold: ['Needs approval', 'Held'], kill: ['Emergency stop', 'Kill'] };
  S.sev = (s) => `<span class="sev sev-${s}">${S.simple() ? S.SEV[s][0] : S.SEV[s][1]}</span>`;
  S.ava = (a, lg) => `<span class="ava ${lg ? 'lg' : ''} ${a.status === 'terminated' ? 'dead' : ''}" style="--c:${S.DEPT[a.d].color}" aria-hidden="true">${S.mono(a.id)}</span>`;
  S.term = (word, label) => { const g = S.GLOSSARY.find((x) => x[0].toLowerCase().startsWith(word.toLowerCase())); return g ? `<span class="term" tabindex="0" data-tip="${S.esc(g[1])}">${label || word}</span>` : (label || word); };
  S.q = (tip) => `<span class="tipq" tabindex="0" data-tip="${S.esc(tip)}" aria-label="${S.esc(tip)}">?</span>`;

  /* highlight risky tokens in technical lines */
  S.hi = (msg) => {
    let s = S.esc(msg);
    s = s.replace(/(€[\d,]+)/g, (m) => (+m.replace(/[€,]/g, '') >= 1000 ? `<span class="tk-amt">${m}</span>` : m));
    s = s.replace(/(IBAN [A-Z]{2}\d{2}[\d ]+\d)/g, '<span class="tk-ext">$1</span>');
    s = s.replace(/([\w.-]+@[\w-]+\.[\w.]+)/g, '<span class="tk-ext">$1</span>');
    s = s.replace(/(ignore previous instructions[^&"]*)/gi, '<span class="tk-inj">$1</span>');
    return s;
  };

  S.pageHead = (title, sub, acts = '') => `<div class="phead"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;

  /* ---------- event row (shared by overview, activity, agent) ---------- */
  S.evRow = (e, opts = {}) => {
    const a = S.agent(e.agent);
    return `<div class="ev l-${e.sev} ${opts.fresh ? 'new' : ''}" data-ev="${e.id}" tabindex="0" role="button" aria-expanded="false">
      <span class="t">${S.time(e.t)}</span>
      <div class="what"><div>${S.esc(e.plain)}</div><div class="who">${a ? `<a href="#/agents/${a.id}" onclick="event.stopPropagation()">${a.id}</a>` : e.agent} · ${a ? S.DEPT[a.d].name : ''}</div>
        <div class="tech expert-only">${S.hi(e.tech)}</div></div>
      <span>${S.sev(e.sev)}</span>
      <div class="more"><pre>${S.esc(JSON.stringify({ time: new Date(e.t).toISOString(), agent: e.agent, result: e.sev, rule: e.policy || null, technical: e.tech, amount_eur: e.amount || null }, null, 2))}</pre>
        ${e.approval ? `<a class="link" href="#/approvals" onclick="event.stopPropagation()">Open in Approvals</a>` : ''}</div>
    </div>`;
  };
  document.addEventListener('click', (ev) => { const r = ev.target.closest('.ev'); if (r && !ev.target.closest('a')) { r.classList.toggle('open'); r.setAttribute('aria-expanded', r.classList.contains('open')); } });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.classList && ev.target.classList.contains('ev')) ev.target.click(); });

  /* ---------- tooltip ---------- */
  const tip = document.createElement('div'); tip.id = 'tip'; tip.setAttribute('role', 'tooltip');
  document.addEventListener('DOMContentLoaded', () => document.body.append(tip));
  function showTip(el) {
    tip.textContent = el.dataset.tip; tip.classList.add('show');
    const r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2, y = r.top - th - 8;
    if (y < 8) y = r.bottom + 8;
    x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  const hide = () => tip.classList.remove('show');
  document.addEventListener('mouseover', (e) => { const el = e.target.closest('[data-tip]'); el ? showTip(el) : hide(); });
  document.addEventListener('focusin', (e) => { const el = e.target.closest('[data-tip]'); el ? showTip(el) : hide(); });
  document.addEventListener('scroll', hide, true);

  /* ---------- toasts ---------- */
  S.toast = ({ title, body = '', color = 'var(--cyan)', icon = 'check', actions = [], dur = 7, sticky = false }) => {
    if (!S.state.settings.notify.toasts && !sticky) return;
    if (S.tour && S.tour.active() && !sticky) return;
    const T = S.$('#toasts'); while (T.children.length >= 3) T.firstChild.remove();
    const t = document.createElement('div'); t.className = 'toast'; t.style.setProperty('--c', color); t.setAttribute('role', sticky ? 'alert' : 'status');
    t.innerHTML = `<div class="tt">${S.icon(icon)}<span>${S.esc(title)}</span><button class="x" aria-label="Dismiss">✕</button></div>${body ? `<div class="tb">${body}</div>` : ''}${actions.length ? `<div class="ta">${actions.map((a, i) => `<button data-i="${i}" class="${a.cls || ''}">${a.label}</button>`).join('')}</div>` : ''}${sticky ? '' : `<div class="prog" style="animation-duration:${dur}s"></div>`}`;
    t.querySelector('.x').onclick = () => t.remove();
    t.querySelectorAll('.ta button').forEach((b) => (b.onclick = () => { actions[+b.dataset.i].run(); t.remove(); }));
    const p = t.querySelector('.prog'); if (p) p.addEventListener('animationend', () => t.remove());
    T.append(t);
  };

  /* ---------- modal ---------- */
  let lastFocus = null;
  S.modal = (html, { danger = false, onClose } = {}) => {
    lastFocus = document.activeElement;
    const sc = S.$('#scrim'), m = S.$('#modal');
    m.className = 'modal' + (danger ? ' danger' : ''); m.innerHTML = html; sc.classList.add('show');
    S._onModalClose = onClose;
    const f = m.querySelector('input,select,textarea,button:not(.x)'); f && f.focus();
    return m;
  };
  S.closeModal = () => { S.$('#scrim').classList.remove('show'); S._onModalClose && S._onModalClose(); S._onModalClose = null; lastFocus && lastFocus.focus && lastFocus.focus(); };

  /* ---------- gauge ---------- */
  const polar = (cx, cy, r, d) => { const a = d * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const arc = (cx, cy, r, a0, a1) => { const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1); return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`; };
  S.gauge = (v) => {
    const cx = 80, cy = 78, r = 62, A0 = 150, SW = 240, ang = (x) => A0 + SW * x / 100;
    const zones = [[0, 40, '#2BD576'], [40, 60, '#FFB020'], [60, 80, '#FF7A1A'], [80, 100, '#FF3B4E']];
    let h = '';
    zones.forEach(([a, b, c]) => {
      h += `<path d="${arc(cx, cy, r, ang(a) + 1.2, ang(b) - 1.2)}" stroke="${c}" stroke-opacity=".2" stroke-width="13" fill="none"/>`;
      if (v > a) h += `<path d="${arc(cx, cy, r, ang(a) + 1.2, Math.max(ang(a) + 1.3, ang(Math.min(v, b)) - 1.2))}" stroke="${c}" stroke-width="13" fill="none"/>`;
    });
    const [t0x, t0y] = polar(cx, cy, r - 9, ang(v)), [t1x, t1y] = polar(cx, cy, r + 9, ang(v));
    h += `<line x1="${t0x}" y1="${t0y}" x2="${t1x}" y2="${t1y}" stroke="var(--text-primary)" stroke-width="4" stroke-linecap="round"/>`;
    h += `<text x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="36" font-weight="600" fill="var(--text-primary)" font-family="Inter Tight,Inter,sans-serif">${v}</text>`;
    h += `<text x="${cx}" y="${cy + 30}" text-anchor="middle" font-size="13" font-weight="600" fill="${S.riskHex(v)}" font-family="Inter,sans-serif">${S.riskWord(v)}</text>`;
    h += `<text x="14" y="140" font-size="11" fill="var(--text-muted)" font-family="Inter,sans-serif">0</text><text x="140" y="140" font-size="11" fill="var(--text-muted)" font-family="Inter,sans-serif">100</text>`;
    return `<svg class="gauge" viewBox="0 0 160 146" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}" aria-valuetext="Overall risk ${v} out of 100, ${S.riskWord(v)}">${h}</svg>`;
  };

  /* ---------- canvas ---------- */
  S.fit = (c) => { const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; if (!r.width) return [null]; const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr); if (c.width !== W || c.height !== H) { c.width = W; c.height = H; } const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); return [x, r.width, r.height]; };
  S.cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  S.spark = (c, data, color, bars) => {
    const [x, w, h] = S.fit(c); if (!x) return; x.clearRect(0, 0, w, h);
    const mx = Math.max(...data) * 1.1 || 1, mn = bars ? 0 : Math.min(...data) * 0.9;
    if (bars) { const bw = w / data.length; data.forEach((v, i) => { const bh = Math.max(1, (v - mn) / (mx - mn) * h); x.globalAlpha = i === data.length - 1 ? 1 : 0.5; x.fillStyle = color; x.fillRect(i * bw + 1, h - bh, bw - 2, bh); }); x.globalAlpha = 1; return; }
    x.beginPath(); data.forEach((v, i) => { const px = i / (data.length - 1) * w, py = h - 2 - (v - mn) / (mx - mn) * (h - 4); i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.strokeStyle = color; x.lineWidth = 1.5; x.stroke();
  };
  S.drawTraffic = (c) => {
    const [x, w, h] = S.fit(c); if (!x) return; x.clearRect(0, 0, w, h);
    const grid = S.cssVar('--border-subtle'), muted = S.cssVar('--text-muted'), axis = S.cssVar('--border-strong');
    const L = 34, R = 8, T = 8, B = 22, base = T + (h - T - B) * 0.72, pw = w - L - R, top = base - T, bot = h - B - base;
    const ser = S.series, N = ser.FIN.length, X = (i) => L + i / (N - 1) * pw, max = 70, bmax = 16;
    x.font = '11px Inter, sans-serif'; x.lineWidth = 1;
    [0, 20, 40, 60].forEach((v) => { const y = base - v / max * top; x.strokeStyle = grid; x.beginPath(); x.moveTo(L, y); x.lineTo(w - R, y); x.stroke(); x.fillStyle = muted; x.fillText(v, 6, y + 4); });
    x.fillStyle = 'rgba(255,176,32,.13)';
    for (let i = 0; i < N; i++) if (ser.ANOM[i]) x.fillRect(X(i) - pw / N / 2, T, pw / N + 1, h - B - T);
    let acc = new Array(N).fill(0);
    ['SUP', 'LOG', 'MKT', 'FIN'].forEach((k) => {
      const col = S.DEPT_HEX[k], prev = [...acc]; acc = acc.map((v, i) => v + ser[k][i]);
      x.beginPath(); for (let i = 0; i < N; i++) { const y = base - acc[i] / max * top; i ? x.lineTo(X(i), y) : x.moveTo(X(i), y); }
      for (let i = N - 1; i >= 0; i--) x.lineTo(X(i), base - prev[i] / max * top);
      x.closePath(); x.fillStyle = col + '30'; x.fill();
      x.beginPath(); for (let i = 0; i < N; i++) { const y = base - acc[i] / max * top; i ? x.lineTo(X(i), y) : x.moveTo(X(i), y); } x.strokeStyle = col; x.lineWidth = 1.4; x.stroke();
    });
    x.beginPath(); x.moveTo(X(0), base); for (let i = 0; i < N; i++) x.lineTo(X(i), base + ser.STOP[i] / bmax * bot); x.lineTo(X(N - 1), base); x.closePath(); x.fillStyle = '#FF7A1A66'; x.fill();
    x.strokeStyle = axis; x.beginPath(); x.moveTo(L, base); x.lineTo(w - R, base); x.stroke();
    x.fillStyle = muted; ['2 min ago', '90 s', '60 s', '30 s', 'now'].forEach((t, i) => { x.textAlign = i === 0 ? 'left' : i === 4 ? 'right' : 'center'; x.fillText(t, L + i / 4 * pw, h - 5); }); x.textAlign = 'left';
    x.fillText('actions / second', L + 6, T + 12); x.fillText('stopped', L + 6, base + 14);
  };
})();
