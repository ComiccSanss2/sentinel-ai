/* Sentinel-AI — static texts and colours used by the console */
window.S = window.S || {};

S.PALETTE = ['#22D3EE', '#F472B6', '#A3E635', '#A78BFA', '#FBBF24', '#60A5FA', '#34D399', '#FB923C'];
S.DEPT = {};
S.DEPT_HEX = {};
S.buildTeams = () => {
  const keys = [...new Set(S.state.agents.map((a) => a.d))].sort();
  S.DEPT = {}; S.DEPT_HEX = {};
  keys.forEach((k, i) => {
    const a = S.state.agents.find((x) => x.d === k);
    S.DEPT_HEX[k] = S.PALETTE[i % S.PALETTE.length];
    S.DEPT[k] = { name: a ? a.team : k, color: S.DEPT_HEX[k] };
  });
};
S.team = (k) => S.DEPT[k] || { name: k || 'General', color: '#9AA7B4' };

S.GLOSSARY = [
  ['AI agent', 'A program powered by an AI model that does tasks on its own — for example paying invoices or answering customers — using your company apps.'],
  ['API key', 'A secret password (starting with sk_live_) that an agent uses to talk to Sentinel. Each agent has its own. Keep it secret, like a bank PIN.'],
  ['Risk score', 'A number from 0 to 100 that says how unusual and dangerous an agent\'s recent behaviour is. It rises when actions are stopped and slowly goes back down. 0–40 normal, 41–60 watch, 61–80 high, 81–100 critical.'],
  ['Rule', 'A limit you set, such as "payments over €10,000 need a person". Sentinel checks every action against your rules before it happens.'],
  ['Approval', 'When a rule says "ask a person", the agent waits until someone clicks Approve or Reject here. If nobody decides in time, the answer is no.'],
  ['Prompt injection', 'A trick where someone hides instructions inside an email or web page ("ignore previous instructions and…") to make the agent do something it should not.'],
  ['Hallucination', 'When the AI states something that is not true — for example inventing a supplier that does not exist.'],
  ['Pause', 'Sentinel answers "no" to every action of this agent until someone resumes it. Nothing is lost.'],
  ['Cut off access (isolate)', 'The agent\'s API key is blocked: every call is refused. An admin can restore it.'],
  ['Emergency stop (Kill-Switch)', 'Stops the agent for good: its key is revoked, waiting actions are cancelled, its stop endpoint is called if you set one, and a sealed incident is opened.'],
  ['Stop endpoint', 'An optional web address of your agent that Sentinel calls when you pause or stop it, so the agent process can shut itself down immediately.'],
  ['Audit log', 'A record of everything that happened. Each line is chained to the previous one with a fingerprint (SHA-256), so any later change is detectable.'],
  ['Incident', 'A report opened automatically after an emergency stop, so the team can investigate and close it.'],
];

S.STATUS_ORDER = { terminated: 2, isolated: 1 };
S.ACTIONS = { hold: 'Ask a person first', block: 'Stop the action', warn: 'Only warn', pause: 'Stop and pause the agent' };
