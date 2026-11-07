"""
Sentinel-AI client for Python agents — standard library only (Python 3.8+).

    from sentinel_client import Sentinel, Blocked, AgentStopped

    sentinel = Sentinel(url="http://localhost:8787", api_key=os.environ["SENTINEL_API_KEY"])

    with sentinel.guard(action="payments.transfer",
                        summary="Pay €18,400 to ACME",
                        params={"amount": 18400, "iban": "DE89..."},
                        context={"input": email_text, "input_source": "Supplier email"}) as action:
        tx = bank.transfer(...)                  # runs only if allowed or approved by a person
        action.report(ok=True, output={"tx": tx.id})

Exceptions
    Blocked       Sentinel refused the action (a rule, a person, or a timeout). Do NOT execute it.
    AgentStopped  The agent was paused, cut off or stopped for good. Stop the agent loop.
    Unreachable   Sentinel could not be reached. By default the action is refused ("fail closed").
"""
import json
import time
import urllib.error
import urllib.request
from contextlib import contextmanager

__all__ = ["Sentinel", "Action", "SentinelError", "Blocked", "AgentStopped", "Unreachable"]


class SentinelError(Exception):
    pass


class Blocked(SentinelError):
    def __init__(self, message, reasons=None, action_id=None, status=None):
        super().__init__(message)
        self.reasons = reasons or []
        self.action_id = action_id
        self.status = status


class AgentStopped(SentinelError):
    def __init__(self, message, status):
        super().__init__(message)
        self.status = status  # "paused" | "isolated" | "terminated"


class Unreachable(SentinelError):
    pass


class Action:
    def __init__(self, client, data):
        self._c = client
        self.id = data["id"]
        self.decision = data.get("decision")
        self.status = data.get("status")
        self.reasons = data.get("reasons", [])
        self.reported = False

    def report(self, ok=True, output=None, error=None):
        """Tell Sentinel what happened after you executed the action."""
        self.reported = True
        try:
            self._c._req("POST", f"/api/v1/actions/{self.id}/result", {"ok": ok, "output": output, "error": error})
        except SentinelError:
            pass  # reporting is best effort

    def __repr__(self):
        return f"<Action {self.id} {self.status}>"


class Sentinel:
    def __init__(self, url, api_key, timeout=10, fail_open=False):
        if not api_key or not api_key.startswith("sk_"):
            raise ValueError("api_key must be the agent key starting with sk_ (from the Connect page)")
        self.url = url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.fail_open = fail_open

    # ---------- low level ----------
    def _req(self, method, path, body=None, timeout=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.url + path, data=data, method=method, headers={
            "Authorization": "Bearer " + self.api_key,
            "Content-Type": "application/json",
            "User-Agent": "sentinel-client-python/1.0",
        })
        try:
            with urllib.request.urlopen(req, timeout=timeout or self.timeout) as r:
                return json.loads(r.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            try:
                err = json.loads(e.read().decode())
            except Exception:
                err = {"error": "http_" + str(e.code), "message": str(e)}
            code = err.get("error")
            if code in ("agent_terminated", "agent_isolated"):
                raise AgentStopped(err.get("message", code), code.replace("agent_", "")) from None
            raise SentinelError(f"{code}: {err.get('message')}") from None
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            raise Unreachable(f"Cannot reach Sentinel at {self.url}: {e}") from None

    # ---------- public ----------
    def status(self):
        """{'agent':..., 'status':..., 'allowed_to_run': bool}. Raises AgentStopped if cut off or stopped."""
        return self._req("GET", "/api/v1/status")

    def check(self, action, params=None, summary="", context=None, wait_for_approval=True, max_wait=None):
        """Ask Sentinel before acting. Returns an Action if allowed; raises Blocked otherwise."""
        body = {"action": action, "params": params or {}, "summary": summary, "context": context or {}}
        try:
            r = self._req("POST", "/api/v1/check", body)
        except Unreachable:
            if self.fail_open:
                return Action(self, {"id": "offline", "decision": "allow", "status": "allowed"})
            raise
        if r.get("paused"):
            raise AgentStopped("This agent is paused in Sentinel. Wait until a person resumes it.", "paused")
        if r["decision"] in ("allow", "warn"):
            return Action(self, r)
        if r["decision"] == "block":
            raise Blocked("Stopped by Sentinel: " + "; ".join(x["name"] + " — " + x["detail"] for x in r["reasons"]), r["reasons"], r["id"], "blocked")
        # hold: a person must decide
        if not wait_for_approval:
            raise Blocked("Waiting for a person to approve in Sentinel", r["reasons"], r["id"], "pending")
        deadline = time.time() + max_wait if max_wait else None
        while True:
            try:
                s = self._req("GET", f"/api/v1/actions/{r['id']}/wait?timeout=25", timeout=35)
            except Unreachable:
                time.sleep(3)
                continue
            if s["status"] == "approved":
                return Action(self, s)
            if s["status"] != "pending":
                raise Blocked(f"Not approved ({s['status']})", s.get("reasons"), r["id"], s["status"])
            if deadline and time.time() > deadline:
                raise Blocked("Still waiting for approval after max_wait", r["reasons"], r["id"], "pending")

    @contextmanager
    def guard(self, action, params=None, summary="", context=None, wait_for_approval=True, max_wait=None):
        """with sentinel.guard(...) as a:  — the body runs only if Sentinel allows it; the result is reported automatically."""
        a = self.check(action, params, summary, context, wait_for_approval, max_wait)
        try:
            yield a
        except Exception as e:
            if not a.reported:
                a.report(ok=False, error=f"{type(e).__name__}: {e}")
            raise
        else:
            if not a.reported:
                a.report(ok=True)


def verify_signature(body_bytes, header_value, secret):
    """Check the X-Sentinel-Signature header on the stop endpoint (pause/isolate/kill messages)."""
    import hashlib
    import hmac
    expected = "sha256=" + hmac.new(secret.encode(), body_bytes, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header_value or "")
