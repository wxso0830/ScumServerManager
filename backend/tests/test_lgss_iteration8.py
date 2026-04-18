"""
LGSS SCUM Server Manager - Iteration 8 Tests
Tests for: Log parsing, Event ingestion, Discord webhooks

Features tested:
- POST /api/servers/{id}/logs/import - Upload SCUM log files (UTF-16 encoded)
- GET /api/servers/{id}/events - List events with filters (type, player)
- GET /api/servers/{id}/events/stats - Event statistics with top players
- DELETE /api/servers/{id}/events - Clear all events for a server
- POST /api/servers/{id}/logs/scan - Scan logs folder (returns error if not found)
- GET /api/servers/{id}/discord - Get Discord webhook config
- PUT /api/servers/{id}/discord - Set Discord webhook config
- POST /api/servers/{id}/discord/test - Test Discord webhook (with invalid URL)
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Sample log file paths
ADMIN_LOG_PATH = "/app/backend/sample_logs/admin_20260104133940.log"
ECONOMY_LOG_PATH = "/app/backend/sample_logs/economy_20260104133940.log"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def setup_server(api_client):
    """Reset setup and create a server for testing"""
    # Reset setup
    r = api_client.post(f"{BASE_URL}/api/setup/reset")
    assert r.status_code == 200, f"Reset failed: {r.text}"
    
    # Complete setup
    r = api_client.put(f"{BASE_URL}/api/setup", json={
        "is_admin_confirmed": True,
        "selected_disk": "/",
        "manager_path": "/tmp/LGSSManagers",
        "completed": True
    })
    assert r.status_code == 200, f"Setup failed: {r.text}"
    
    # Create a server
    r = api_client.post(f"{BASE_URL}/api/servers", json={"name": "TestServer8"})
    assert r.status_code == 200, f"Create server failed: {r.text}"
    server = r.json()
    
    yield server
    
    # Cleanup: delete events and server
    api_client.delete(f"{BASE_URL}/api/servers/{server['id']}/events")
    api_client.delete(f"{BASE_URL}/api/servers/{server['id']}")


class TestLogImport:
    """Tests for log file upload and parsing"""
    
    def test_import_admin_log(self, api_client, setup_server):
        """Upload admin log file and verify parsing"""
        server_id = setup_server["id"]
        
        # First clear any existing events
        api_client.delete(f"{BASE_URL}/api/servers/{server_id}/events")
        
        # Upload admin log file
        with open(ADMIN_LOG_PATH, "rb") as f:
            files = {"file": ("admin_20260104133940.log", f)}
            r = requests.post(
                f"{BASE_URL}/api/servers/{server_id}/logs/import",
                files=files
            )
        
        assert r.status_code == 200, f"Import failed: {r.text}"
        data = r.json()
        
        # Verify response structure
        assert data["log_type"] == "admin", f"Expected log_type 'admin', got {data['log_type']}"
        assert data["parsed"] == 27, f"Expected 27 parsed events, got {data['parsed']}"
        assert data["stored"] >= 19, f"Expected at least 19 stored events (dedup), got {data['stored']}"
        assert "filename" in data
        print(f"Admin log import: parsed={data['parsed']}, stored={data['stored']}")
    
    def test_import_economy_log(self, api_client, setup_server):
        """Upload economy log file and verify parsing (filters before/after balance lines)"""
        server_id = setup_server["id"]
        
        # Upload economy log file
        with open(ECONOMY_LOG_PATH, "rb") as f:
            files = {"file": ("economy_20260104133940.log", f)}
            r = requests.post(
                f"{BASE_URL}/api/servers/{server_id}/logs/import",
                files=files
            )
        
        assert r.status_code == 200, f"Import failed: {r.text}"
        data = r.json()
        
        # Verify response - should have 3 trade events (before/after balance lines filtered)
        assert data["log_type"] == "economy", f"Expected log_type 'economy', got {data['log_type']}"
        assert data["parsed"] == 3, f"Expected 3 parsed trade events, got {data['parsed']}"
        print(f"Economy log import: parsed={data['parsed']}, stored={data['stored']}")
    
    def test_duplicate_upload_safe(self, api_client, setup_server):
        """Re-uploading same log should not create duplicates"""
        server_id = setup_server["id"]
        
        # Upload admin log again
        with open(ADMIN_LOG_PATH, "rb") as f:
            files = {"file": ("admin_20260104133940.log", f)}
            r = requests.post(
                f"{BASE_URL}/api/servers/{server_id}/logs/import",
                files=files
            )
        
        assert r.status_code == 200, f"Import failed: {r.text}"
        data = r.json()
        
        # Should parse same number but store 0 (all duplicates)
        assert data["parsed"] == 27, f"Expected 27 parsed, got {data['parsed']}"
        assert data["stored"] == 0, f"Expected 0 stored (duplicates), got {data['stored']}"
        print(f"Duplicate upload: parsed={data['parsed']}, stored={data['stored']} (dedup working)")


class TestEventsList:
    """Tests for event listing and filtering"""
    
    def test_list_events_basic(self, api_client, setup_server):
        """GET /api/servers/{id}/events returns events with correct structure"""
        server_id = setup_server["id"]
        
        r = api_client.get(f"{BASE_URL}/api/servers/{server_id}/events", params={"limit": 5})
        assert r.status_code == 200, f"List events failed: {r.text}"
        data = r.json()
        
        assert "events" in data
        assert "count" in data
        assert data["server_id"] == server_id
        
        if data["events"]:
            ev = data["events"][0]
            # Verify event structure
            assert "id" in ev, "Event missing 'id'"
            assert "ts" in ev, "Event missing 'ts'"
            assert "type" in ev, "Event missing 'type'"
            assert "server_id" in ev, "Event missing 'server_id'"
            assert "source_file" in ev, "Event missing 'source_file'"
            print(f"Event structure verified: id={ev['id'][:8]}..., type={ev['type']}, ts={ev['ts']}")
    
    def test_filter_by_type_admin(self, api_client, setup_server):
        """GET /api/servers/{id}/events?type=admin returns only admin events"""
        server_id = setup_server["id"]
        
        r = api_client.get(f"{BASE_URL}/api/servers/{server_id}/events", params={"type": "admin"})
        assert r.status_code == 200, f"Filter by type failed: {r.text}"
        data = r.json()
        
        # All events should be admin type
        for ev in data["events"]:
            assert ev["type"] == "admin", f"Expected type 'admin', got {ev['type']}"
        
        # Admin events should have command and args
        if data["events"]:
            ev = data["events"][0]
            assert "command" in ev, "Admin event missing 'command'"
            assert "args" in ev, "Admin event missing 'args'"
            assert "player_name" in ev, "Admin event missing 'player_name'"
            print(f"Admin filter: {data['count']} events, sample: {ev['player_name']} ran {ev['command']}")
    
    def test_filter_by_player(self, api_client, setup_server):
        """GET /api/servers/{id}/events?player=WXSO returns events for that player (case-insensitive)"""
        server_id = setup_server["id"]
        
        r = api_client.get(f"{BASE_URL}/api/servers/{server_id}/events", params={"player": "WXSO"})
        assert r.status_code == 200, f"Filter by player failed: {r.text}"
        data = r.json()
        
        # All events should have WXSO as player
        for ev in data["events"]:
            player = ev.get("player_name", "")
            assert "WXSO" in player.upper(), f"Expected player 'WXSO', got {player}"
        
        print(f"Player filter 'WXSO': {data['count']} events found")
        
        # Test case-insensitive
        r2 = api_client.get(f"{BASE_URL}/api/servers/{server_id}/events", params={"player": "wxso"})
        assert r2.status_code == 200
        data2 = r2.json()
        assert data2["count"] == data["count"], "Case-insensitive filter should return same count"


class TestEventStats:
    """Tests for event statistics"""
    
    def test_event_stats_basic(self, api_client, setup_server):
        """GET /api/servers/{id}/events/stats returns aggregated stats"""
        server_id = setup_server["id"]
        
        r = api_client.get(f"{BASE_URL}/api/servers/{server_id}/events/stats")
        assert r.status_code == 200, f"Stats failed: {r.text}"
        data = r.json()
        
        # Verify structure
        assert "total" in data, "Stats missing 'total'"
        assert "by_type" in data, "Stats missing 'by_type'"
        assert "top_players" in data, "Stats missing 'top_players'"
        
        # by_type should have admin and economy counts
        assert "admin" in data["by_type"], "by_type missing 'admin'"
        assert "economy" in data["by_type"], "by_type missing 'economy'"
        
        # top_players should be a list with name and count
        if data["top_players"]:
            tp = data["top_players"][0]
            assert "name" in tp, "top_player missing 'name'"
            assert "count" in tp, "top_player missing 'count'"
        
        print(f"Stats: total={data['total']}, by_type={data['by_type']}, top_players={data['top_players']}")
    
    def test_event_stats_with_days_filter(self, api_client, setup_server):
        """GET /api/servers/{id}/events/stats?days=7 restricts to last 7 days"""
        server_id = setup_server["id"]
        
        r = api_client.get(f"{BASE_URL}/api/servers/{server_id}/events/stats", params={"days": 7})
        assert r.status_code == 200, f"Stats with days failed: {r.text}"
        data = r.json()
        
        # Should still return valid structure
        assert "total" in data
        assert "by_type" in data
        print(f"Stats (last 7 days): total={data['total']}")


class TestClearEvents:
    """Tests for clearing events"""
    
    def test_clear_events(self, api_client, setup_server):
        """DELETE /api/servers/{id}/events clears all events"""
        server_id = setup_server["id"]
        
        # Get current count
        r = api_client.get(f"{BASE_URL}/api/servers/{server_id}/events/stats")
        initial_total = r.json()["total"]
        
        # Clear events
        r = api_client.delete(f"{BASE_URL}/api/servers/{server_id}/events")
        assert r.status_code == 200, f"Clear events failed: {r.text}"
        data = r.json()
        
        assert "deleted" in data, "Response missing 'deleted'"
        print(f"Cleared {data['deleted']} events (was {initial_total})")
        
        # Verify stats now shows 0
        r = api_client.get(f"{BASE_URL}/api/servers/{server_id}/events/stats")
        assert r.status_code == 200
        assert r.json()["total"] == 0, "Total should be 0 after clear"


class TestLogScan:
    """Tests for log folder scanning"""
    
    def test_scan_nonexistent_folder(self, api_client, setup_server):
        """POST /api/servers/{id}/logs/scan returns error when folder doesn't exist"""
        server_id = setup_server["id"]
        
        r = api_client.post(f"{BASE_URL}/api/servers/{server_id}/logs/scan", params={"limit": 20})
        assert r.status_code == 200, f"Scan failed: {r.text}"
        data = r.json()
        
        # Should return error about missing logs directory
        assert "error" in data, "Expected error in response"
        assert "Logs directory not found" in data["error"], f"Unexpected error: {data['error']}"
        assert data["scanned"] == 0, f"Expected scanned=0, got {data['scanned']}"
        print(f"Scan error (expected): {data['error']}")


