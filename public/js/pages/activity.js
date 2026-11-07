/* Activity — every action, live */
S.pages.activity = {
  title: 'Activity',
  f: { sev: 'all', agent: 'all', q: '' },
  frozen: false,
  render(el) {
    const f = this.f;
    const cnt = (s) => S.state.events.filter((e) => s === 'all' || e.sev === s).length;
    el.innerHTML = `${S.pageHead('Activity', 'Every action your agents take, as it happens. Coloured lines are the ones Sentinel stopped, flagged or sent for approval.',
      `<button class="btn" id="frz">${S.icon('pause')} Pause the list</button><button class="btn" id="csv">${S.icon('download')} Download CSV</button>`)}
      <div class="toolbar">
        <div class="chips" id="sevs">${[['all', 'Everything'], ['block', 'Stopped'], ['hold', 'Needs approval'], ['warn', 'Warnings'], ['info', 'Normal'], ['kill', 'Emergency stops']].map(([k, n]) => `<button class="chip ${f.sev === k ? 'on' : ''}" data-k="${k}">${n}<span class="n">${cnt(k)}</span></button>`).join('')}</div>
        <select class="inp" id="evAgent" aria-label="Filter by agent"><option value="all">All agents</option>${S.state.agents.map((a) => `<option ${f.agent === a.id ? 'selected' : ''}>${a.id}</option>`).join('')}</select>
        <input class="inp" id="evQ" placeholder="Search words, amounts…" value="${S.esc(f.q)}" style="width:220px" aria-label="Search activity">
      </div>
      <section class="card"><div class="evlist" id="evAll" aria-live="off"></div></section>`;
    S.$('#sevs').onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; f.sev = b.dataset.k; S.$$('#sevs .chip').forEach((c) => c.classList.toggle('on', c === b)); this.list(); };
    S.$('#evAgent').onchange = (e) => { f.agent = e.target.value; this.list(); };
    S.$('#evQ').oninput = (e) => { f.q = e.target.value.toLowerCase(); this.list(); };
    S.$('#frz').onclick = () => { this.frozen = !this.frozen; S.$('#frz').innerHTML = this.frozen ? `${S.icon('play')} Resume the list` : `${S.icon('pause')} Pause the list`; if (!this.frozen) this.list(); };
    S.$('#csv').onclick = () => this.csv();
    this.list();
  },
  match(e) { const f = this.f; return (f.sev === 'all' || e.sev === f.sev) && (f.agent === 'all' || e.agent === f.agent) && (!f.q || (e.plain + ' ' + e.tech + ' ' + e.agent).toLowerCase().includes(f.q)); },
  list() { const l = S.state.events.filter((e) => this.match(e)).slice(0, 120); S.$('#evAll').innerHTML = l.map((e) => S.evRow(e)).join('') || `<div class="empty"><b>No activity matches</b>Change the filters above to see more.</div>`; },
  onEvent(e) { if (this.frozen || !this.match(e)) return; const box = S.$('#evAll'); if (box.querySelector('.ev.open')) return; box.insertAdjacentHTML('afterbegin', S.evRow(e, { fresh: true })); const em = box.querySelector('.empty'); if (em) em.remove(); while (box.children.length > 120) box.lastChild.remove(); },
  csv() { const a = document.createElement('a'); a.href = '/api/events.csv'; a.download = 'sentinel-activity.csv'; document.body.append(a); a.click(); a.remove(); S.toast({ title: 'Download started', body: 'All recorded activity as a spreadsheet (CSV).', icon: 'download' }); },
};
