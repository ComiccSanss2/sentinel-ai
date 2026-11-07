/* First-time guided tour */
S.tour = (function () {
  const steps = [
    { sel: null, title: 'Welcome to Sentinel-AI', text: 'AI agents can pay invoices, send emails and answer customers on their own. Sentinel checks every action they ask about and stops the dangerous ones. This tour shows you the 6 places you need.' },
    { sel: '#statusHero', title: '1. Start here every time', text: 'This sentence tells you if anything needs you. Green means all good. Orange or red lists exactly what to look at, with a button to go there.' },
    { sel: '[data-nav="approvals"]', title: '2. Approvals', text: 'When an agent wants to do something risky — like a large payment — it waits here. Nothing happens until someone clicks Approve or Reject.' },
    { sel: '[data-nav="agents"]', title: '3. Agents', text: 'Every AI agent, with its risk from 0 to 100. Open one to read how it decided, step by step, and to pause or stop it.' },
    { sel: '[data-nav="rules"]', title: '4. Rules', text: 'The limits your agents must respect, written in plain words — for example "payments above €10,000 need a person". You can change them.' },
    { sel: '[data-nav="connect"]', title: '5. Connect agents', text: 'Register an agent here to get its secret key and ready-made code. You can also send test actions from your browser to see Sentinel at work.' },
    { sel: '#modeToggle', title: '6. Simple or Expert', text: 'Simple shows plain words. Expert adds technical details for IT and security teams. Switch whenever you like.' },
    { sel: '[data-nav="help"]', title: 'Need help later?', text: 'The Help page explains every word you see and lets you restart this tour. Tip: hover any dotted word or "?" for a short explanation.' },
  ];
  let i = 0, spot, card;
  function place() {
    const s = steps[i];
    let el = s.sel ? document.querySelector(s.sel) : null;
    if (el && window.innerWidth <= 900 && el.closest('.side')) document.body.classList.add('navopen');
    if (el) el.scrollIntoView({ block: 'nearest' });
    const r = el ? el.getBoundingClientRect() : null;
    if (r && r.width) { spot.style.cssText = `left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px`; }
    else { spot.style.cssText = `left:50%;top:40%;width:0;height:0`; }
    card.innerHTML = `<div class="steps">Step ${i + 1} of ${steps.length}</div><h3>${s.title}</h3><p>${s.text}</p>
      <div class="row"><button class="btn sm" id="tSkip">${i === steps.length - 1 ? 'Close' : 'Skip tour'}</button><span class="spacer"></span>${i ? '<button class="btn sm" id="tBack">Back</button>' : ''}<button class="btn primary sm" id="tNext">${i === steps.length - 1 ? 'Finish' : 'Next'}</button></div>`;
    const cw = card.offsetWidth, ch = card.offsetHeight, W = window.innerWidth, H = window.innerHeight;
    let x, y;
    if (!r || !r.width) { x = (W - cw) / 2; y = (H - ch) / 2; }
    else if (r.right + cw + 24 < W && r.width < 300) { x = r.right + 20; y = r.top; }
    else { x = r.left; y = r.bottom + 18; if (y + ch > H - 12) y = r.top - ch - 18; }
    card.style.left = Math.max(12, Math.min(W - cw - 12, x)) + 'px';
    card.style.top = Math.max(12, Math.min(H - ch - 12, y)) + 'px';
    card.querySelector('#tNext').onclick = () => (i === steps.length - 1 ? end() : (i++, place()));
    card.querySelector('#tSkip').onclick = end;
    const b = card.querySelector('#tBack'); if (b) b.onclick = () => { i--; place(); };
    card.querySelector('#tNext').focus();
  }
  function end() {
    spot && spot.remove(); card && card.remove(); spot = card = null;
    document.body.classList.remove('navopen');
    S.state.settings.tourDone = true; S.save();
    window.removeEventListener('resize', place);
  }
  return {
    start() {
      if (location.hash.indexOf('#/overview') !== 0) location.hash = '#/overview';
      end(); i = 0;
      spot = document.createElement('div'); spot.className = 'tourSpot';
      card = document.createElement('div'); card.className = 'tourCard'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Guided tour');
      document.body.append(spot, card);
      window.addEventListener('resize', place);
      setTimeout(place, 60);
    },
    active: () => !!card,
    end,
  };
})();
