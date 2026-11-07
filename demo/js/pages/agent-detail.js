/* Agent detail — how it decided + controls + emergency stop */
S.pages.agent = {
  title: 'Agent',
  tab: 'decided',
  render(el, params) {
    const a = S.agent(decodeURIComponent(params[0] || ''));
    if (!a) { el.innerHTML = `<div class="card empty"><b>Agent not found</b><a href="#/agents">Back to all agents</a></div>`; return; }
    this.a = a; this.el = el; this._lastSt = a.status;
    this.title = a.id;
    el.innerHTML = `
      <div class="crumb"><a href="#/agents">${S.icon('arrow-left')} All agents</a><span>/</span><span>${S.DEPT[a.d].name}</span></div>
      <div class="dhead">${S.ava(a, true)}<div><h1>${a.id}</h1><div class="sec">${S.esc(a.does)}</div></div><span id="dBadge">${S.badge(a.status)}</span>
        <div class="score" id="dScore"></div></div>
      <div id="dRibbon"></div>
      <div class="tabs" role="tablist">
        <button data-t="decided" role="tab">How it decided</button><button data-t="activity" role="tab">Activity</button><button data-t="access" role="tab">What it can do</button>
      </div>
      <div class="dgrid"><div id="dMain"></div><aside class="card pad control" id="dCtl" aria-label="Controls"></aside></div>`;
    S.$$('.tabs [data-t]').forEach((b) => (b.onclick = () => { this.tab = b.dataset.t; this.main(); }));
    this.head(); this.main(); this.controls();
  },
  head() {
    const a = this.a;
    S.$('#dBadge').innerHTML = S.badge(a.status);
    S.$('#dScore').innerHTML = `<b style="color:${S.riskColor(a.risk)}">${Math.round(a.risk)}</b><span class="sec"> / 100</span><div class="help">Risk: ${S.riskWord(a.risk).toLowerCase()} ${S.q('How unusual and dangerous this agent\'s behaviour is right now. 0–40 normal, 41–60 watch, 61–80 high, 81–100 critical.')}</div>`;
    S.$('#dRibbon').innerHTML = a.status === 'terminated' ? `<div class="ribbon">${S.icon('power')} <b>Stopped for good</b> by Alessia Bianchi on ${S.date(a.killedAt)} · reason: ${S.esc(a.killReason)}. This page is now a read-only record.</div>`
      : a.status === 'isolated' ? `<div class="ribbon" style="border-style:dashed">${S.icon('lock')} <b>Access cut off.</b> The agent cannot reach any app or the internet. It is kept so the team can investigate.</div>` : '';
  },
  main() {
    const a = this.a, box = S.$('#dMain');
    S.$$('.tabs [data-t]').forEach((b) => { b.classList.toggle('on', b.dataset.t === this.tab); b.setAttribute('aria-selected', b.dataset.t === this.tab); });
    if (this.tab === 'decided') box.innerHTML = this.trace();
    if (this.tab === 'activity') { const ev = S.state.events.filter((e) => e.agent === a.id).slice(0, 40); box.innerHTML = `<section class="card"><div class="chead"><h2>Recent activity</h2><span class="right help">Click a line for details</span></div><div class="evlist">${ev.map((e) => S.evRow(e)).join('') || '<div class="empty"><b>No activity recorded yet</b>New actions appear here as they happen.</div>'}</div></section>`; }
    if (this.tab === 'access') {
      const rb = [['Money', a.d === 'FIN' ? a.risk : a.risk * 0.4], ['Data leaving the company', a.d === 'MKT' ? a.risk * 0.9 : a.risk * 0.3], ['Hidden instructions', a.d === 'LOG' ? a.risk * 0.2 : a.risk * 0.8], ['Making things up', a.d === 'LOG' ? a.risk : a.risk * 0.3], ['Breaking rules', a.risk * 0.6]].map(([n, v]) => [n, Math.round(v)]);
      box.innerHTML = `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
        <section class="card pad"><h2 style="font:600 15px var(--sans);margin-bottom:6px">What it is allowed to do</h2><p class="help" style="margin-bottom:6px">Permissions given by ${a.owner}. Sentinel checks every action against them.</p>
          ${a.perms.map((p) => `<div class="perm">${S.icon('check')}<span>${S.esc(p)}</span></div>`).join('')}
          <p class="help mt">Connected apps: ${a.apis.join(', ')}</p><p class="help expert-only">AI model: <span class="mono">${a.model}</span></p></section>
        <section class="card pad"><h2 style="font:600 15px var(--sans);margin-bottom:12px">Where the risk comes from</h2><div class="rb">${rb.map(([n, v]) => `<div><div class="row" style="justify-content:space-between"><span>${n}</span><b class="mono">${v}</b></div><div class="bar"><i style="width:${v}%;background:${S.riskColor(v)}"></i></div></div>`).join('')}</div></section>
      </div>`;
    }
  },
  trace() {
    const a = this.a, T = S.TRACES[a.d], now = Date.now(), t = (s) => S.time(now - s * 1000);
    const pend = S.pending().find((p) => p.agent === a.id);
    const rail = T.verdict === 'hold' ? 'var(--paused)' : 'var(--alert)';
    const json = (o) => S.esc(JSON.stringify(o, null, 2)).replace(/&quot;([^&]+)&quot;:/g, '<span class="jk">"$1"</span>:').replace(/: &quot;([^&]*)&quot;/g, ': <span class="js">"$1"</span>').replace(/: (\d[\d.]*)/g, ': <span class="jn">$1</span>');
    const step = (n, title, when, plain, raw, extra = '', style = '') => `<div class="step" style="${style}"><span class="snum">${n}</span><div class="sbox"><h3>${title}<span class="t">${when}</span></h3><div class="plain">${plain}</div>${raw ? `<div class="raw expert-only">${raw}</div>` : ''}${extra}</div></div>`;
    return `<section class="card"><div class="chead"><h2>How it decided — latest risky action</h2><span class="right help hideSm">Read from top to bottom</span></div>
      <div class="trace">
        ${step(1, 'What it received', t(14), `${S.esc(T.src)}. ${T.inputPlain}`, '', `<div class="untrusted raw">${T.input}</div><div class="help mt-s">Dashed box = comes from outside the company and cannot be trusted. Text highlighted in yellow is followed through every next step.</div>`)}
        ${step(2, 'What it thought', t(12), T.thinkPlain, T.think)}
        ${step(3, 'What it looked up', t(10), T.retPlain, S.esc(T.ret))}
        ${step(4, 'What it wanted to do', t(9), T.toolPlain, `<span class="mono">${T.tool}</span>\n${json(T.args)}`, '', '--rail:var(--cyan)')}
        ${step(5, 'What Sentinel decided', t(9), `<span class="sev sev-${T.verdict}">${T.verdict === 'hold' ? 'Held — waiting for a person' : 'Stopped'}</span> <span style="margin-left:6px">${S.esc(T.why)}</span>`, '',
          a.status !== 'terminated' && pend ? `<div class="row wrap mt"><button class="btn ok" data-dec="approved" data-ap="${pend.id}">${S.icon('check')} Approve</button><button class="btn danger" data-dec="rejected" data-ap="${pend.id}">${S.icon('x')} Reject</button><a class="link" href="#/approvals">Open in Approvals</a></div><div class="help mt-s">If nobody decides within 15 minutes, it is rejected automatically.</div>` : '', `--rail:${rail}`)}
        ${step(6, 'Result', t(2), a.status === 'terminated' ? 'Agent stopped for good. No money moved. A sealed record was saved.' : pend ? 'Nothing has happened yet — the action is waiting for a decision.' : 'The action did not happen. €0 moved.', '')}
      </div></section>`;
  },
  controls() {
    const a = this.a, box = S.$('#dCtl'), st = a.status, dead = st === 'terminated';
    box.innerHTML = `<h2 style="font:600 15px var(--sans)">Controls</h2>
      <div class="statusExplain mt-s"><b>${S.STATUS[st].plain}.</b> ${S.STATUS[st].tip}</div>
      <div class="ctl mt">
        ${dead ? '' : st === 'isolated' ? `<div class="opt"><button class="btn" id="cRestore">${S.icon('lock')} Restore access</button><p>Gives back its app access. It stays paused until you resume it.</p></div>`
          : `<div class="opt"><button class="btn violet" id="cPause">${S.icon(st === 'paused' ? 'play' : 'pause')} ${st === 'paused' ? 'Resume agent' : 'Pause agent'}</button><p>${st === 'paused' ? 'The agent starts working again.' : 'Stops new actions. Safe and undoable — use it when you are unsure.'}</p></div>
             <div class="opt"><button class="btn orange" id="cIso">${S.icon('lock')} Cut off access</button><p>Removes its passwords and internet access, but keeps it for investigation. An admin can restore it.</p></div>`}
        <div class="opt"><div style="font-weight:600;margin-bottom:8px">${S.term('Emergency stop', 'Emergency stop')} <span class="expert-only sec">(Kill-Switch)</span></div>
          <div class="ks ${dead ? 'done' : ''}" id="ks">
            <button class="ks-btn" id="ksBtn" ${dead ? 'disabled' : ''} aria-describedby="ksHelp">${S.icon('power')} ${dead ? 'Stopped' : 'Emergency stop'}</button>
            ${dead ? '' : '<button class="ks-cover" id="ksCover" aria-label="Lift the safety cover to arm the emergency stop">Lift the cover to arm</button>'}
          </div>
          <p id="ksHelp">${dead ? 'This agent was stopped for good. To use it again, the team must deploy a new version.' : 'Stops the agent for good in under 2 seconds. Step 1: lift the cover (or press <kbd>K</kbd>). Step 2: confirm.'}</p></div>
      </div>`;
    const on = (id, fn) => { const b = S.$('#' + id); if (b) b.onclick = fn; };
    on('cPause', () => { st === 'paused' ? S.act.resume(a.id) : S.act.pause(a.id); S.toast({ title: st === 'paused' ? 'Agent resumed' : 'Agent paused', body: `${a.id} ${st === 'paused' ? 'is working again.' : 'will not start any new action.'}`, color: 'var(--paused)', icon: st === 'paused' ? 'play' : 'pause', actions: [{ label: 'Undo', run: () => (st === 'paused' ? S.act.pause(a.id) : S.act.resume(a.id)) }] }); });
    on('cIso', () => { S.act.isolate(a.id); S.toast({ title: 'Access cut off', body: `${a.id} can no longer reach any app.`, color: 'var(--alert)', icon: 'lock' }); });
    on('cRestore', () => { S.act.restore(a.id); S.toast({ title: 'Access restored', body: `${a.id} is paused. Resume it when ready.`, color: 'var(--paused)', icon: 'lock' }); });
    on('ksCover', () => this.arm());
    on('ksBtn', () => this.confirmKill());
  },
  armT: null,
  arm() {
    const a = this.a; if (!a || a.status === 'terminated') return;
    const ks = S.$('#ks'); if (!ks) return;
    ks.classList.add('armed'); S.$('#armedFrame').classList.add('show');
    let left = 10;
    const help = S.$('#ksHelp');
    const upd = () => (help.innerHTML = `<b style="color:var(--kill)">Armed.</b> Press the red button within <b class="mono">${left}</b> s to continue, or press <kbd>Esc</kbd> to cancel.`);
    upd(); S.$('#ksBtn').focus();
    clearInterval(this.armT); this.armT = setInterval(() => { left--; if (left <= 0) this.disarm(); else upd(); }, 1000);
  },
  disarm() {
    clearInterval(this.armT); this.armT = null; S.$('#armedFrame').classList.remove('show');
    const ks = S.$('#ks'); if (ks && !ks.classList.contains('done')) { ks.classList.remove('armed'); const h = S.$('#ksHelp'); if (h) h.innerHTML = 'Stops the agent for good in under 2 seconds. Step 1: lift the cover (or press <kbd>K</kbd>). Step 2: confirm.'; }
  },
  confirmKill() {
    const ks = S.$('#ks'); if (!ks || !ks.classList.contains('armed')) return;
    clearInterval(this.armT);
    const a = this.a, pendEur = S.pending().filter((p) => p.agent === a.id).reduce((s, p) => s + p.amount, 0);
    const m = S.modal(`<header>${S.icon('warn')}<div><h2 id="mTitle">Stop ${a.id} for good?</h2><p>This cannot be undone. The agent stops in under 2 seconds and a sealed record is saved for audit.</p></div></header>
      <div class="mb"><div class="blast"><div>Unfinished actions that will be cancelled<b class="mono">3</b></div><div>App passwords that will be removed<b class="mono">${a.apis.length}</b></div><div>Other agents that use its work<b class="mono">${a.d === 'FIN' ? 2 : 1}</b></div><div>Money waiting for approval that will be cancelled<b class="mono" style="color:var(--alert)">${S.fmtEur(pendEur)}</b></div></div>
        <label class="field">Why are you stopping it?<select class="inp" id="kReason"><option>Unauthorised payment</option><option>Hidden instructions (prompt injection)</option><option>Trying to send data outside</option><option>Keeps breaking rules</option><option>Other</option></select></label>
        <label class="field">To confirm, type the agent name: <b class="mono" style="color:var(--text-primary)">${a.id}</b><input class="inp mono" id="kConfirm" autocomplete="off" spellcheck="false" placeholder="${a.id}"></label>
        <div class="progress" id="kProg" hidden></div></div>
      <footer><button class="btn" id="kCancel">Cancel</button><button class="btn kill" id="kGo" disabled>Stop agent for good</button></footer>`, { danger: true, onClose: () => this.disarm() });
    S.$('#kConfirm').focus();
    S.$('#kConfirm').oninput = (e) => (S.$('#kGo').disabled = e.target.value.trim() !== a.id);
    S.$('#kCancel').onclick = () => S.closeModal();
    S.$('#kGo').onclick = () => {
      ['kGo', 'kCancel', 'kConfirm', 'kReason'].forEach((id) => (S.$('#' + id).disabled = true));
      const steps = [['App passwords removed', 0.3], ['Internet access blocked', 0.5], ['Unfinished actions cancelled', 0.9], ['Agent process stopped', 1.4], ['Sealed record saved', 1.8]];
      const p = S.$('#kProg'); p.hidden = false; p.innerHTML = steps.map((s) => `<div>${s[0]}<b>…</b></div>`).join('');
      steps.forEach((s, i) => setTimeout(() => {
        const d = p.children[i]; d.classList.add('ok'); d.querySelector('b').textContent = '✓ ' + s[1].toFixed(1) + ' s';
        if (i === steps.length - 1) setTimeout(() => {
          const inc = S.act.kill(a.id, S.$('#kReason').value);
          S._onModalClose = null; S.closeModal(); S.$('#armedFrame').classList.remove('show');
          S.toast({ title: 'Agent stopped for good', body: `${a.id} · incident ${inc.id} created`, color: 'var(--kill)', icon: 'power', actions: [{ label: 'Open incident', run: () => (location.hash = '#/incidents/' + inc.id) }], dur: 10 });
          this.head(); this.main(); this.controls();
        }, 450);
      }, s[1] * 1000));
    };
  },
  onAgents() { if (!this.a) return; this.head(); const st = this.a.status; if (st !== this._lastSt) { this._lastSt = st; this.controls(); this.main(); } },
  onEvent(e) { if (this.tab === 'activity' && e.agent === this.a?.id) this.main(); },
  onApproval() { if (this.tab === 'decided') this.main(); },
  leave() { this.disarm(); },
  key(e) {
    if ((e.key === 'k' || e.key === 'K') && !S.$('#scrim').classList.contains('show')) { this.arm(); return true; }
    if (e.key === 'Escape' && this.armT) { this.disarm(); return true; }
  },
};
document.addEventListener('click', (e) => { const b = e.target.closest('[data-dec]'); if (!b) return; S.act.decide(b.dataset.ap, b.dataset.dec); S.toast({ title: b.dataset.dec === 'approved' ? 'Approved' : 'Rejected', body: 'Your decision was saved in the audit log.', color: b.dataset.dec === 'approved' ? 'var(--active)' : 'var(--alert)' }); });
