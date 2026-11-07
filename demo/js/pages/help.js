/* Help — how it works, glossary, FAQ, shortcuts */
S.pages.help = {
  title: 'Help',
  render(el) {
    el.innerHTML = `${S.pageHead('How Sentinel-AI works', 'Everything you need to use this console for the first time, in plain words.', `<button class="btn primary" id="hTour">${S.icon('sparkle')} Restart the tour</button>`)}
      <div class="howto">
        <div class="card"><div class="num">1</div><h3>Agents work through Sentinel</h3><p>Your AI agents (for payments, emails, deliveries, support…) do not talk to your apps directly. Every action goes through Sentinel first, like a security gate.</p></div>
        <div class="card"><div class="num">2</div><h3>Every action is checked</h3><p>In a few milliseconds Sentinel compares the action with your <a href="#/rules">rules</a>, looks for tricks hidden in emails and checks facts. Then it lets it pass, stops it, or asks a person.</p></div>
        <div class="card"><div class="num">3</div><h3>You stay in control</h3><p>You see everything live, approve or reject risky actions in <a href="#/approvals">Approvals</a>, and can pause, cut off or stop any agent for good.</p></div>
      </div>
      <section class="card mt"><div class="chead"><h2>Your first 5 minutes</h2></div>
        <ol style="padding:16px 20px 16px 40px;display:flex;flex-direction:column;gap:8px">
          <li>Read the sentence at the top of <a href="#/overview">Overview</a>: it tells you if anything needs you.</li>
          <li>Open <a href="#/approvals">Approvals</a> and decide on a waiting payment. Not sure? Click "See how the agent decided".</li>
          <li>Open an agent in <a href="#/agents">Agents</a> and read "How it decided" from step 1 to 6.</li>
          <li>Try the controls on that page: Pause is always safe and can be undone.</li>
          <li>Change a limit in <a href="#/rules">Rules</a>, for example raise "Large payments need a person" to €15,000.</li>
        </ol></section>
      <section class="card mt"><div class="chead"><h2>Pause, cut off or stop — which one?</h2></div>
        <div style="overflow:auto"><table class="tbl"><thead><tr><th></th><th>What happens</th><th>Can you undo it?</th><th>Use it when…</th></tr></thead><tbody>
          <tr><td><b style="color:var(--paused)">Pause</b></td><td>The agent stops starting new actions.</td><td>Yes, one click</td><td>You are unsure and want time to look.</td></tr>
          <tr><td><b style="color:var(--alert)">Cut off access</b></td><td>Its passwords and internet are removed; it is kept for investigation.</td><td>Yes, by an admin</td><td>You think the agent was tricked or hacked.</td></tr>
          <tr><td><b style="color:var(--kill)">Emergency stop</b></td><td>Stopped for good in under 2 s; unfinished actions cancelled; sealed record saved.</td><td>No</td><td>It is causing real damage right now.</td></tr>
        </tbody></table></div></section>
      <section class="card mt"><div class="chead"><h2>Words you will see</h2></div><dl class="gloss">${S.GLOSSARY.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('')}</dl></section>
      <section class="card mt"><div class="chead"><h2>Questions</h2></div>
        <details class="faq"><summary>Is this connected to real money or real agents?</summary><p>No. This is a demo: all agents, payments and events are simulated in your browser. Nothing is sent anywhere, and your changes are saved only on this computer.</p></details>
        <details class="faq"><summary>What does the overall risk number mean?</summary><p>It goes from 0 to 100. Below 40 everything is normal; 41–60 means watch; 61–80 high; above 80 critical. It gives more weight to the riskiest agents, so one dangerous agent is enough to raise it.</p></details>
        <details class="faq"><summary>What happens if I do not decide on an approval?</summary><p>After 15 minutes the action is rejected automatically. Sentinel never lets a risky action through by default.</p></details>
        <details class="faq"><summary>Why does the emergency stop have a cover?</summary><p>Like a real red button in a factory, it has a safety cover so it cannot be pressed by mistake. You lift the cover, press the button, then type the agent's name to confirm.</p></details>
        <details class="faq"><summary>What is "Simple" and "Expert" at the top?</summary><p>Simple shows plain words. Expert adds technical details such as the AI model, rule codes and the raw data of each action. You can switch at any time.</p></details>
      </section>
      <section class="card mt"><div class="chead"><h2>Keyboard shortcuts</h2></div><div class="pad" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">
        <div><kbd>/</kbd> Search</div><div><kbd>K</kbd> Arm emergency stop (on an agent page)</div><div><kbd>Esc</kbd> Cancel / close</div><div><kbd>G</kbd> then <kbd>A</kbd> Go to Approvals</div></div></section>`;
    S.$('#hTour').onclick = () => { location.hash = '#/overview'; setTimeout(() => S.tour.start(), 250); };
  },
};
