/* Rules — the limits Sentinel enforces */
S.ACTIONS = { hold: 'Ask a person first', block: 'Stop the action', warn: 'Only warn me', pause: 'Pause the agent' };
S.pages.rules = {
  title: 'Rules',
  render(el) {
    const ps = S.state.policies, on = ps.filter((p) => p.on).length;
    el.innerHTML = `${S.pageHead('Rules', `Rules are the limits your agents must respect. Sentinel checks every action against them before it happens. ${on} of ${ps.length} rules are on.`, `<button class="btn primary" id="addRule">${S.icon('plus')} Add a rule</button>`)}
      <section class="card">${ps.map((p) => `<div class="rule ${p.on ? '' : 'off'}" data-p="${p.id}">
          <button class="switch" role="switch" aria-checked="${p.on}" aria-label="Turn rule ${S.esc(p.name)} ${p.on ? 'off' : 'on'}" data-act="toggle"></button>
          <div><h3>${S.esc(p.name)} <span class="tag expert-only">${p.id}</span></h3><p>${S.esc(p.desc)}</p>
            ${p.limit != null ? `<label class="lim">Limit: ${p.unit === '€' ? '€' : ''}<input class="inp mono" type="number" min="0" step="${p.unit === '€' ? 500 : 100}" value="${p.limit}" data-act="limit" aria-label="Limit for ${S.esc(p.name)}">${p.unit !== '€' ? p.unit : ''}</label>` : ''}</div>
          <label class="field" style="gap:4px">When it triggers<select class="inp" data-act="action">${Object.entries(S.ACTIONS).map(([k, v]) => `<option value="${k}" ${p.action === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <div class="hits"><b>${p.hits}</b>times this week</div>
        </div>`).join('')}</section>
      <p class="help mt">Tip: start with "Ask a person first". Once you trust a rule, switch it to "Stop the action".</p>`;
    el.querySelectorAll('.rule').forEach((r) => {
      const p = S.policy(r.dataset.p);
      r.querySelector('[data-act=toggle]').onclick = () => { p.on = !p.on; S.save(); S.toast({ title: `Rule ${p.on ? 'turned on' : 'turned off'}`, body: S.esc(p.name), color: p.on ? 'var(--active)' : 'var(--suspicious)' }); this.render(el); };
      const lim = r.querySelector('[data-act=limit]'); if (lim) lim.onchange = () => { p.limit = Math.max(0, +lim.value || 0); S.save(); S.toast({ title: 'Limit saved', body: `${S.esc(p.name)}: ${p.unit === '€' ? S.fmtEur(p.limit) : p.limit + ' ' + p.unit}` }); };
      r.querySelector('[data-act=action]').onchange = (e) => { p.action = e.target.value; S.save(); S.toast({ title: 'Rule updated', body: `${S.esc(p.name)} → ${S.ACTIONS[p.action]}` }); };
    });
    S.$('#addRule').onclick = () => this.add(el);
  },
  add(el) {
    let pick = 0;
    S.modal(`<header>${S.icon('sliders')}<div><h2>Add a rule</h2><p>Pick a starting point. You can change the limit and what happens afterwards.</p></div></header>
      <div class="mb"><div class="tpl" id="tpl">${S.RULE_TEMPLATES.map((t, i) => `<button class="${i === 0 ? 'on' : ''}" data-i="${i}"><b>${t.name}</b><span>${t.desc}</span></button>`).join('')}</div>
      <label class="field">When it triggers<select class="inp" id="tplAct">${Object.entries(S.ACTIONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label></div>
      <footer><button class="btn" id="tCancel">Cancel</button><button class="btn primary" id="tAdd">Add rule</button></footer>`);
    S.$('#tplAct').value = S.RULE_TEMPLATES[0].action;
    S.$('#tpl').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; pick = +b.dataset.i; S.$$('#tpl button').forEach((x) => x.classList.toggle('on', x === b)); S.$('#tplAct').value = S.RULE_TEMPLATES[pick].action; };
    S.$('#tCancel').onclick = S.closeModal;
    S.$('#tAdd').onclick = () => { const t = S.RULE_TEMPLATES[pick]; S.state.policies.push({ ...t, id: 'CUS-' + String(S.state.policies.length + 1).padStart(2, '0'), action: S.$('#tplAct').value, on: true, hits: 0 }); S.save(); S.closeModal(); S.toast({ title: 'Rule added', body: t.name, color: 'var(--active)' }); this.render(el); };
  },
};
