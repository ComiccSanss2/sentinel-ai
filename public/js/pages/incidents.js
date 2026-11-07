/* Incidents — serious events, with a timeline and a report */
S.pages.incidents = {
  title: 'Incidents',
  render(el, params) {
    const list = S.state.incidents;
    const sel = list.find((i) => i.id === params[0]) || list[0];
    el.innerHTML = `${S.pageHead('Incidents', 'A report is opened automatically when something serious happens — like an emergency stop or an attack. Use it to investigate and to show auditors what happened.')}
      ${list.length ? `<div class="incwrap"><section class="card" aria-label="Incident list">${list.map((i) => `<a class="inc ${sel && i.id === sel.id ? 'on' : ''}" href="#/incidents/${i.id}">
          <div class="row" style="justify-content:space-between"><span class="mono sec" style="font-size:12.5px">${i.id}</span><span class="sev sev-${i.status === 'open' ? (i.sev === 'critical' ? 'kill' : 'block') : 'info'}">${i.status === 'open' ? 'Open' : 'Resolved'}</span></div>
          <h3>${S.esc(i.title)}</h3><div class="sec" style="font-size:12.5px">${i.agent} · ${S.ago(i.opened)}</div></a>`).join('')}</section>
        <section class="card pad" id="incDetail">${sel ? this.detail(sel) : ''}</section></div>`
        : `<div class="card empty"><b>No incidents</b>Serious events will appear here automatically.</div>`}`;
    const r = S.$('#incResolve'); if (r) r.onclick = async () => { try { const i = await S.act.resolveIncident(sel.id); Object.assign(sel, i); S.toast({ title: 'Incident resolved', body: sel.id }); this.render(el, [sel.id]); } catch (e) { S.fail(e); } };
    const p = S.$('#incPrint'); if (p) p.onclick = () => window.print();
  },
  detail(i) {
    const sevW = { critical: 'Critical', high: 'High', medium: 'Medium' }[i.sev] || i.sev;
    return `<div class="row wrap"><div><div class="mono sec">${i.id}</div><h2 style="font:600 20px/28px var(--display)">${S.esc(i.title)}</h2></div>
        <div class="acts" style="margin-left:auto;display:flex;gap:8px">${i.status === 'open' && S.can('analyst') ? `<button class="btn ok" id="incResolve">${S.icon('check')} Mark as resolved</button>` : ''}<button class="btn" id="incPrint">${S.icon('printer')} Print report</button></div></div>
      <div class="grid g3 mt">
        <div><div class="help">Severity</div><b>${sevW}</b></div>
        <div><div class="help">Agent</div><a href="#/agents/${i.agent}">${i.agent}</a></div>
        <div><div class="help">Money involved</div><b>${S.fmtEur(i.euro)}</b> <span class="sec">in recent stopped or held actions</span></div>
      </div>
      <h3 class="mt" style="font:600 15px var(--sans)">What happened, step by step</h3>
      <div class="tl">${i.timeline.map(([t, x]) => `<div><span>${S.time(t)}</span><span style="color:var(--text-primary);font:inherit">${S.esc(x)}</span></div>`).join('')}</div>
      <p class="help mt">This record is also written to the chained audit log on the server, so it cannot be changed without it being detectable.</p>`;
  },
};

S.pages.incidents.onIncident = function () { const m = location.hash.match(/incidents\/?([^/]*)/); this.render(S.$('#content'), [m && m[1]]); };
