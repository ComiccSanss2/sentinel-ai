/* ==========================================================
   SENTINEL-AI — app shell, router and global behaviours
   ========================================================== */
(function () {
  const NAV = [
    ['Watch', [['overview', 'Overview', 'grid'], ['agents', 'Agents', 'bot'], ['activity', 'Activity', 'list']]],
    ['Act', [['approvals', 'Approvals', 'inbox'], ['incidents', 'Incidents', 'alert']]],
    ['Set up', [['rules', 'Rules', 'sliders'], ['apps', 'Connected apps', 'plug'], ['settings', 'Settings', 'cog']]],
    ['', [['help', 'Help and guide', 'help']]],
  ];

  S.applySettings = () => {
    const s = S.state.settings;
    document.documentElement.dataset.theme = s.theme;
    document.documentElement.dataset.size = s.size;
    document.body.classList.toggle('simple', s.mode === 'simple');
    S.$$('#modeToggle button').forEach((b) => b.classList.toggle('on', b.dataset.v === s.mode));
    const th = S.$('#themeBtn'); if (th) { th.innerHTML = S.icon(s.theme === 'dark' ? 'sun' : 'moon'); th.dataset.tip = s.theme === 'dark' ? 'Switch to light colours' : 'Switch to dark colours'; }
    if (current) route(true);
  };

  function shell() {
    document.getElementById('root').innerHTML = `
    <a class="sr" href="#content">Skip to content</a>
    <div class="shell">
      <aside class="side" aria-label="Main menu">
        <a class="brand" href="index.html" title="Back to the Sentinel-AI website">
          <svg width="30" height="30" viewBox="0 0 36 36" aria-hidden="true"><path d="M18 2l14 8v16l-14 8-14-8V10z" fill="#0E7490" fill-opacity=".3" stroke="#22D3EE" stroke-width="1.6"/><path d="M18 8v20" stroke="#22D3EE" stroke-width="2"/><circle cx="18" cy="18" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
          <b>SENTINEL<span>-AI</span></b></a>
        ${NAV.map(([g, items]) => `<div class="navgroup">${g ? `<p>${g}</p>` : ''}<nav class="nav">${items.map(([k, n, ic]) => `<a href="#/${k}" data-nav="${k}">${S.icon(ic)}<span>${n}</span>${k === 'approvals' ? '<span class="count" id="navAp"></span>' : k === 'incidents' ? '<span class="count red" id="navInc"></span>' : ''}</a>`).join('')}</nav></div>`).join('')}
        <div class="foot">Signed in as <b>Alessia Bianchi</b><br>Admin · on call this week<br><span class="muted">Demo company: Acme Italia S.p.A.</span></div>
      </aside>
      <div class="main">
        <header class="top">
          <button class="iconBtn menuBtn" id="menuBtn" aria-label="Open menu">${S.icon('menu')}</button>
          <span class="env hideSm" data-tip="You are looking at the live (production) agents, not a test environment.">Live company data</span>
          <div class="search" style="position:relative">${S.icon('search')}<input id="gq" placeholder="Search agents, rules, pages…  ( / )" aria-label="Search"><div class="sresults" id="gres" role="listbox"></div></div>
          <span class="spacer"></span>
          <div class="seg" id="modeToggle" role="group" aria-label="Words on screen" data-tip="Simple: plain words. Expert: adds technical details."><button data-v="simple">Simple</button><button data-v="expert">Expert</button></div>
          <button class="live" id="liveBtn" aria-pressed="true" data-tip="Live updates are on. Click to freeze the screen.">${'<span class="dot pulse"></span>'}<span class="hideSm">Live</span></button>
          <button class="iconBtn" id="themeBtn" aria-label="Change colours"></button>
          <a class="iconBtn" href="#/help" aria-label="Help" data-tip="Help and guide">${S.icon('help')}</a>
          <span class="avatar" data-tip="Alessia Bianchi · Admin">AB</span>
        </header>
        <div class="banner" id="banner" role="alert">${S.icon('warn')}<span id="bannerText"></span><a href="#" id="bannerLink">Look now</a></div>
        <main class="content" id="content" tabindex="-1"></main>
      </div>
    </div>
    <div class="armedFrame" id="armedFrame"></div>
    <div class="scrim" id="scrim"><div class="modal" id="modal" role="dialog" aria-modal="true"></div></div>
    <div class="toasts" id="toasts" aria-live="polite"></div>`;

    S.$$('#modeToggle button').forEach((b) => (b.onclick = () => { S.state.settings.mode = b.dataset.v; S.save(); S.applySettings(); }));
    S.$('#themeBtn').onclick = () => { S.state.settings.theme = S.state.settings.theme === 'dark' ? 'light' : 'dark'; S.save(); S.applySettings(); };
    S.$('#liveBtn').onclick = () => { S.live = !S.live; const b = S.$('#liveBtn'); b.classList.toggle('off', !S.live); b.setAttribute('aria-pressed', S.live); b.querySelector('.dot').classList.toggle('pulse', S.live); b.dataset.tip = S.live ? 'Live updates are on. Click to freeze the screen.' : 'Screen frozen. Click to resume live updates.'; };
    S.$('#menuBtn').onclick = () => document.body.classList.toggle('navopen');
    S.$('#scrim').addEventListener('click', (e) => { if (e.target.id === 'scrim' && !S.$('#modal').classList.contains('danger')) S.closeModal(); });
    search();
  }

  /* ---------- global search ---------- */
  function search() {
    const q = S.$('#gq'), res = S.$('#gres');
    const pages = NAV.flatMap((g) => g[1]).map(([k, n]) => ({ label: n, sub: 'Page', href: '#/' + k, icon: 'grid' }));
    let hl = 0, items = [];
    const draw = () => { res.innerHTML = items.map((it, i) => `<a href="${it.href}" class="${i === hl ? 'hl' : ''}" role="option">${S.icon(it.icon)}<span>${S.esc(it.label)}<br><span class="sec" style="font-size:12px">${S.esc(it.sub)}</span></span></a>`).join('') || '<div class="empty" style="padding:14px">No results</div>'; res.classList.add('show'); };
    q.oninput = () => {
      const v = q.value.trim().toLowerCase(); if (!v) { res.classList.remove('show'); return; }
      items = [
        ...S.state.agents.filter((a) => (a.id + a.does + S.DEPT[a.d].name).toLowerCase().includes(v)).map((a) => ({ label: a.id, sub: S.DEPT[a.d].name + ' agent', href: '#/agents/' + a.id, icon: 'bot' })),
        ...S.state.policies.filter((p) => (p.name + p.desc + p.id).toLowerCase().includes(v)).map((p) => ({ label: p.name, sub: 'Rule', href: '#/rules', icon: 'sliders' })),
        ...pages.filter((p) => p.label.toLowerCase().includes(v)),
      ].slice(0, 8);
      hl = 0; draw();
    };
    q.onkeydown = (e) => {
      if (e.key === 'ArrowDown') { hl = Math.min(items.length - 1, hl + 1); draw(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { hl = Math.max(0, hl - 1); draw(); e.preventDefault(); }
      if (e.key === 'Enter' && items[hl]) { location.hash = items[hl].href; q.value = ''; res.classList.remove('show'); q.blur(); }
      if (e.key === 'Escape') { q.value = ''; res.classList.remove('show'); q.blur(); }
    };
    q.onblur = () => setTimeout(() => res.classList.remove('show'), 150);
  }

  /* ---------- router ---------- */
  let current = null;
  function route(keepScroll) {
    const parts = (location.hash.replace(/^#\/?/, '') || 'overview').split('/');
    let key = parts[0], params = parts.slice(1);
    if (key === 'agents' && params.length) key = 'agent';
    const page = S.pages[key] || S.pages.overview;
    if (current && current !== page && current.leave) current.leave();
    current = page;
    const main = S.$('#content');
    const y = window.scrollY;
    page.render(main, params);
    document.title = `${page.title} · Sentinel-AI`;
    const navKey = key === 'agent' ? 'agents' : key;
    S.$$('[data-nav]').forEach((a) => { const on = a.dataset.nav === navKey; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
    document.body.classList.remove('navopen');
    if (keepScroll === true) window.scrollTo(0, y); else { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
    chrome();
  }
  window.addEventListener('hashchange', () => route());

  /* ---------- global chrome: counts + banner ---------- */
  function chrome() {
    const n = S.pending().length, inc = S.state.incidents.filter((i) => i.status === 'open').length;
    const ap = S.$('#navAp'); ap.textContent = n; ap.style.display = n ? '' : 'none';
    const ic = S.$('#navInc'); ic.textContent = inc; ic.style.display = inc ? '' : 'none';
    const crit = S.state.agents.filter((a) => a.risk > 80 && !['terminated', 'isolated'].includes(a.status));
    const bn = S.$('#banner');
    bn.classList.toggle('show', crit.length > 0);
    if (crit.length) {
      S.$('#bannerText').textContent = crit.length === 1 ? `${crit[0].id} is at critical risk. Sentinel is stopping its risky actions — please check it.` : `${crit.length} agents are at critical risk: ${crit.map((a) => a.id).join(', ')}`;
      S.$('#bannerLink').href = '#/agents/' + crit[0].id;
    }
  }

  /* ---------- live wiring (throttled so screens stay calm) ---------- */
  let agentsT = 0, agentsPending = false;
  S.on('tick', () => { current && current.tick && current.tick(); if (agentsPending && Date.now() - agentsT > 2500) flushAgents(); });
  function flushAgents() { agentsPending = false; agentsT = Date.now(); chrome(); if (current && current.onAgents && !document.querySelector('.content :focus-within select, .content input:focus')) current.onAgents(); }
  S.on('agents', () => { if (Date.now() - agentsT > 2500) flushAgents(); else agentsPending = true; });
  S.on('event', (e) => {
    current && current.onEvent && current.onEvent(e);
    if (e.sev === 'block' && Math.random() < 0.35) {
      S.toast({ title: /€/.test(e.plain) ? 'Payment stopped' : /hidden/i.test(e.plain) ? 'Attack blocked' : 'Action stopped', body: `<b>${e.agent}</b> — ${S.esc(e.plain)}`, color: 'var(--alert)', icon: 'shield', actions: [{ label: 'See details', run: () => (location.hash = '#/agents/' + e.agent) }, { label: 'Pause agent', cls: 'v', run: () => { S.act.pause(e.agent); S.toast({ title: 'Agent paused', body: e.agent, color: 'var(--paused)', icon: 'pause' }); } }], dur: 9 });
    }
  });
  S.on('approval', (ap) => {
    chrome(); current && current.onApproval && current.onApproval();
    if (ap && ap.status === 'pending') S.toast({ title: 'Approval needed', body: `<b>${ap.agent}</b> wants to: ${S.esc(ap.plain)}`, color: 'var(--paused)', icon: 'inbox', actions: [{ label: 'Open approvals', run: () => (location.hash = '#/approvals') }], dur: 10 });
  });
  S.on('incident', chrome);

  /* ---------- keyboard ---------- */
  let gPressed = 0;
  document.addEventListener('keydown', (e) => {
    const typing = /input|select|textarea/i.test(document.activeElement.tagName);
    if (e.key === 'Escape') {
      if (S.tour.active()) { S.tour.end(); return; }
      if (S.$('#scrim').classList.contains('show')) { const c = S.$('#kCancel'); if (!c || !c.disabled) S.closeModal(); return; }
    }
    if (typing) return;
    if (current && current.key && current.key(e)) return;
    if (e.key === '/') { e.preventDefault(); S.$('#gq').focus(); }
    if (e.key === 'g') { gPressed = Date.now(); return; }
    if (Date.now() - gPressed < 800) { const map = { a: 'approvals', o: 'overview', g: 'agents', r: 'rules', h: 'help' }; if (map[e.key]) location.hash = '#/' + map[e.key]; }
  });

  /* ---------- boot ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    shell(); S.boot(); S.applySettings(); route();
    if (!S.state.settings.tourDone) setTimeout(() => S.tour.start(), 700);
  });
})();
