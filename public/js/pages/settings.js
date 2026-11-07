/* Settings — display, account, team (real accounts), audit check */
S.pages.settings = {
  title: 'Settings',
  render(el) {
    this.el = el;
    const s = S.state.settings, ad = S.can('admin'), me = S.state.me;
    const seg = (id, val, opts) => `<div class="seg" id="${id}" role="group">${opts.map(([k, n]) => `<button data-v="${k}" class="${val === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    const roleSel = (m) => `<select class="inp" data-role="${m.id}" ${ad && m.id !== me.id ? '' : 'disabled'}>${['admin', 'analyst', 'viewer'].map((r) => `<option value="${r}" ${m.role === r ? 'selected' : ''}>${r[0].toUpperCase() + r.slice(1)}</option>`).join('')}</select>`;
    el.innerHTML = `${S.pageHead('Settings', 'How the console looks for you, your account, and who on your team can do what.')}
      <div class="stack">
      <section class="card"><div class="chead"><h2>Display</h2><span class="right help">Saved in this browser only</span></div>
        <div class="setrow"><div class="tx"><b>Words used on screen</b><span>Simple uses plain words. Expert also shows technical details like action names, parameters and rule patterns.</span></div>${seg('sMode', s.mode, [['simple', 'Simple'], ['expert', 'Expert']])}</div>
        <div class="setrow"><div class="tx"><b>Colours</b><span>Dark for control rooms, light for bright offices and printing.</span></div>${seg('sTheme', s.theme, [['dark', 'Dark'], ['light', 'Light']])}</div>
        <div class="setrow"><div class="tx"><b>Text size</b><span>Make all text bigger.</span></div>${seg('sSize', s.size, [['normal', 'Normal'], ['large', 'Large']])}</div>
        <div class="setrow"><div class="tx"><b>Pop-up messages</b><span>Small messages in the corner when something is stopped or needs approval.</span></div><button class="switch" role="switch" aria-checked="${s.notify.toasts}" id="sToasts" aria-label="Pop-up messages"></button></div>
      </section>
      <section class="card"><div class="chead"><h2>Your account</h2></div>
        <div class="setrow"><div class="tx"><b>${S.esc(me.name)}</b><span>${S.esc(me.email)} · ${me.role} · ${S.esc(S.state.org.name)}</span></div><button class="btn" id="sOut">Sign out</button></div>
        <div class="setrow"><div class="tx"><b>Change password</b><span>At least 10 characters.</span></div>
          <input class="inp" type="password" id="pCur" placeholder="Current password" autocomplete="current-password" style="width:170px"><input class="inp" type="password" id="pNew" placeholder="New password" autocomplete="new-password" style="width:170px"><button class="btn" id="pSave">Change</button></div>
      </section>
      <section class="card"><div class="chead"><h2>Team</h2><span class="right help">Admin: everything · Analyst: approve, pause, cut off · Viewer: look only</span></div>
        <div style="overflow:auto"><table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last sign-in</th>${ad ? '<th></th>' : ''}</tr></thead><tbody>
          ${S.state.team.map((m) => `<tr style="${m.disabled ? 'opacity:.5' : ''}"><td><div class="row"><span class="avatar">${S.esc(m.name.split(' ').map((w) => w[0]).join('').slice(0, 2))}</span>${S.esc(m.name)}${m.id === me.id ? ' <span class="muted">(you)</span>' : ''}</div></td><td class="sec">${S.esc(m.email)}</td><td>${roleSel(m)}</td><td class="sec">${m.lastLogin ? S.ago(m.lastLogin) : 'never'}</td>${ad ? `<td>${m.id !== me.id ? `<button class="btn sm" data-dis="${m.id}" data-v="${m.disabled ? 0 : 1}">${m.disabled ? 'Enable' : 'Disable'}</button>` : ''}</td>` : ''}</tr>`).join('')}
          ${(S.state.invites || []).map((i) => `<tr><td class="sec">Invitation sent</td><td class="sec">${S.esc(i.email)}</td><td>${i.role}</td><td class="sec">expires ${S.date(i.expires)}</td>${ad ? `<td><button class="btn sm" data-inv="${i.id}">Cancel</button></td>` : ''}</tr>`).join('')}
        </tbody></table></div>
        ${ad ? `<div class="setrow"><div class="tx"><b>Invite someone</b><span>You get a link to send them. It works once and expires in 7 days.</span></div>
          <input class="inp" id="iEmail" placeholder="name@company.com" style="width:220px"><select class="inp" id="iRole"><option value="viewer">Viewer</option><option value="analyst">Analyst</option><option value="admin">Admin</option></select><button class="btn primary" id="iSend">Create invitation</button></div><div id="iOut"></div>` : ''}
      </section>
      <section class="card"><div class="chead"><h2>Audit log</h2></div>
        <div class="setrow"><div class="tx"><b>Check that the history was not altered</b><span>Every action, decision and change is written to a chained log on the server (data/audit.jsonl). This recomputes every fingerprint.</span></div><button class="btn" id="aVer">Check now</button></div>
        <div class="setrow"><div class="tx"><b>Download all activity</b><span>Spreadsheet (CSV) of every action recorded.</span></div><a class="btn" href="/api/events.csv" download>${S.icon('download')} Download CSV</a></div>
      </section></div>`;
    const segBind = (id, key) => S.$$(`#${id} button`).forEach((b) => (b.onclick = () => { s[key] = b.dataset.v; S.save(); S.$$(`#${id} button`).forEach((x) => x.classList.toggle('on', x === b)); S.applySettings(); }));
    segBind('sMode', 'mode'); segBind('sTheme', 'theme'); segBind('sSize', 'size');
    S.$('#sToasts').onclick = (e) => { s.notify.toasts = !s.notify.toasts; e.currentTarget.setAttribute('aria-checked', s.notify.toasts); S.save(); };
    S.$('#sOut').onclick = S.signOut;
    S.$('#pSave').onclick = async () => { try { await S.api('POST', '/api/me/password', { current: S.$('#pCur').value, next: S.$('#pNew').value }); S.$('#pCur').value = S.$('#pNew').value = ''; S.toast({ title: 'Password changed', color: 'var(--active)' }); } catch (e) { S.fail(e); } };
    S.$('#aVer').onclick = async () => { try { const r = await S.api('GET', '/api/audit/verify'); S.toast(r.ok ? { title: 'Audit log is intact', body: `${r.entries} records checked, none altered.`, color: 'var(--active)' } : { title: 'Audit log was altered', body: `Problem at record ${r.brokenAt}.`, color: 'var(--kill)', sticky: true }); } catch (e) { S.fail(e); } };
    if (!ad) return;
    el.querySelectorAll('[data-role]').forEach((sel) => (sel.onchange = async () => { try { await S.api('PUT', `/api/team/${sel.dataset.role}`, { role: sel.value }); await S.refresh(); S.toast({ title: 'Role changed' }); } catch (e) { S.fail(e); this.render(el); } }));
    el.querySelectorAll('[data-dis]').forEach((b) => (b.onclick = async () => { try { await S.api('PUT', `/api/team/${b.dataset.dis}`, { disabled: b.dataset.v === '1' }); await S.refresh(); this.render(el); } catch (e) { S.fail(e); } }));
    el.querySelectorAll('[data-inv]').forEach((b) => (b.onclick = async () => { try { await S.api('DELETE', `/api/invites/${b.dataset.inv}`); await S.refresh(); this.render(el); } catch (e) { S.fail(e); } }));
    S.$('#iSend').onclick = async () => {
      try {
        const r = await S.api('POST', '/api/team/invite', { email: S.$('#iEmail').value, role: S.$('#iRole').value });
        await S.refresh(); this.render(el);
        S.$('#iOut').innerHTML = `<div class="setrow"><div class="tx"><b>Send this link to them</b><span>Through your company email or chat. Anyone with the link can create this account, so do not post it publicly.</span></div><input class="inp mono" readonly id="iLink" value="${S.esc(r.link)}" style="width:360px"><button class="btn sm" data-copy="iLink">Copy</button></div>`;
      } catch (e) { S.fail(e); }
    };
  },
};
