/* Agent detail — real decisions, controls, emergency stop, settings */
S.pages.agent = {
  title: 'Agent',
  tab: 'decided',
  render(el, params) {
    const a = S.agent(decodeURIComponent(params[0] || ''));
    if (!a) { el.innerHTML = `<div class="card empty"><b>Agent not found</b><a href="#/agents">Back to all agents</a></div>`; return; }
    this.a = a; this.el = el; this._lastSt = a.status; this.title = a.id; this.actions = null; this.sel = null;
    el.innerHTML = `
      <div class="crumb"><a href="#/agents">${S.icon('arrow-left')} All agents</a><span>/</span><span>${S.esc(S.team(a.d).name)}</span></div>
      <div class="dhead">${S.ava(a, true)}<div><h1>${a.id}</h1><div class="sec">${S.esc(a.does || 'No description yet.')}</div></div><span id="dBadge"></span><div class="score" id="dScore"></div></div>
      <div id="dRibbon"></div>
      <div class="tabs" role="tablist"><button data-t="decided" role="tab">How it decided</button><button data-t="activity" role="tab">Activity</button><button data-t="access" role="tab">What it can do</button>${S.can('admin') ? '<button data-t="setup" role="tab">Connection and settings</button>' : ''}</div>
      <div class="dgrid"><div id="dMain"></div><aside class="card pad control" id="dCtl" aria-label="Controls"></aside></div>`;
    S.$$('.tabs [data-t]').forEach((b) => (b.onclick = () => { this.tab = b.dataset.t; this.main(); }));
    this.head(); this.main(); this.controls();
  },
  head() {
    const a = this.a = S.agent(this.a.id) || this.a;
    S.$('#dBadge').innerHTML = S.badge(a.status);
    S.$('#dScore').innerHTML = `<b style="color:${S.riskColor(a.risk)}">${Math.round(a.risk)}</b><span class="sec"> / 100</span><div class="help">Risk: ${S.riskWord(a.risk).toLowerCase()} ${S.q('Rises each time an action is stopped or held, then slowly goes back down (it halves every 30 minutes). 0–40 normal, 41–60 watch, 61–80 high, 81–100 critical.')}</div>`;
    S.$('#dRibbon').innerHTML = a.status === 'terminated' ? `<div class="ribbon">${S.icon('power')} <b>Stopped for good</b> on ${S.date(a.killedAt)} · reason: ${S.esc(a.killReason)}. Its key is revoked; this page is now a read-only record.</div>`
      : a.status === 'isolated' ? `<div class="ribbon" style="border-style:dashed">${S.icon('lock')} <b>Access cut off.</b> Every call from this agent is refused. An admin can restore it.</div>`
      : !a.connected ? `<div class="ribbon" style="border-color:color-mix(in srgb,var(--cyan) 45%,transparent);background:var(--cyan-tint)">${S.icon('info')} <b>Not connected yet.</b> This agent has not called Sentinel so far. ${S.can('admin') ? 'Open “Connection and settings” to see the code to add.' : ''}</div>` : '';
  },
  async loadActions() {
    try { this.actions = await S.api('GET', `/api/agents/${encodeURIComponent(this.a.id)}/actions`); } catch (e) { this.actions = []; }
    if (this.tab === 'decided') this.main();
  },
  main() {
    const a = this.a, box = S.$('#dMain'); if (!box) return;
    S.$$('.tabs [data-t]').forEach((b) => { b.classList.toggle('on', b.dataset.t === this.tab); b.setAttribute('aria-selected', b.dataset.t === this.tab); });
    if (this.tab === 'decided') { if (!this.actions) { box.innerHTML = '<div class="card empty">Loading…</div>'; this.loadActions(); return; } box.innerHTML = this.trace(); this.bindTrace(); }
    if (this.tab === 'activity') { const ev = S.state.events.filter((e) => e.agent === a.id).slice(0, 60); box.innerHTML = `<section class="card"><div class="chead"><h2>Recent activity</h2><span class="right help">Click a line for details</span></div><div class="evlist">${ev.map((e) => S.evRow(e)).join('') || '<div class="empty"><b>No activity recorded yet</b>New actions appear here as they happen.</div>'}</div></section>`; }
    if (this.tab === 'access') {
      box.innerHTML = `<section class="card pad"><h2 style="font:600 15px var(--sans);margin-bottom:6px">What it is allowed to do</h2><p class="help" style="margin-bottom:6px">Described by ${S.esc(a.owner || 'its owner')}. Sentinel enforces your <a href="#/rules">rules</a> on every action, whatever is written here.</p>
        ${a.perms.length ? a.perms.map((p) => `<div class="perm">${S.icon('check')}<span>${S.esc(p)}</span></div>`).join('') : '<p class="sec">No permissions described yet.</p>'}
        <p class="help mt">Apps it uses: ${a.apis.length ? S.esc(a.apis.join(', ')) : 'not described'}</p>${a.model ? `<p class="help">AI model: <span class="mono">${S.esc(a.model)}</span></p>` : ''}</section>`;
    }
    if (this.tab === 'setup') this.setup(box);
  },
  trace() {
    const list = this.actions || [];
    if (!list.length) return `<section class="card empty"><b>No decisions yet</b>When this agent sends its first action to Sentinel, you will see here, step by step, what it received, what it thought, what it wanted to do and what Sentinel decided.</section>`;
    const risky = list.filter((x) => x.decision !== 'allow');
    const act = list.find((x) => x.id === this.sel) || risky[0] || list[0];
    const json = (o) => S.esc(JSON.stringify(o, null, 2)).replace(/&quot;([^&]+)&quot;:/g, '<span class="jk">"$1"</span>:').replace(/: &quot;([^&]*)&quot;/g, ': <span class="js">"$1"</span>').replace(/: (-?\d[\d.]*)/g, ': <span class="jn">$1</span>');
    const ctx = act.context || {};
    const step = (n, title, plain, extra = '', style = '') => `<div class="step" style="${style}"><span class="snum">${n}</span><div class="sbox"><h3>${title}</h3><div class="plain">${plain}</div>${extra}</div></div>`;
    const vmap = { allow: ['info', 'Allowed'], warn: ['warn', 'Allowed with a warning'], hold: ['hold', 'Held — waiting for a person'], block: ['block', 'Stopped'] };
    const v = vmap[act.decision];
    const statusWord = { allowed: 'Allowed', blocked: 'Stopped', pending: 'Waiting for a decision', approved: `Approved by ${act.decidedBy}`, rejected: `Rejected by ${act.decidedBy}`, expired: 'Rejected automatically (no decision in time)', cancelled: 'Cancelled by emergency stop' }[act.status] || act.status;
    const pend = S.state.approvals.find((p) => p.actionId === act.id && p.status === 'pending');
    const rail = act.decision === 'hold' ? 'var(--paused)' : act.decision === 'block' ? 'var(--alert)' : act.decision === 'warn' ? 'var(--suspicious)' : 'var(--active)';
    const res = act.result ? (act.result.ok ? `The agent reported success. <span class="expert-only mono">${S.esc(act.result.output)}</span>` : `The agent reported an error: ${S.esc(act.result.error)}`) : ['allowed', 'approved'].includes(act.status) ? 'Allowed. The agent has not reported the result yet.' : 'The action was not executed.';
    return `<section class="card"><div class="chead"><h2>How it decided</h2><span class="right"><select class="inp" id="actSel" aria-label="Choose an action" style="max-width:320px">${list.slice(0, 30).map((x) => `<option value="${x.id}" ${x.id === act.id ? 'selected' : ''}>${S.time(x.t)} · ${S.esc((x.summary || x.action).slice(0, 48))} · ${vmap[x.decision][1].split(' —')[0]}</option>`).join('')}</select></span></div>
      <div class="trace">
        ${step(1, 'What it received', ctx.input ? `${ctx.input_source ? S.esc(ctx.input_source) + ':' : 'Text the agent was working from:'}` : 'The agent did not send the text it was working from.', ctx.input ? `<div class="untrusted raw">${S.hi(ctx.input)}</div><div class="help mt-s">Dashed box = text from outside, which cannot be trusted. Red underlines = hidden instructions Sentinel recognised.</div>` : '')}
        ${step(2, 'What it thought', ctx.reasoning ? S.esc(ctx.reasoning) : 'No reasoning was sent by the agent.')}
        ${step(3, 'What it looked up', (ctx.sources || []).length ? (ctx.sources || []).map((s) => `• ${S.esc(typeof s === 'string' ? s : JSON.stringify(s))}`).join('<br>') : 'No sources were sent by the agent.')}
        ${step(4, 'What it wanted to do', `<b>${S.esc(act.summary || act.action)}</b>`, `<div class="raw"><span class="mono">${S.esc(act.action)}</span>\n${json(act.params)}</div>`, '--rail:var(--cyan)')}
        ${step(5, 'What Sentinel decided', `<span class="sev sev-${v[0]}">${v[1]}</span>`, `${act.reasons.length ? `<ul style="margin:8px 0 0 18px;display:flex;flex-direction:column;gap:4px">${act.reasons.map((r) => `<li><b>${S.esc(r.name)}</b>: ${S.esc(r.detail)}</li>`).join('')}</ul>` : '<div class="help mt-s">No rule was broken.</div>'}
          ${pend && S.can('analyst') ? `<div class="row wrap mt"><button class="btn ok" data-dec="approved" data-ap="${pend.id}">${S.icon('check')} Approve</button><button class="btn danger" data-dec="rejected" data-ap="${pend.id}">${S.icon('x')} Reject</button></div><div class="help mt-s">The agent is waiting for your answer right now.</div>` : ''}`, `--rail:${rail}`)}
        ${step(6, 'Result', `<b>${S.esc(statusWord)}.</b> ${res}`)}
      </div></section>`;
  },
  bindTrace() { const s = S.$('#actSel'); if (s) s.onchange = () => { this.sel = s.value; this.main(); }; },
  setup(box) {
    const a = this.a, url = S.state.server.publicUrl;
    box.innerHTML = `<section class="card pad">
      <h2 style="font:600 15px var(--sans)">Details</h2>
      <div class="grid g2 mt" style="grid-template-columns:1fr 1fr">
        <label class="field">Team<input class="inp" id="eTeam" value="${S.esc(a.team)}"></label>
        <label class="field">Owner<input class="inp" id="eOwner" value="${S.esc(a.owner)}"></label>
        <label class="field" style="grid-column:1/-1">What it does<input class="inp" id="eDoes" value="${S.esc(a.does)}"></label>
        <label class="field">AI model (optional)<input class="inp" id="eModel" value="${S.esc(a.model)}"></label>
        <label class="field">Apps it uses (comma separated)<input class="inp" id="eTools" value="${S.esc(a.apis.join(', '))}"></label>
        <label class="field" style="grid-column:1/-1">What it is allowed to do (comma separated)<input class="inp" id="ePerms" value="${S.esc(a.perms.join(', '))}"></label>
        <label class="field" style="grid-column:1/-1"><span>Stop endpoint (optional) ${S.q('A web address of your agent. When you pause, cut off or stop the agent, Sentinel calls it with a signed message so the agent process can shut down immediately.')}</span><input class="inp mono" id="eCtl" placeholder="https://my-agent.example.com/sentinel-control" value="${S.esc(a.controlUrl)}"></label>
      </div>
      <div class="row mt"><button class="btn primary" id="eSave">Save changes</button></div>
    </section>
    <section class="card pad mt"><h2 style="font:600 15px var(--sans)">API key</h2>
      <p class="help mt-s">Current key starts with <span class="mono">${S.esc(a.keyPrefix)}</span>. If you think it leaked, create a new one: the old key stops working immediately.</p>
      <div class="row mt"><button class="btn orange" id="eRotate" ${a.status === 'terminated' ? 'disabled' : ''}>Create a new key</button></div><div id="eKey"></div>
      <p class="help mt">Code to connect it is on the <a href="#/connect">Connect page</a>. API address: <span class="mono">${S.esc(url)}</span></p></section>
    <section class="card pad mt"><h2 style="font:600 15px var(--sans)">Remove this agent</h2><p class="help mt-s">Deletes it from the list and blocks its key. Its history stays in the audit log.</p><div class="row mt"><button class="btn danger" id="eDel">Remove agent</button></div></section>`;
    const v = (id) => S.$('#' + id).value;
    S.$('#eSave').onclick = async () => { try { await S.api('PUT', `/api/agents/${encodeURIComponent(a.id)}`, { team: v('eTeam'), owner: v('eOwner'), description: v('eDoes'), model: v('eModel'), tools: v('eTools'), permissions: v('ePerms'), controlUrl: v('eCtl') }); S.toast({ title: 'Saved', body: a.id }); } catch (e) { S.fail(e); } };
    S.$('#eRotate').onclick = async () => { try { const r = await S.api('POST', `/api/agents/${encodeURIComponent(a.id)}/rotate-key`); S.$('#eKey').innerHTML = S.keyBox(r.apiKey, r.webhookSecret); } catch (e) { S.fail(e); } };
    S.$('#eDel').onclick = () => {
      S.modal(`<header>${S.icon('warn')}<div><h2>Remove ${a.id}?</h2><p>Its key stops working. Its history stays in the audit log.</p></div></header><footer style="padding-top:16px"><button class="btn" id="dC">Cancel</button><button class="btn danger" id="dG">Remove agent</button></footer>`);
      S.$('#dC').onclick = S.closeModal;
      S.$('#dG').onclick = async () => { try { await S.api('DELETE', `/api/agents/${encodeURIComponent(a.id)}`); S.closeModal(); location.hash = '#/agents'; S.toast({ title: 'Agent removed', body: a.id }); } catch (e) { S.fail(e); } };
    };
  },
  controls() {
    const a = this.a, box = S.$('#dCtl'), st = a.status, dead = st === 'terminated';
    const an = S.can('analyst'), ad = S.can('admin');
    box.innerHTML = `<h2 style="font:600 15px var(--sans)">Controls</h2>
      <div class="statusExplain mt-s"><b>${S.STATUS[st].plain}.</b> ${S.STATUS[st].tip}</div>
      ${!an ? '<p class="help mt">You have the Viewer role, so you can look but not change anything.</p>' : `<div class="ctl mt">
        ${dead ? '' : st === 'isolated' ? (ad ? `<div class="opt"><button class="btn" id="cRestore">${S.icon('lock')} Restore access</button><p>Unblocks its key. It stays paused until you resume it.</p></div>` : '')
          : `<div class="opt"><button class="btn violet" id="cPause">${S.icon(st === 'paused' ? 'play' : 'pause')} ${st === 'paused' ? 'Resume agent' : 'Pause agent'}</button><p>${st === 'paused' ? 'Sentinel starts answering its requests again.' : 'Sentinel answers “no” to all its actions until resumed. Safe and undoable.'}</p></div>
             <div class="opt"><button class="btn orange" id="cIso">${S.icon('lock')} Cut off access</button><p>Blocks its API key: every call is refused. Use it if you think it was tricked or hacked.</p></div>`}
        ${ad ? `<div class="opt"><div style="font-weight:600;margin-bottom:8px">${S.term('Emergency stop', 'Emergency stop')}</div>
          <div class="ks ${dead ? 'done' : ''}" id="ks"><button class="ks-btn" id="ksBtn" ${dead ? 'disabled' : ''} aria-describedby="ksHelp">${S.icon('power')} ${dead ? 'Stopped' : 'Emergency stop'}</button>${dead ? '' : '<button class="ks-cover" id="ksCover" aria-label="Lift the safety cover to arm the emergency stop">Lift the cover to arm</button>'}</div>
          <p id="ksHelp">${dead ? 'This agent was stopped for good. Register a new agent to run it again.' : 'Stops the agent for good. Step 1: lift the cover (or press <kbd>K</kbd>). Step 2: confirm.'}</p></div>` : '<p class="help">Only admins can use the emergency stop.</p>'}
      </div>`}`;
    const on = (id, fn) => { const b = S.$('#' + id); if (b) b.onclick = fn; };
    const run = async (p, ok) => { try { await p; ok && S.toast(ok); } catch (e) { S.fail(e); } };
    on('cPause', () => run(st === 'paused' ? S.act.resume(a.id) : S.act.pause(a.id), { title: st === 'paused' ? 'Agent resumed' : 'Agent paused', body: `${a.id} ${st === 'paused' ? 'can act again.' : 'cannot do anything until resumed.'}`, color: 'var(--paused)', icon: st === 'paused' ? 'play' : 'pause' }));
    on('cIso', () => run(S.act.isolate(a.id), { title: 'Access cut off', body: `${a.id}: every call is now refused.`, color: 'var(--alert)', icon: 'lock' }));
    on('cRestore', () => run(S.act.restore(a.id), { title: 'Access restored', body: `${a.id} is paused. Resume it when ready.`, color: 'var(--paused)', icon: 'lock' }));
    on('ksCover', () => this.arm());
    on('ksBtn', () => this.confirmKill());
  },
  armT: null,
  arm() {
    const a = this.a; if (!a || a.status === 'terminated' || !S.can('admin')) return;
    const ks = S.$('#ks'); if (!ks) return;
    ks.classList.add('armed'); S.$('#armedFrame').classList.add('show');
    let left = 10; const help = S.$('#ksHelp');
    const upd = () => (help.innerHTML = `<b style="color:var(--kill)">Armed.</b> Press the red button within <b class="mono">${left}</b> s, or press <kbd>Esc</kbd> to cancel.`);
    upd(); S.$('#ksBtn').focus();
    clearInterval(this.armT); this.armT = setInterval(() => { left--; if (left <= 0) this.disarm(); else upd(); }, 1000);
  },
  disarm() {
    clearInterval(this.armT); this.armT = null; const f = S.$('#armedFrame'); if (f) f.classList.remove('show');
    const ks = S.$('#ks'); if (ks && !ks.classList.contains('done')) { ks.classList.remove('armed'); const h = S.$('#ksHelp'); if (h) h.innerHTML = 'Stops the agent for good. Step 1: lift the cover (or press <kbd>K</kbd>). Step 2: confirm.'; }
  },
  confirmKill() {
    const ks = S.$('#ks'); if (!ks || !ks.classList.contains('armed')) return;
    clearInterval(this.armT);
    const a = this.a, pend = S.pending().filter((p) => p.agent === a.id);
    S.modal(`<header>${S.icon('warn')}<div><h2 id="mTitle">Stop ${a.id} for good?</h2><p>This cannot be undone. The agent's key is revoked, waiting actions are cancelled and a sealed incident is opened.</p></div></header>
      <div class="mb"><div class="blast"><div>Actions waiting for approval that will be cancelled<b class="mono">${pend.length}</b></div><div>Money in those actions<b class="mono" style="color:var(--alert)">${S.fmtEur(pend.reduce((s, p) => s + p.amount, 0))}</b></div><div>Stop endpoint that will be called<b class="mono">${a.controlUrl ? 'yes' : 'none set'}</b></div></div>
        <label class="field">Why are you stopping it?<select class="inp" id="kReason"><option>Unauthorised payment</option><option>Hidden instructions (prompt injection)</option><option>Trying to send data outside</option><option>Keeps breaking rules</option><option>Other</option></select></label>
        <label class="field">To confirm, type the agent name: <b class="mono" style="color:var(--text-primary)">${a.id}</b><input class="inp mono" id="kConfirm" autocomplete="off" spellcheck="false" placeholder="${a.id}"></label>
        <div class="progress" id="kProg" hidden></div></div>
      <footer><button class="btn" id="kCancel">Cancel</button><button class="btn kill" id="kGo" disabled>Stop agent for good</button></footer>`, { danger: true, onClose: () => this.disarm() });
    S.$('#kConfirm').focus();
    S.$('#kConfirm').oninput = (e) => (S.$('#kGo').disabled = e.target.value.trim() !== a.id);
    S.$('#kCancel').onclick = () => S.closeModal();
    S.$('#kGo').onclick = async () => {
      ['kGo', 'kCancel', 'kConfirm', 'kReason'].forEach((id) => (S.$('#' + id).disabled = true));
      const p = S.$('#kProg'); p.hidden = false; p.innerHTML = '<div>Stopping…<b>…</b></div>';
      try {
        const r = await S.act.kill(a.id, S.$('#kReason').value, S.$('#kConfirm').value.trim());
        p.innerHTML = r.steps.map((s) => `<div class="ok">${S.esc(s.label)}<b>✓ ${s.ms} ms</b></div>`).join('');
        setTimeout(() => {
          S._onModalClose = null; S.closeModal(); S.$('#armedFrame').classList.remove('show');
          S.toast({ title: 'Agent stopped for good', body: `${a.id} · incident ${r.incident} opened`, color: 'var(--kill)', icon: 'power', actions: [{ label: 'Open incident', run: () => (location.hash = '#/incidents/' + r.incident) }], dur: 12 });
          this.a = S.agent(a.id) || r.agent; this.head(); this.controls(); this.actions = null; this.main();
        }, 1600);
      } catch (e) { S._onModalClose = null; S.closeModal(); this.disarm(); S.fail(e); }
    };
  },
  onAgents() { if (!this.a || !S.$('#dBadge')) return; this.head(); if (this.a.status !== this._lastSt) { this._lastSt = this.a.status; this.controls(); } },
  onEvent(e) { if (!this.a || e.agent !== this.a.id) return; if (this.tab === 'activity') this.main(); if (this.tab === 'decided' && e.kind === 'action') { this.actions = null; this.sel = null; this.main(); } },
  onApproval() { if (this.tab === 'decided' && this.actions) this.main(); },
  leave() { this.disarm(); },
  key(e) {
    if ((e.key === 'k' || e.key === 'K') && !S.$('#scrim').classList.contains('show')) { this.arm(); return true; }
    if (e.key === 'Escape' && this.armT) { this.disarm(); return true; }
  },
};
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-dec]'); if (!b) return;
  b.disabled = true;
  try { await S.act.decide(b.dataset.ap, b.dataset.dec); S.toast({ title: b.dataset.dec === 'approved' ? 'Approved' : 'Rejected', body: 'The agent received your answer. Your decision is in the audit log.', color: b.dataset.dec === 'approved' ? 'var(--active)' : 'var(--alert)' }); }
  catch (err) { b.disabled = false; S.fail(err); }
});
S.keyBox = (key, secret) => `<div class="card pad mt" style="border-color:color-mix(in srgb,var(--active) 50%,transparent);background:color-mix(in srgb,var(--active) 6%,transparent)">
  <b>Copy this key now — it will not be shown again.</b>
  <div class="row mt-s"><input class="inp mono" readonly value="${S.esc(key)}" style="flex:1" id="kbKey" aria-label="API key"><button class="btn sm" data-copy="kbKey">Copy</button></div>
  <div class="help mt-s">Stop-endpoint signing secret ${S.q('Used only if you set a stop endpoint: your agent checks the X-Sentinel-Signature header with this secret to be sure the stop message really comes from Sentinel.')}</div>
  <div class="row mt-s"><input class="inp mono" readonly value="${S.esc(secret)}" style="flex:1" id="kbSec" aria-label="Signing secret"><button class="btn sm" data-copy="kbSec">Copy</button></div>
  <p class="help mt-s">Give the key to your developer through a password manager, never by email or chat. In the agent, put it in an environment variable called <span class="mono">SENTINEL_API_KEY</span>.</p></div>`;
document.addEventListener('click', (e) => { const b = e.target.closest('[data-copy]'); if (!b) return; const i = document.getElementById(b.dataset.copy); i.select(); (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.reject()).then(() => S.toast({ title: 'Copied' })).catch(() => { document.execCommand('copy'); S.toast({ title: 'Copied' }); }); });