class TestDiscordWebhooks:
    """Tests for Discord webhook configuration"""
    
    def test_get_discord_default(self, api_client, setup_server):
        """GET /api/servers/{id}/discord returns default empty config"""
        server_id = setup_server["id"]
        
        r = api_client.get(f"{BASE_URL}/api/servers/{server_id}/discord")
        assert r.status_code == 200, f"Get discord failed: {r.text}"
        data = r.json()
        
        # Should have all webhook fields (empty by default)
        expected_fields = ["admin", "chat", "login", "kill", "economy", "violation", "fame", "raid", "mention_role_id"]
        for field in expected_fields:
            assert field in data, f"Discord config missing '{field}'"
        
        print(f"Discord config (default): {data}")
    
    def test_set_discord_webhook(self, api_client, setup_server):
        """PUT /api/servers/{id}/discord persists webhook URLs"""
        server_id = setup_server["id"]
        
        # Set a webhook URL
        payload = {
            "admin": "https://discord.com/api/webhooks/fake123/token456"
        }
        r = api_client.put(f"{BASE_URL}/api/servers/{server_id}/discord", json=payload)
        assert r.status_code == 200, f"Set discord failed: {r.text}"
        
        # Verify it was saved
        r = api_client.get(f"{BASE_URL}/api/servers/{server_id}/discord")
        assert r.status_code == 200
        data = r.json()
        
        assert data["admin"] == payload["admin"], f"Admin webhook not persisted: {data['admin']}"
        print(f"Discord webhook persisted: admin={data['admin']}")
    
    def test_discord_test_invalid_url(self, api_client, setup_server):
        """POST /api/servers/{id}/discord/test with invalid URL returns sent=0"""
        server_id = setup_server["id"]
        
        # Test with invalid URL
        payload = {
            "event_type": "admin",
            "webhook_url": "https://invalid-url.example.com/not-discord"
        }
        r = api_client.post(f"{BASE_URL}/api/servers/{server_id}/discord/test", json=payload)
        assert r.status_code == 200, f"Test discord failed: {r.text}"
        data = r.json()
        
        # Should return sent=0 (not crash)
        assert data["sent"] == 0, f"Expected sent=0 for invalid URL, got {data['sent']}"
        print(f"Discord test with invalid URL: sent={data['sent']} (expected 0)")


