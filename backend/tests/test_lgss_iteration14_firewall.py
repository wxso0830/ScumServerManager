"""v1.0.37 — Windows Firewall / Network Setup endpoint regression tests.

Verifies the new /firewall/* and /diagnostics/visibility endpoints respond
with the expected schema and don't crash on Linux (where netsh is absent).
The behavioural firewall logic is exercised only on Windows; on Linux we
assert the API returns the documented "non-windows" fallback shape so the
UI panel can render gracefully in the preview environment.
"""

import os
import pytest
import httpx
import asyncio


BACKEND_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")
API = f"{BACKEND_URL}/api"


@pytest.mark.asyncio
async def test_firewall_full_cycle():
    async with httpx.AsyncClient(timeout=10.0) as c:
        # Setup: create a disposable server profile
        r = await c.post(f"{API}/servers", json={})
        r.raise_for_status()
        sid = r.json()["id"]
        try:
            # /firewall/status
            r = await c.get(f"{API}/servers/{sid}/firewall/status")
            assert r.status_code == 200
            body = r.json()
            for key in ("ok", "needs_admin", "applied", "failed", "rules",
                        "platform", "is_admin", "game_port", "query_port"):
                assert key in body, f"Missing field: {key}"
            assert body["game_port"] == 7777
            assert body["query_port"] == 7778

            # /firewall/apply (idempotent — should not 500 on Linux)
            r = await c.post(f"{API}/servers/{sid}/firewall/apply")
            assert r.status_code == 200
            apply_body = r.json()
            assert "rules" in apply_body
            assert "needs_admin" in apply_body

            # /diagnostics/visibility
            r = await c.get(f"{API}/servers/{sid}/diagnostics/visibility")
            assert r.status_code == 200
            diag = r.json()
            for key in ("server_id", "firewall", "a2s", "master_server",
                        "hints", "is_admin", "game_port", "query_port"):
                assert key in diag
            assert isinstance(diag["hints"], list) and len(diag["hints"]) >= 1
            # On non-windows, the firewall block reports platform=non-windows
            if diag["firewall"].get("platform") == "non-windows":
                assert "apply_firewall" in diag["hints"]

            # DELETE: server cleanup must also wipe firewall rules without error
            r = await c.delete(f"{API}/servers/{sid}/firewall")
            assert r.status_code == 200
            assert r.json()["ok"] is True
        finally:
            await c.delete(f"{API}/servers/{sid}")


@pytest.mark.asyncio
async def test_firewall_status_404_on_missing_server():
    async with httpx.AsyncClient(timeout=5.0) as c:
        r = await c.get(f"{API}/servers/does-not-exist/firewall/status")
        assert r.status_code == 404


if __name__ == "__main__":
    asyncio.run(test_firewall_full_cycle())
    asyncio.run(test_firewall_status_404_on_missing_server())
    print("All firewall regression tests passed.")
