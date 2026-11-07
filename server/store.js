'use strict';
/*
 * Sentinel-AI — storage
 * - db.json: current state (written atomically: temp file + rename)
 * - audit.jsonl: append-only log, each line chained to the previous one with SHA-256,
 *   so any later edit or deletion of a line is detectable (GET /api/audit/verify).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'db.json');
    this.auditFile = path.join(dir, 'audit.jsonl');
    const empty = { version: 1, orgs: [], users: [], sessions: [], invites: [], agents: [], policies: [], actions: [], approvals: [], incidents: [], events: [], integrations: {}, counters: {} };
    if (fs.existsSync(this.file)) {
      this.data = { ...empty, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } else {
      this.data = empty;
      this.flush();
    }
    this.lastHash = 'GENESIS';
    if (fs.existsSync(this.auditFile)) {
      const lines = fs.readFileSync(this.auditFile, 'utf8').trim().split('\n').filter(Boolean);
      if (lines.length) this.lastHash = JSON.parse(lines[lines.length - 1]).hash;
    }
    this._t = null;
  }

  id(prefix) { return prefix + '_' + crypto.randomBytes(8).toString('hex'); }

  save() {
    clearTimeout(this._t);
    this._t = setTimeout(() => this.flush(), 150);
  }

  flush() {
    clearTimeout(this._t);
    // keep the hot file small; the full history lives in audit.jsonl
    const d = this.data;
    const cap = (arr, n) => { if (arr.length > n) arr.splice(0, arr.length - n); };
    cap(d.events, 5000); cap(d.actions, 5000); cap(d.approvals, 2000);
    d.sessions = d.sessions.filter((s) => s.expires > Date.now());
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(d));
    fs.renameSync(tmp, this.file);
  }

  audit(orgId, type, payload) {
    const entry = { ts: new Date().toISOString(), org: orgId, type, payload, prev: this.lastHash };
    entry.hash = sha256(entry.prev + '|' + entry.ts + '|' + entry.org + '|' + entry.type + '|' + JSON.stringify(entry.payload));
    fs.appendFileSync(this.auditFile, JSON.stringify(entry) + '\n');
    this.lastHash = entry.hash;
    return entry.hash;
  }

  verifyAudit() {
    if (!fs.existsSync(this.auditFile)) return { ok: true, entries: 0 };
    const lines = fs.readFileSync(this.auditFile, 'utf8').trim().split('\n').filter(Boolean);
    let prev = 'GENESIS';
    for (let i = 0; i < lines.length; i++) {
      const e = JSON.parse(lines[i]);
      const h = sha256(e.prev + '|' + e.ts + '|' + e.org + '|' + e.type + '|' + JSON.stringify(e.payload));
      if (e.prev !== prev || e.hash !== h) return { ok: false, entries: lines.length, brokenAt: i + 1 };
      prev = e.hash;
    }
    return { ok: true, entries: lines.length, lastHash: prev };
  }
}

module.exports = { Store, sha256 };