class TestEventFieldsVerification:
    """Verify event fields for different event types"""
    
    def test_admin_event_fields(self, api_client, setup_server):
        """Admin events have command, args, player_name fields"""
        server_id = setup_server["id"]
        
        # Re-import admin log for this test
        with open(ADMIN_LOG_PATH, "rb") as f:
            files = {"file": ("admin_20260104133940.log", f)}
            requests.post(f"{BASE_URL}/api/servers/{server_id}/logs/import", files=files)
        
        r = api_client.get(f"{BASE_URL}/api/servers/{server_id}/events", params={"type": "admin", "limit": 5})
        assert r.status_code == 200
        data = r.json()
        
        if data["events"]:
            ev = data["events"][0]
            # Admin-specific fields
            assert "command" in ev, "Admin event missing 'command'"
            assert "args" in ev, "Admin event missing 'args'"
            assert "player_name" in ev, "Admin event missing 'player_name'"
            assert ev["player_name"] == "WXSO", f"Expected player 'WXSO', got {ev['player_name']}"
            print(f"Admin event fields: command={ev['command']}, args={ev['args'][:30]}..., player={ev['player_name']}")
    
    def test_economy_event_fields(self, api_client, setup_server):
        """Economy events have item_code, amount, trader fields"""
        server_id = setup_server["id"]
        
        r = api_client.get(f"{BASE_URL}/api/servers/{server_id}/events", params={"type": "economy", "limit": 5})
        assert r.status_code == 200
        data = r.json()
        
        if data["events"]:
            ev = data["events"][0]
            # Economy-specific fields
            assert "item_code" in ev, "Economy event missing 'item_code'"
            assert "amount" in ev, "Economy event missing 'amount'"
            assert "trader" in ev, "Economy event missing 'trader'"
            assert "player_name" in ev, "Economy event missing 'player_name'"
            print(f"Economy event fields: item={ev['item_code']}, amount={ev['amount']}, trader={ev['trader']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
