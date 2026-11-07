/* Agents — every AI agent the company runs */
S.agentCard = (a) => {
  const rc = a.status === 'terminated' ? '' : a.risk > 60 ? 'r-high' : a.risk > 40 ? 'r-sus' : '';
  return `<article class="card acard ${rc} s-${a.status}" tabindex="0" role="link" data-agent="${a.id}" aria-label="${a.id}, ${S.STATUS[a.status].plain}, risk ${Math.round(a.risk)} of 100">
    <div class="row">${S.ava(a)}<div style="min-width:0;flex:1"><div class="nm">${a.id}</div><div class="sec" style="font-size:12.5px">${S.team(a.d).name}${a.model ? `<span class="expert-only"> · ${S.esc(a.model)}</span>` : ''}</div></div>${S.badge(a.status)}</div>
    <div class="does">${S.esc(a.does || 'No description yet.')}</div>
    <div class="riskline">${S.segs(a.risk)}<b style="color:${S.riskColor(a.risk)}">${Math.round(a.risk)}</b><span>Risk: ${S.riskWord(a.risk).toLowerCase()}</span></div>
    <div class="afoot"><span style="white-space:nowrap">${a.status === 'terminated' ? 'Stopped' : 'Last'} ${S.ago(a.ts)}:</span><span class="last">${S.esc(a.last)}</span></div>
  </article>`;
};
document.addEventListener('click', (e) => { const c = e.target.closest('[data-agent]'); if (c && !e.target.closest('a,button')) location.hash = '#/agents/' + c.dataset.agent; });
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset && e.target.dataset.agent) location.hash = '#/agents/' + e.target.dataset.agent; });

S.pages.agents = {
  title: 'Agents',
  f: { q: '', dept: 'all', status: 'all', view: 'cards' },
  render(el) {
    const f = this.f;
    el.innerHTML = `${S.pageHead('Agents', 'Every AI agent connected to Sentinel. Click one to see what it is doing, how it decides, and to pause or stop it.', S.can('admin') ? `<a class="btn primary" href="#/connect">${S.icon('plus')} Connect an agent</a>` : '')}
      <div class="toolbar">
        <input class="inp" id="aq" placeholder="Search by name…" value="${S.esc(f.q)}" style="width:220px" aria-label="Search agents">
        <div class="chips" id="adept">${[['all', 'All teams'], ...Object.entries(S.DEPT).map(([k, v]) => [k, v.name])].map(([k, n]) => `<button class="chip ${f.dept === k ? 'on' : ''}" data-k="${k}">${n}</button>`).join('')}</div>
        <select class="inp" id="astatus" aria-label="Filter by status"><option value="all">Any status</option>${Object.entries(S.STATUS).map(([k, v]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${v.plain}</option>`).join('')}</select>
        <div class="seg" id="aview" style="margin-left:auto" role="group" aria-label="View"><button data-v="cards" class="${f.view === 'cards' ? 'on' : ''}">Cards</button><button data-v="table" class="${f.view === 'table' ? 'on' : ''}">Table</button></div>
      </div>
      <div id="alist"></div>`;
    S.$('#aq').oninput = (e) => { f.q = e.target.value; this.list(); };
    S.$('#adept').onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; f.dept = b.dataset.k; S.$$('#adept .chip').forEach((c) => c.classList.toggle('on', c === b)); this.list(); };
    S.$('#astatus').onchange = (e) => { f.status = e.target.value; this.list(); };
    S.$$('#aview [data-v]').forEach((b) => (b.onclick = () => { f.view = b.dataset.v; S.$$('#aview [data-v]').forEach((x) => x.classList.toggle('on', x === b)); this.list(); }));
    this.list();
  },
  list() {
    const f = this.f, order = { terminated: 2, isolated: 1 }; if (!S.$('#alist')) return;
    const list = S.state.agents.filter((a) => (f.dept === 'all' || a.d === f.dept) && (f.status === 'all' || a.status === f.status) && a.id.toLowerCase().includes(f.q.toLowerCase()))
      .sort((a, b) => (order[a.status] || 0) - (order[b.status] || 0) || b.risk - a.risk);
    const box = S.$('#alist');
    if (!list.length) { box.innerHTML = S.state.agents.length ? `<div class="card empty"><b>No agents match these filters</b>Try another team or clear the search.</div>` : `<div class="card empty"><b>No agents connected yet</b>Register your first agent on the <a href="#/connect">Connect page</a>.</div>`; return; }
    if (f.view === 'cards') { box.innerHTML = `<div class="agrid">${list.map(S.agentCard).join('')}</div>`; return; }
    box.innerHTML = `<div class="card" style="overflow:auto"><table class="tbl"><thead><tr><th>Agent</th><th>Team</th><th>Status</th><th>Risk</th><th class="expert-only">AI model</th><th>Owner</th><th>Last action</th></tr></thead><tbody>
      ${list.map((a) => `<tr class="click" data-agent="${a.id}" tabindex="0"><td><div class="row">${S.ava(a)}<b>${a.id}</b></div></td><td>${S.team(a.d).name}</td><td>${S.badge(a.status)}</td><td><div class="riskline">${S.segs(a.risk)}<b style="color:${S.riskColor(a.risk)}">${Math.round(a.risk)}</b></div></td><td class="expert-only mono">${S.esc(a.model)}</td><td>${a.owner}</td><td class="sec">${S.esc(a.last)} · ${S.ago(a.ts)}</td></tr>`).join('')}
      </tbody></table></div>`;
  },
  onAgents() { this.list(); },
};
