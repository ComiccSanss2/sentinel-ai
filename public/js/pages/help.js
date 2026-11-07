/* Help — how it works, first steps, glossary, FAQ */
S.pages.help = {
  title: 'Help',
  render(el) {
    el.innerHTML = `${S.pageHead('How Sentinel-AI works', 'Everything you need to use this console, in plain words.', `<button class="btn primary" id="hTour">${S.icon('sparkle')} Restart the tour</button>`)}
      <div class="howto">
        <div class="card"><div class="num">1</div><h3>The agent asks first</h3><p>Before an important action (paying, emailing, booking, exporting), your agent sends Sentinel what it is about to do and what text it was working from.</p></div>
        <div class="card"><div class="num">2</div><h3>Sentinel checks it</h3><p>In a few milliseconds the server compares it with your <a href="#/rules">rules</a> and looks for hidden instructions. It answers allow, stop, or “ask a person”.</p></div>
        <div class="card"><div class="num">3</div><h3>You stay in control</h3><p>You see every action live, decide in <a href="#/approvals">Approvals</a>, and can pause, cut off or stop any agent. Everything is written to a tamper-evident log.</p></div>
      </div>
      <section class="card mt"><div class="chead"><h2>Getting started with your company</h2></div>
        <ol style="padding:16px 20px 16px 40px;display:flex;flex-direction:column;gap:8px">
          <li>Go to <a href="#/rules">Rules</a> and adjust the limits to your company: for example the payment amount that needs a person, or the list of known supplier IBANs.</li>
          <li>Go to <a href="#/connect">Connect agents</a>, register your first agent and give the key and the code snippet to whoever builds it.</li>
          <li>Before connecting a real agent, use “Try it now” on the same page to see allowed, held and stopped actions appear.</li>
          <li>Connect Slack or another webhook on the same page, so you are notified even when this page is closed.</li>
          <li>Invite your colleagues in <a href="#/settings">Settings</a>: Analysts can approve and pause; only Admins can stop agents for good and change rules.</li>
        </ol></section>
      <section class="card mt"><div class="chead"><h2>Pause, cut off or stop — which one?</h2></div>
        <div style="overflow:auto"><table class="tbl"><thead><tr><th></th><th>What happens</th><th>Can you undo it?</th><th>Use it when…</th></tr></thead><tbody>
          <tr><td><b style="color:var(--paused)">Pause</b></td><td>Sentinel answers “no” to every action of the agent.</td><td>Yes, one click</td><td>You are unsure and want time to look.</td></tr>
          <tr><td><b style="color:var(--alert)">Cut off access</b></td><td>The agent's key is blocked: every call is refused.</td><td>Yes, by an admin</td><td>You think the agent was tricked or its key leaked.</td></tr>
          <tr><td><b style="color:var(--kill)">Emergency stop</b></td><td>Key revoked for good, waiting actions cancelled, the agent's stop endpoint called, incident opened.</td><td>No</td><td>It is causing real damage right now.</td></tr>
        </tbody></table></div>
        <p class="help" style="padding:0 20px 16px">Important: Sentinel can only stop what goes through it. An agent stops acting as soon as Sentinel refuses its calls; to stop the agent's process instantly, set its <b>stop endpoint</b> (agent page → Connection and settings).</p></section>
      <section class="card mt"><div class="chead"><h2>Words you will see</h2></div><dl class="gloss">${S.GLOSSARY.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('')}</dl></section>
      <section class="card mt"><div class="chead"><h2>Questions</h2></div>
        <details class="faq"><summary>Where is my data?</summary><p>On the computer or server where Sentinel runs, in the “data” folder: db.json (current state) and audit.jsonl (full history). Nothing is sent to anyone else, except the notifications you configure (Slack, webhook).</p></details>
        <details class="faq"><summary>What does the risk number mean?</summary><p>It goes from 0 to 100. Each stopped or held action raises it (hidden instructions raise it more), and it halves every 30 minutes without problems. Below 40 is normal, above 80 is critical.</p></details>
        <details class="faq"><summary>What happens if nobody answers an approval?</summary><p>After ${S.state.server.approvalMinutes} minutes the action is rejected automatically and the agent is told not to do it.</p></details>
        <details class="faq"><summary>Does it work with any AI model?</summary><p>Yes. Sentinel checks actions, not models: OpenAI, Anthropic, Google, open-source models, n8n or Zapier flows… anything that can make a web request before acting.</p></details>
        <details class="faq"><summary>What if Sentinel itself is down?</summary><p>The provided clients refuse the action by default when Sentinel cannot be reached (“fail closed”), so nothing risky slips through. You can change this per agent if needed.</p></details>
      </section>
      <section class="card mt"><div class="chead"><h2>Keyboard shortcuts</h2></div><div class="pad" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">
        <div><kbd>/</kbd> Search</div><div><kbd>K</kbd> Arm emergency stop (on an agent page)</div><div><kbd>Esc</kbd> Cancel / close</div><div><kbd>G</kbd> then <kbd>A</kbd> Go to Approvals</div></div></section>`;
    S.$('#hTour').onclick = () => { location.hash = '#/overview'; setTimeout(() => S.tour.start(), 250); };
  },
};
