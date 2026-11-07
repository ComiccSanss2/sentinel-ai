/* Rules — real limits enforced by the server on every action */
S.RULE_HELP = {
  amount_limit: { what: 'Stops or holds an action when a number in it (usually the amount) is above your limit.', fields: [['field', 'Which value to check', 'text', 'amount'], ['limit', 'Limit', 'number']] },
  allowlist: { what: 'Only lets through values that are on your list — e.g. known supplier IBANs, or email domains.', fields: [['field', 'Which value to check', 'text', 'iban'], ['mode', 'Compare', 'select', [['exact', 'Exact value'], ['domain', 'Email domain']]], ['values', 'Allowed values (one per line)', 'textarea']] },
  prompt_injection: { what: 'Reads the text the agent received and its action, looking for hidden orders like “ignore previous instructions”, requests to move data, or invisible characters.', fields: [] },
  rate_limit: { what: 'Limits how much an agent can do in an hour or a day — e.g. how many people it can email.', fields: [['max', 'Maximum', 'number'], ['window', 'Per', 'select', [['day', '24 hours'], ['hour', 'hour']]], ['count_field', 'Count this value (empty = count actions)', 'text', 'recipients']] },
  office_hours: { what: 'Actions outside your working hours wait for a person or are stopped.', fields: [['start', 'From (hour)', 'number'], ['end', 'Until (hour)', 'number'], ['weekdays_only', 'Monday to Friday only', 'check']] },
  deny_action: { what: 'Every action with these names is stopped, sent to a person, or flagged — depending on what you choose.', fields: [] },
  auto_pause: { what: 'Pauses an agent automatically when too many of its actions are stopped in a short time.', fields: [['count', 'Stopped actions', 'number'], ['minutes', 'Within (minutes)', 'number']] },
};
S.pages.rules = {
  title: 'Rules',
  render(el, _p, fresh) {
    this.el = el;
    if (!fresh) S.api('GET', '/api/policies').then((ps) => { if (JSON.stringify(ps) !== JSON.stringify(S.state.policies)) { S.state.policies = ps; if (S.$('.rule') || !ps.length) this.render(el, null, true); } }).catch(() => {});
    const ps = S.state.policies, on = ps.filter((p) => p.on).length, ad = S.can('admin');
    el.innerHTML = `${S.pageHead('Rules', `Rules are the limits your agents must respect. The server checks every action against them before it happens. ${on} of ${ps.length} rules are on.${ad ? '' : ' Only admins can change them.'}`, ad ? `<button class="btn" id="addRoblox">Add Roblox Studio rules</button><button class="btn primary" id="addRule">${S.icon('plus')} Add a rule</button>` : '')}
      <section class="card">${ps.map((p) => this.row(p, ad)).join('') || '<div class="empty"><b>No rules</b>Add one to start protecting your agents.</div>'}</section>
      <p class="help mt">Tip: start with “Ask a person first”. Once you trust a rule, switch it to “Stop the action”. ${S.q('Which actions a rule applies to is decided by its action names, e.g. *pay* matches payments.transfer and stripe.payout. You can see and change them in Expert mode.')}</p>`;
    el.querySelectorAll('.rule').forEach((r) => this.bind(r));
    const add = S.$('#addRule'); if (add) add.onclick = () => this.add();
    const rb = S.$('#addRoblox'); if (rb) rb.onclick = async () => { try { const r = await S.api('POST', '/api/policies/preset', { preset: 'roblox' }); S.state.policies = r.policies; S.toast({ title: r.added ? `${r.added} Roblox rules added` : 'Roblox rules already added', body: 'Running code, inserting Creator Store assets and uploads now wait for a person.', color: 'var(--active)' }); this.render(this.el, null, true); } catch (e) { S.fail(e); } };
  },
  row(p, ad) {
    const h = S.RULE_HELP[p.type] || { fields: [] }, c = p.config || {}, dis = ad ? '' : 'disabled';
    const f = h.fields.map(([k, label, kind, ph]) => {
      if (kind === 'select') return `<label class="lim">${label}<select class="inp" data-k="${k}" ${dis}>${ph.map(([v, n]) => `<option value="${v}" ${c[k] === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
      if (kind === 'textarea') return `<label class="lim" style="display:flex;flex-direction:column;align-items:stretch;width:100%">${label}<textarea class="inp mono" rows="3" data-k="${k}" ${dis} placeholder="IT60 X054 2811 1010 0000 0123 456">${S.esc((c[k] || []).join('\n'))}</textarea></label>`;
      if (kind === 'check') return `<label class="lim"><input type="checkbox" data-k="${k}" ${c[k] !== false ? 'checked' : ''} ${dis}> ${label}</label>`;
      return `<label class="lim">${label}<input class="inp mono" ${kind === 'number' ? 'type="number" min="0"' : ''} data-k="${k}" value="${S.esc(c[k] ?? '')}" placeholder="${ph || ''}" ${dis} style="width:${kind === 'number' ? 120 : 150}px"></label>`;
    }).join(' ');
    return `<div class="rule ${p.on ? '' : 'off'}" data-p="${p.id}">
      <button class="switch" role="switch" aria-checked="${p.on}" aria-label="Turn rule ${S.esc(p.name)} ${p.on ? 'off' : 'on'}" data-act="toggle" ${dis}></button>
      <div><h3>${S.esc(p.name)} <span class="tag">${S.esc((S.state.ruleTypes[p.type] || {}).label || p.type)}</span></h3><p>${S.esc(p.desc)}</p>
        <div class="row wrap" style="gap:4px 14px">${f}</div>
        <label class="lim expert-only">Applies to actions named<input class="inp mono" data-match value="${S.esc(p.match)}" ${dis} style="width:260px"></label>
        ${ad ? `<div class="row mt-s"><button class="btn sm primary hidden" data-act="save">Save changes</button>${ad ? '<button class="btn sm" data-act="del">Delete rule</button>' : ''}</div>` : ''}</div>
      <label class="field" style="gap:4px">When it triggers<select class="inp" data-act="action" ${dis}>${Object.entries(S.ACTIONS).map(([k, v]) => `<option value="${k}" ${p.action === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <div class="hits"><b>${p.hits || 0}</b>times triggered</div>
    </div>`;
  },
  bind(r) {
    const p = S.policy(r.dataset.p); if (!S.can('admin')) return;
    const put = async (body, msg) => { try { const nr = await S.api('PUT', `/api/policies/${p.id}`, body); Object.assign(p, nr); S.toast({ title: msg, body: S.esc(p.name), color: 'var(--active)' }); this.render(this.el, null, true); } catch (e) { S.fail(e); } };
    r.querySelector('[data-act=toggle]').onclick = () => put({ on: !p.on }, `Rule ${p.on ? 'turned off' : 'turned on'}`);
    r.querySelector('[data-act=action]').onchange = (e) => put({ action: e.target.value }, 'Rule updated');
    const save = r.querySelector('[data-act=save]');
    r.querySelectorAll('[data-k],[data-match]').forEach((i) => i.addEventListener('input', () => save.classList.remove('hidden')));
    r.querySelectorAll('[data-k][type=checkbox]').forEach((i) => i.addEventListener('change', () => save.classList.remove('hidden')));
    save.onclick = () => {
      const config = {};
      r.querySelectorAll('[data-k]').forEach((i) => { const k = i.dataset.k; config[k] = i.type === 'checkbox' ? i.checked : i.tagName === 'TEXTAREA' ? i.value.split(/\n|,/).map((s) => s.trim()).filter(Boolean) : i.type === 'number' ? Number(i.value) : i.value.trim(); });
      put({ config, match: r.querySelector('[data-match]').value }, 'Rule saved');
    };
    r.querySelector('[data-act=del]').onclick = () => {
      S.modal(`<header>${S.icon('warn')}<div><h2>Delete “${S.esc(p.name)}”?</h2><p>Agents will no longer be checked against this rule.</p></div></header><footer style="padding-top:16px"><button class="btn" id="rC">Cancel</button><button class="btn danger" id="rG">Delete rule</button></footer>`);
      S.$('#rC').onclick = S.closeModal;
      S.$('#rG').onclick = async () => { try { await S.api('DELETE', `/api/policies/${p.id}`); S.state.policies = S.state.policies.filter((x) => x !== p); S.closeModal(); this.render(this.el); } catch (e) { S.fail(e); } };
    };
  },
  add() {
    let type = 'amount_limit';
    const types = Object.entries(S.state.ruleTypes);
    S.modal(`<header>${S.icon('sliders')}<div><h2>Add a rule</h2><p>Choose what kind of check you want. You can fine-tune it after.</p></div></header>
      <div class="mb"><div class="tpl" id="tpl">${types.map(([k, v], i) => `<button class="${i === 0 ? 'on' : ''}" data-t="${k}"><b>${v.label}</b><span>${S.RULE_HELP[k].what}</span></button>`).join('')}</div>
      <label class="field">Name<input class="inp" id="nName" placeholder="e.g. Payments to new suppliers need a person"></label>
      <label class="field"><span>Applies to actions named ${S.q('Action names your agents send, with * as wildcard. Examples: *pay*,*transfer* for payments; *email* for emails; * for everything.')}</span><input class="inp mono" id="nMatch" value="*"></label>
      <label class="field">When it triggers<select class="inp" id="nAct">${Object.entries(S.ACTIONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label></div>
      <footer><button class="btn" id="tCancel">Cancel</button><button class="btn primary" id="tAdd">Add rule</button></footer>`);
    S.$('#tpl').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; type = b.dataset.t; S.$$('#tpl button').forEach((x) => x.classList.toggle('on', x === b)); };
    S.$('#tCancel').onclick = S.closeModal;
    S.$('#tAdd').onclick = async () => {
      const defaults = { amount_limit: { field: 'amount', limit: 1000 }, allowlist: { field: 'iban', values: [], mode: 'exact' }, rate_limit: { max: 100, window: 'day', count_field: '' }, office_hours: { start: 8, end: 19, weekdays_only: true }, auto_pause: { count: 3, minutes: 10 } };
      try {
        const r = await S.api('POST', '/api/policies', { type, name: S.$('#nName').value.trim() || S.state.ruleTypes[type].label, desc: S.RULE_HELP[type].what, match: S.$('#nMatch').value.trim() || '*', action: S.$('#nAct').value, config: defaults[type] || {} });
        if (!S.policy(r.id)) S.state.policies.push(r);
        S.closeModal(); S.toast({ title: 'Rule added', body: S.esc(r.name), color: 'var(--active)' }); this.render(this.el);
      } catch (e) { S.fail(e); }
    };
  },
  onPolicies() { if (!document.querySelector('.rule [data-act=save]:not(.hidden)')) this.render(this.el); },
};
