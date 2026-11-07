/* Overview — "Is everything OK right now?" */
S.pages = S.pages || {};
S.pages.overview = {
  title: 'Overview',
  render(el) {
    const st = S.state;
    if (!st.agents.length) return this.empty(el);
    el.innerHTML = `
      ${st.settings.welcomeHidden ? '' : `<div class="welcome" id="welcome">${S.icon('sparkle')}<div><b>Welcome, ${S.esc(st.me.name.split(' ')[0])}.</b><span class="sec">Take a 1-minute tour of the screen, or read how Sentinel works in plain words.</span></div>
        <div class="acts"><button class="btn primary sm" id="startTour">Start the tour</button><a class="btn sm" href="#/help">How it works</a><button class="iconBtn" id="hideWelcome" aria-label="Hide this message" data-tip="Hide this message">✕</button></div></div>`}
      ${S.pageHead('Overview', `What ${S.esc(st.org.name)}'s AI agents are doing right now, and what needs your attention.`)}
      <section class="card pad hero" id="statusHero"></section>
      <div class="grid g4 mt">
        <div class="card pad kpi"><div class="lbl">Agents working ${S.q('Agents that are allowed to act right now. Paused, cut off or stopped agents are not counted.')}</div><div class="val" id="kWork"></div><div class="note" id="kWorkNote"></div></div>
        <div class="card pad kpi"><div class="lbl">Actions checked today ${S.q('Every payment, email, booking or reply your agents asked Sentinel about since midnight.')}</div><div class="val" id="kAct"></div><div class="note" id="kActNote"></div></div>
        <div class="card pad kpi"><div class="lbl">Stopped or held today ${S.q('Actions Sentinel blocked, or sent to a person, because they broke one of your rules.')}</div><div class="val" id="kStop"></div><div class="note" id="kInj"></div></div>
        <div class="card pad kpi"><div class="lbl">Money kept safe today ${S.q('The total amount of payments and refunds that Sentinel stopped or held for a person since midnight.')}</div><div class="val" id="kEur"></div><div class="note">Payments and refunds stopped or held</div></div>
      </div>
      <div class="grid g2 mt">
        <section class="card">
          <div class="chead"><h2>Activity in the last 2 minutes</h2><span class="right help hideSm">Above the line: actions checked. Below: stopped or held.</span></div>
          <div class="chartBox"><canvas id="traffic" aria-label="Chart of agent activity over the last two minutes"></canvas></div>
          <div class="legend" id="legend"></div>
        </section>
        <section class="card">
          <div class="chead"><h2>Latest activity</h2><a class="right link" href="#/activity">See all</a></div>
          <div class="evlist" id="ovEvents"></div>
        </section>
      </div>
      <section class="mt">
        <div class="phead" style="margin:24px 0 12px"><div><h1 style="font-size:18px">Agents to keep an eye on</h1><p>The agents with the highest risk right now.</p></div><div class="acts"><a class="btn sm" href="#/agents">See all agents</a></div></div>
        <div class="agrid" id="ovAgents"></div>
      </section>`;
    const sT = S.$('#startTour'); if (sT) sT.onclick = () => S.tour.start();
    const hW = S.$('#hideWelcome'); if (hW) hW.onclick = () => { S.state.settings.welcomeHidden = true; S.save(); S.$('#welcome').remove(); };
    this.hero(); this.kpis(); this.events(); this.agents(); this.legend(); S.drawTraffic(S.$('#traffic'));
  },
  empty(el) {
    el.innerHTML = `${S.pageHead(`Welcome to Sentinel-AI, ${S.esc(S.state.me.name.split(' ')[0])}`, `Your account for ${S.esc(S.state.org.name)} is ready. Nothing is being watched yet: connect your first AI agent and you will see its actions here, live.`)}
      <section class="card pad" id="statusHero">
        <h2 style="font:600 18px var(--display);margin-bottom:14px">Three steps to protect your first agent</h2>
        <div class="howto">
          <div class="card"><div class="num">1</div><h3>Register the agent</h3><p>Give it a name and a team. Sentinel creates a secret API key just for that agent.</p></div>
          <div class="card"><div class="num">2</div><h3>Add 3 lines to its code</h3><p>Before each important action (paying, emailing, booking), the agent asks Sentinel. Your developer copies a ready-made snippet.</p></div>
          <div class="card"><div class="num">3</div><h3>Watch and decide</h3><p>Every action appears here. Risky ones are stopped or wait for your approval. You can pause or stop the agent at any time.</p></div>
        </div>
        <div class="row wrap mt">${S.can('admin') ? '<a class="btn primary" href="#/connect">Connect my first agent</a>' : '<span class="help">Ask an admin of your team to connect the first agent.</span>'}<a class="btn" href="#/rules">Look at the rules first</a><a class="btn" href="#/help">How it works</a></div>
      </section>
      <p class="help mt">Want to see it working without touching real systems? On the Connect page, use “Try it now” to send test actions from your browser, or run the example agent included in the download.</p>`;
  },
  hero() {
    const pend = S.pending(), crit = S.state.agents.filter((a) => a.risk > 80 && !['terminated', 'isolated'].includes(a.status));
    const risk = S.globalRisk(), n = pend.length + crit.length;
    const cls = crit.length ? 'bad' : n ? 'warn' : 'ok';
    const say = n === 0 ? 'All agents are working normally' : `${n} thing${n > 1 ? 's' : ''} need${n > 1 ? '' : 's'} your attention`;
    const items = [
      ...crit.map((a) => `<a href="#/agents/${a.id}">${S.ava(a)}<span><b>${a.id}</b> is at critical risk (${Math.round(a.risk)}/100)<br><span class="sec" style="font-size:13px">Last: ${S.esc(a.last)}</span></span><span class="go">Investigate</span></a>`),
      ...pend.slice(0, 3).map((p) => { const a = S.agent(p.agent); return `<a href="#/approvals">${a ? S.ava(a) : ''}<span><b>Waiting for approval:</b> ${S.esc(p.plain)}<br><span class="sec" style="font-size:13px">${p.agent} · ${S.ago(p.created)}</span></span><span class="go">Decide</span></a>`; }),
    ];
    if (pend.length > 3) items.push(`<a href="#/approvals"><span>${pend.length - 3} more approval${pend.length - 3 > 1 ? 's' : ''} waiting</span><span class="go">Open approvals</span></a>`);
    S.$('#statusHero').innerHTML = `<div style="text-align:center">${S.gauge(risk)}<div class="help">Overall risk ${S.q('0 means nothing unusual. 100 means serious danger. It combines the risk of all active agents, giving more weight to the riskiest ones.')}</div></div>
      <div><div class="say ${cls}">${say}</div>
      <p class="sec mt-s">${n === 0 ? 'No approvals are waiting and no agent is at critical risk. Sentinel keeps checking every action against your rules.' : 'Sentinel has already stopped anything that broke a rule. These items need a person to look at them.'}</p>
      ${items.length ? `<div class="todo">${items.join('')}</div>` : ''}</div>`;
  },
  kpis() {
    const ag = S.state.agents, working = ag.filter(S.alive).length, c = S.state.counters;
    S.$('#kWork').innerHTML = `${working}<small> of ${ag.length}</small>`;
    const off = ag.length - working;
    S.$('#kWorkNote').textContent = off ? `${off} paused, cut off or stopped` : 'All agents are allowed to act';
    S.$('#kAct').textContent = c.actions.toLocaleString('en-US');
    const lastMin = S.state.events.filter((e) => e.kind === 'action' && e.t > Date.now() - 60e3).length;
    S.$('#kActNote').textContent = `${lastMin} in the last minute`;
    S.$('#kStop').textContent = (c.stopped + c.held).toLocaleString('en-US');
    S.$('#kInj').textContent = `${c.stopped} stopped · ${c.held} sent to a person · ${c.injections} hidden-instruction attacks`;
    S.$('#kEur').textContent = S.fmtEur(c.eur);
  },
  legend() { const l = S.$('#legend'); if (l) l.innerHTML = Object.entries(S.DEPT).map(([k, v]) => `<span style="--c:${v.color}">${S.esc(v.name)}</span>`).join('') + '<span style="--c:var(--alert)">Stopped or held</span>'; },
  events() { S.$('#ovEvents').innerHTML = S.state.events.slice(0, 7).map((e) => S.evRow(e)).join('') || '<div class="empty"><b>No activity yet</b>Actions appear here as soon as an agent asks Sentinel.</div>'; },
  agents() { S.$('#ovAgents').innerHTML = [...S.state.agents].filter((a) => a.status !== 'terminated').sort((a, b) => b.risk - a.risk).slice(0, 3).map(S.agentCard).join(''); },
  tick() { if (!S.$('#traffic')) return; this.kpis(); S.drawTraffic(S.$('#traffic')); },
  onEvent() { if (S.$('#ovEvents')) this.events(); },
  onAgents(el) { if (!S.$('#traffic')) { if (S.state.agents.length) S.route(true); return; } this.hero(); this.agents(); this.legend(); },
  onApproval() { if (S.$('#traffic')) this.hero(); },
};
