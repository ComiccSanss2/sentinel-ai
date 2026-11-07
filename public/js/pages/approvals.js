/* Approvals — real actions waiting for a person; the agent is paused on them */
S.pages.approvals = {
  title: 'Approvals',
  tab: 'pending',
  render(el) {
    el.innerHTML = `${S.pageHead('Approvals', `When a rule says an action needs a person — like a large payment — the agent waits here for your answer. Nothing happens until you decide. Without an answer in ${S.state.server.approvalMinutes} minutes, the answer is no.`)}
      <div class="tabs" role="tablist"><button data-t="pending">Waiting <span class="count" id="apN"></span></button><button data-t="history">Decided</button></div>
      <div id="apList" class="stack"></div>`;
    S.$$('.tabs [data-t]').forEach((b) => (b.onclick = () => { this.tab = b.dataset.t; this.list(); }));
    this.list();
  },
  list() {
    if (!S.$('#apList')) return;
    S.$$('.tabs [data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === this.tab));
    const pend = S.pending(); S.$('#apN').textContent = pend.length;
    const box = S.$('#apList');
    if (this.tab === 'pending') {
      box.innerHTML = pend.length ? pend.map((p) => this.card(p)).join('') : `<div class="card empty"><b>Nothing is waiting for you</b>When an agent needs a decision, it appears here and you get a notification (also on Slack, if connected).</div>`;
    } else {
      const done = S.state.approvals.filter((p) => p.status !== 'pending');
      const word = { approved: ['info', 'Approved'], rejected: ['block', 'Rejected'], expired: ['warn', 'No answer — rejected'], cancelled: ['kill', 'Cancelled by emergency stop'] };
      box.innerHTML = `<div class="card" style="overflow:auto"><table class="tbl"><thead><tr><th>When</th><th>Agent</th><th>Action</th><th>Decision</th><th>By</th></tr></thead><tbody>${done.map((p) => `<tr><td class="sec">${S.date(p.at || p.created)}</td><td><a href="#/agents/${p.agent}">${p.agent}</a></td><td>${S.esc(p.plain)}</td><td><span class="sev sev-${(word[p.status] || ['info'])[0]}">${(word[p.status] || [0, p.status])[1]}</span></td><td>${S.esc(p.by || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No decisions yet.</td></tr>'}</tbody></table></div>`;
    }
  },
  card(p) {
    const a = S.agent(p.agent), left = Math.max(0, p.expires - Date.now());
    return `<article class="card apcard">${a ? S.ava(a, true) : ''}
      <div><div class="sec" style="font-size:13px">${a ? `<a href="#/agents/${a.id}">${a.id}</a> · ${S.esc(S.team(a.d).name)}` : p.agent} · asked ${S.ago(p.created)}</div>
        <h3>Wants to: ${S.esc(p.plain)}</h3>
        <div class="why">${S.icon('shield')} <b>Why it is waiting:</b>${(p.reasons || []).map((r) => `<div style="margin-top:4px">• <b>${S.esc(r.name)}</b> — ${S.esc(r.detail)}</div>`).join('')}</div>
        <div class="expert-only mono mt-s sec" style="font-size:12.5px">${S.hi(p.tech)}</div>
        <div class="help mt-s">Not sure? <a href="#/agents/${p.agent}">See what the agent received and how it decided</a>.</div></div>
      <div class="acts">${S.can('analyst') ? `<button class="btn ok" data-dec="approved" data-ap="${p.id}">${S.icon('check')} Approve</button><button class="btn danger" data-dec="rejected" data-ap="${p.id}">${S.icon('x')} Reject</button>` : '<span class="help">Viewers cannot decide.</span>'}
        <div class="help" style="text-align:center">Auto-reject in <span class="timer" data-exp="${p.expires}">${this.fmt(left)}</span></div></div>
    </article>`;
  },
  fmt: (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; },
  tick() { S.$$('.timer[data-exp]').forEach((t) => (t.textContent = this.fmt(Math.max(0, +t.dataset.exp - Date.now())))); },
  onApproval() { this.list(); },
};
