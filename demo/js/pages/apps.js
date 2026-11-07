/* Connected apps — where agents act, and where alerts go */
S.pages.apps = {
  title: 'Connected apps',
  render(el) {
    const apps = S.state.apps;
    const used = (name) => S.state.agents.filter((a) => a.apis.some((x) => name.toLowerCase().startsWith(x.toLowerCase()))).length;
    el.innerHTML = `${S.pageHead('Connected apps', 'Sentinel sits between your agents and these apps, so it can check every action before it reaches them. Alert apps (Slack, Teams, PagerDuty) receive notifications.')}
      <p class="help" style="margin:-8px 0 16px">${S.icon('info')} Demo: connecting or disconnecting here is simulated.</p>
      <div class="agrid">${apps.map((p) => `<article class="card appcard">
        <div class="row"><span class="applogo" style="background:${p.color}">${p.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span><div><h3>${p.name}</h3><div class="sec" style="font-size:13px">${p.cat}</div></div>
          <span class="badge ${p.on ? 'b-active' : 'b-terminated'}" style="margin-left:auto">${p.on ? 'Connected' : 'Not connected'}</span></div>
        <div class="help">${used(p.name) ? `Used by ${used(p.name)} agent${used(p.name) > 1 ? 's' : ''}` : 'Not used by any agent yet'}</div>
        <button class="btn ${p.on ? '' : 'primary'} sm" data-app="${p.id}" style="align-self:flex-start">${p.on ? 'Disconnect' : 'Connect'}</button></article>`).join('')}</div>`;
    el.querySelectorAll('[data-app]').forEach((b) => (b.onclick = () => { const p = apps.find((x) => x.id === b.dataset.app); p.on = !p.on; S.save(); S.toast({ title: `${p.name} ${p.on ? 'connected' : 'disconnected'}`, color: p.on ? 'var(--active)' : 'var(--suspicious)', icon: 'plug' }); this.render(el); }));
  },
};
