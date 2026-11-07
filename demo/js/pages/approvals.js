/* Approvals — risky actions waiting for a person */
S.pages.approvals = {
  title: 'Approvals',
  tab: 'pending',
  render(el) {
    el.innerHTML = `${S.pageHead('Approvals', 'When an agent wants to do something your rules say needs a person — like a large payment — it waits here. Nothing happens until you decide.')}
      <div class="tabs" role="tablist"><button data-t="pending">Waiting <span class="count" id="apN"></span></button><button data-t="history">Decided</button></div>
      <div id="apList" class="stack"></div>`;
    S.$$('.tabs [data-t]').forEach((b) => (b.onclick = () => { this.tab = b.dataset.t; this.list(); }));
    this.list();
  },
  list() {
    S.$$('.tabs [data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === this.tab));
    const pend = S.pending(); S.$('#apN').textContent = pend.length;
    const box = S.$('#apList');
    if (this.tab === 'pending') {
      box.innerHTML = pend.length ? pend.map((p) => this.card(p)).join('') : `<div class="card empty"><b>Nothing is waiting for you</b>When an agent needs a decision, it will appear here and you will get a notification.</div>`;
    } else {
      const done = S.state.approvals.filter((p) => p.status !== 'pending');
      box.innerHTML = `<div class="card" style="overflow:auto"><table class="tbl"><thead><tr><th>When</th><th>Agent</th><th>Action</th><th>Decision</th><th>By</th></tr></thead><tbody>${done.map((p) => `<tr><td class="sec">${S.date(p.at)}</td><td><a href="#/agents/${p.agent}">${p.agent}</a></td><td>${S.esc(p.plain)}</td><td><span class="sev sev-${p.status === 'approved' ? 'info' : 'block'}">${p.status[0].toUpperCase() + p.status.slice(1)}</span></td><td>${S.esc(p.by)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No decisions yet.</td></tr>'}</tbody></table></div>`;
    }
  },
  card(p) {
    const a = S.agent(p.agent), pol = S.policy(p.policy), left = Math.max(0, 15 * 60e3 - (Date.now() - p.created));
    return `<article class="card apcard">${a ? S.ava(a, true) : ''}
      <div><div class="sec" style="font-size:13px">${a ? `<a href="#/agents/${a.id}">${a.id}</a> · ${S.DEPT[a.d].name}` : p.agent} · asked ${S.ago(p.created)}</div>
        <h3>Wants to: ${S.esc(p.plain)}</h3>
        <div class="why">${S.icon('shield')} <b>Why it is waiting:</b> ${pol ? `${S.esc(pol.name)} — ${S.esc(pol.desc)}` : 'A rule requires a person to check this.'}</div>
        <div class="tech expert-only mono mt-s sec" style="font-size:12.5px">${S.hi(p.tech)} · rule ${p.policy}</div>
        <div class="help mt-s">Not sure? <a href="#/agents/${p.agent}">See how the agent decided</a> before choosing.</div></div>
      <div class="acts"><button class="btn ok" data-dec="approved" data-ap="${p.id}">${S.icon('check')} Approve</button><button class="btn danger" data-dec="rejected" data-ap="${p.id}">${S.icon('x')} Reject</button>
        <div class="help" style="text-align:center">Auto-reject in <span class="timer" data-exp="${p.created}">${this.fmt(left)}</span></div></div>
    </article>`;
  },
  fmt: (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; },
  tick() { S.$$('.timer[data-exp]').forEach((t) => (t.textContent = this.fmt(Math.max(0, 15 * 60e3 - (Date.now() - +t.dataset.exp))))); },
  onApproval() { this.list(); },
};
