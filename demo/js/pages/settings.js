/* Settings — display, notifications, team, demo data */
S.pages.settings = {
  title: 'Settings',
  render(el) {
    const s = S.state.settings;
    const seg = (id, val, opts) => `<div class="seg" id="${id}" role="group">${opts.map(([k, n]) => `<button data-v="${k}" class="${val === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    const sw = (k, on) => `<button class="switch" role="switch" aria-checked="${on}" data-n="${k}" aria-label="${k}"></button>`;
    el.innerHTML = `${S.pageHead('Settings', 'Change how Sentinel looks, how it tells you about problems, and who on your team can do what.')}
      <div class="stack">
      <section class="card"><div class="chead"><h2>Display</h2></div>
        <div class="setrow"><div class="tx"><b>Words used on screen</b><span>Simple uses plain words. Expert also shows technical details like AI models, rule codes and raw data.</span></div>${seg('sMode', s.mode, [['simple', 'Simple'], ['expert', 'Expert']])}</div>
        <div class="setrow"><div class="tx"><b>Colours</b><span>Dark is easier on the eyes in control rooms. Light is better for printing and bright offices.</span></div>${seg('sTheme', s.theme, [['dark', 'Dark'], ['light', 'Light']])}</div>
        <div class="setrow"><div class="tx"><b>Text size</b><span>Make all text bigger.</span></div>${seg('sSize', s.size, [['normal', 'Normal'], ['large', 'Large']])}</div>
      </section>
      <section class="card"><div class="chead"><h2>Notifications</h2></div>
        <div class="setrow"><div class="tx"><b>Pop-up messages in this window</b><span>Small messages in the bottom-right corner when something is stopped.</span></div>${sw('toasts', s.notify.toasts)}</div>
        <div class="setrow"><div class="tx"><b>Slack</b><span>Post to #ai-security when an action is stopped or needs approval.</span></div>${sw('slack', s.notify.slack)}</div>
        <div class="setrow"><div class="tx"><b>Email</b><span>A daily summary, plus an immediate email for emergency stops.</span></div>${sw('email', s.notify.email)}</div>
        <div class="setrow"><div class="tx"><b>Text message to the person on call</b><span>Only for critical risk or emergency stops.</span></div>${sw('sms', s.notify.sms)}</div>
      </section>
      <section class="card"><div class="chead"><h2>Team</h2><span class="right help">Stopping all agents at once needs two Admins.</span></div>
        <div style="overflow:auto"><table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Role ${S.q('Admin: can do everything, including emergency stops. Analyst: can pause agents and approve actions. Viewer: can only look.')}</th><th>Note</th></tr></thead>
        <tbody>${S.TEAM.map((t) => `<tr><td><div class="row"><span class="avatar">${t.name.split(' ').map((w) => w[0]).join('')}</span>${t.name}</div></td><td class="sec">${t.email}</td><td>${t.role}</td><td class="sec">${t.note}</td></tr>`).join('')}</tbody></table></div>
      </section>
      <section class="card"><div class="chead"><h2>Demo data</h2></div>
        <div class="setrow"><div class="tx"><b>Start over</b><span>Brings back all agents, rules and approvals as they were at the beginning, and shows the tour again.</span></div><button class="btn danger" id="sReset">Reset demo</button></div>
      </section></div>`;
    const segBind = (id, key, apply) => S.$$(`#${id} button`).forEach((b) => (b.onclick = () => { s[key] = b.dataset.v; S.save(); S.$$(`#${id} button`).forEach((x) => x.classList.toggle('on', x === b)); apply(); }));
    segBind('sMode', 'mode', S.applySettings); segBind('sTheme', 'theme', S.applySettings); segBind('sSize', 'size', S.applySettings);
    el.querySelectorAll('[data-n]').forEach((b) => (b.onclick = () => { const k = b.dataset.n; s.notify[k] = !s.notify[k]; b.setAttribute('aria-checked', s.notify[k]); S.save(); }));
    S.$('#sReset').onclick = () => {
      S.modal(`<header>${S.icon('warn')}<div><h2>Reset the demo?</h2><p>All changes you made (stopped agents, rules, decisions) will be undone.</p></div></header><footer style="padding-top:16px"><button class="btn" id="rC">Cancel</button><button class="btn danger" id="rG">Reset demo</button></footer>`);
      S.$('#rC').onclick = S.closeModal; S.$('#rG').onclick = S.resetDemo;
    };
  },
};
