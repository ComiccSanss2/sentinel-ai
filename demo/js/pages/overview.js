/* Overview — "Are we safe right now?" */
S.pages = S.pages || {};
S.pages.overview = {
  title: 'Overview',
  render(el) {
    const st = S.state;
    el.innerHTML = `
      ${st.settings.welcomeHidden ? '' : `<div class="welcome" id="welcome">${S.icon('sparkle')}<div><b>New to Sentinel-AI?</b><span class="sec">Take a 1-minute tour of the screen, or read how it works in plain words.</span></div>
        <div class="acts"><button class="btn primary sm" id="startTour">Start the tour</button><a class="btn sm" href="#/help">How it works</a><button class="iconBtn" id="hideWelcome" aria-label="Hide this message" data-tip="Hide this message">✕</button></div></div>`}
      ${S.pageHead('Overview', 'A live summary of what your company\'s AI agents are doing right now, and what needs your attention.')}
      <section class="card pad hero" id="statusHero"></section>
      <div class="grid g4 mt" id="kpis">
        <div class="card pad kpi"><div class="lbl">Agents working ${S.q('Agents that are running right now. Paused, cut off or stopped agents are not counted.')}</div><div class="val" id="kWork"></div><div class="note" id="kWorkNote"></div></div>
        <div class="card pad kpi"><div class="lbl">Actions in the last minute ${S.q('Every email, payment, booking or reply an agent makes counts as one action.')}</div><div class="val" id="kAct"></div><canvas class="spark" id="spAct"></canvas></div>
        <div class="card pad kpi"><div class="lbl">Actions stopped today ${S.q('Actions Sentinel blocked because they broke one of your rules.')}</div><div class="val" id="kStop"></div><div class="note" id="kInj"></div></div>
        <div class="card pad kpi"><div class="lbl">Money protected today ${S.q('The total value of payments and refunds that Sentinel stopped or held for approval.')}</div><div class="val" id="kEur"></div><div class="note">Payments and refunds stopped</div></div>
      </div>
      <div class="grid g2 mt">
        <section class="card">
          <div class="chead"><h2>Activity in the last 2 minutes</h2><span class="right help hideSm">Above the line: actions done. Below: actions stopped.</span></div>
          <div class="chartBox"><canvas id="traffic" aria-label="Chart of agent activity over the last two minutes"></canvas></div>
          <div class="legend"><span style="--c:var(--fin)">Finance</span><span style="--c:var(--mkt)">Marketing</span><span style="--c:var(--log)">Logistics</span><span style="--c:var(--sup)">Support</span><span style="--c:var(--alert)">Stopped</span><span style="--c:#FFB02066">Unusual moment</span></div>
        </section>
        <section class="card">
          <div class="chead"><h2>Latest activity</h2><a class="right link" href="#/activity">See all</a></div>
          <div class="evlist" id="ovEvents"></div>
        </section>
      </div>
      <section class="mt">
        <div class="phead" style="margin:24px 0 12px"><div><h1 style="font-size:18px">Agents to keep an eye on</h1><p>The 3 agents with the highest risk right now.</p></div><div class="acts"><a class="btn sm" href="#/agents">See all agents</a></div></div>
        <div class="agrid" id="ovAgents"></div>
      </section>`;
    const sT = S.$('#startTour'); if (sT) sT.onclick = () => S.tour.start();
    const hW = S.$('#hideWelcome'); if (hW) hW.onclick = () => { S.state.settings.welcomeHidden = true; S.save(); S.$('#welcome').remove(); };
    this.hero(); this.kpis(); this.events(); this.agents(); S.drawTraffic(S.$('#traffic'));
  },
  hero() {
    const pend = S.pending(), crit = S.state.agents.filter((a) => a.risk > 80 && !['terminated', 'isolated'].includes(a.status));
    const risk = S.globalRisk(), n = pend.length + crit.length;
    const cls = crit.length ? 'bad' : n ? 'warn' : 'ok';
    const say = n === 0 ? 'All agents are working normally' : `${n} thing${n > 1 ? 's' : ''} need${n > 1 ? '' : 's'} your attention`;
    const items = [
      ...crit.map((a) => `<a href="#/agents/${a.id}">${S.ava(a)}<span><b>${a.id}</b> is at critical risk (${Math.round(a.risk)}/100)<br><span class="sec" style="font-size:13px">${S.esc(a.last)}</span></span><span class="go">Investigate</span></a>`),
      ...pend.slice(0, 3).map((p) => { const a = S.agent(p.agent); return `<a href="#/approvals">${a ? S.ava(a) : ''}<span><b>Waiting for approval:</b> ${S.esc(p.plain)}<br><span class="sec" style="font-size:13px">${p.agent} · ${S.ago(p.created)}</span></span><span class="go">Decide</span></a>`; }),
    ];
    if (pend.length > 3) items.push(`<a href="#/approvals"><span>${pend.length - 3} more approval${pend.length - 3 > 1 ? 's' : ''} waiting</span><span class="go">Open approvals</span></a>`);
    S.$('#statusHero').innerHTML = `<div style="text-align:center">${S.gauge(risk)}<div class="help">Overall risk ${S.q('0 means nothing unusual. 100 means serious danger. It combines the risk of all running agents, giving more weight to the riskiest ones.')}</div></div>
      <div><div class="say ${cls}">${say}</div>
      <p class="sec mt-s">${n === 0 ? 'No approvals are waiting and no agent is at critical risk. Sentinel keeps checking every action against your rules.' : 'Sentinel has already stopped anything dangerous. These items need a person to look at them.'}</p>
      ${items.length ? `<div class="todo">${items.join('')}</div>` : ''}</div>`;
  },
  kpis() {
    const ag = S.state.agents, working = ag.filter(S.alive).length, c = S.state.counters;
    const minute = Math.round(S.series.FIN.slice(-60).reduce((s, _, i) => s + S.series.FIN.at(-60 + i) + S.series.MKT.at(-60 + i) + S.series.LOG.at(-60 + i) + S.series.SUP.at(-60 + i), 0));
    S.$('#kWork').innerHTML = `${working}<small> of ${ag.length}</small>`;
    const off = ag.length - working;
    S.$('#kWorkNote').textContent = off ? `${off} paused, cut off or stopped` : 'All agents are running';
    S.$('#kAct').textContent = minute.toLocaleString('en-US');
    S.$('#kStop').textContent = c.stopped.toLocaleString('en-US');
    S.$('#kInj').textContent = `Including ${c.injections} hidden-instruction attacks`;
    S.$('#kEur').textContent = '€' + (c.eur / 1e6).toFixed(2) + ' M';
    const s = S.series, tot = s.FIN.slice(-40).map((v, i) => v + s.MKT.at(-40 + i) + s.LOG.at(-40 + i) + s.SUP.at(-40 + i));
    S.spark(S.$('#spAct'), tot, '#22D3EE');
  },
  events() { S.$('#ovEvents').innerHTML = S.state.events.slice(0, 7).map((e) => S.evRow(e)).join('') || '<div class="empty">No activity yet.</div>'; },
  agents() { S.$('#ovAgents').innerHTML = [...S.state.agents].filter((a) => a.status !== 'terminated').sort((a, b) => b.risk - a.risk).slice(0, 3).map(S.agentCard).join(''); },
  tick() { this.kpis(); S.drawTraffic(S.$('#traffic')); },
  onEvent() { this.events(); },
  onAgents() { this.hero(); this.agents(); },
  onApproval() { this.hero(); },
};
