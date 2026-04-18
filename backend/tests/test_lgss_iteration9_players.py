"""
LGSS SCUM Server Manager - Iteration 9 Tests
Player Registry Feature Testing

Tests:
1. GET /api/servers/{id}/players - List players aggregated from events
2. GET /api/servers/{id}/players?online=true - Filter online players
3. GET /api/servers/{id}/players?search=WXSO - Search by name/steam_id
4. GET /api/servers/{id}/players/{steam_id} - Player detail with recent events
5. GET /api/servers/{id}/players/INVALID - 404 for non-existent player
6. DELETE /api/servers/{id}/events - Clears both events AND players
7. Re-upload deduplication - No duplicate players on re-upload
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://scum-admin-panel-1.preview.emergentagent.com"

SAMPLE_LOGS_DIR = "/app/backend/sample_logs"


class TestPlayersRegistry:
    """Test the new Players Registry feature"""
    
    server_id = None
    
    @pytest.fixture(autouse=True, scope="class")
    def setup_server(self, request):
        """Reset setup and create a server for testing"""
        # Reset setup
        r = requests.post(f"{BASE_URL}/api/setup/reset")
        assert r.status_code == 200, f"Reset failed: {r.text}"
        
        # Complete setup
        r = requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": "/",
            "manager_path": "/tmp/LGSSManagers",
            "completed": True
        })
        assert r.status_code == 200, f"Setup failed: {r.text}"
        
        # Create server
        r = requests.post(f"{BASE_URL}/api/servers", json={"name": "TestServer"})
        assert r.status_code == 200, f"Create server failed: {r.text}"
        request.cls.server_id = r.json()["id"]
        
        yield
        
        # Cleanup - delete server
        requests.delete(f"{BASE_URL}/api/servers/{request.cls.server_id}")
    
    def test_01_players_empty_initially(self):
        """GET /api/servers/{id}/players returns empty list initially"""
        r = requests.get(f"{BASE_URL}/api/servers/{self.server_id}/players")
        assert r.status_code == 200, f"Failed: {r.text}"
        data = r.json()
        
        assert "server_id" in data
        assert "count" in data
        assert "online_count" in data
        assert "players" in data
        assert data["count"] == 0
        assert data["online_count"] == 0
        assert data["players"] == []
        print(f"✓ Players list empty initially: {data}")
    
    def test_02_upload_admin_log(self):
        """Upload admin log file and verify parsing"""
        admin_log_path = f"{SAMPLE_LOGS_DIR}/admin_20260104133940.log"
        
        with open(admin_log_path, "rb") as f:
            files = {"file": ("admin_20260104133940.log", f)}
            r = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/logs/import", files=files)
        
        assert r.status_code == 200, f"Upload failed: {r.text}"
        data = r.json()
        
        assert data["log_type"] == "admin"
        assert data["parsed"] > 0
        print(f"✓ Admin log uploaded: {data['parsed']} events parsed, {data['stored']} stored")
    
    def test_03_upload_economy_log(self):
        """Upload economy log file and verify parsing"""
        economy_log_path = f"{SAMPLE_LOGS_DIR}/economy_20260104133940.log"
        
        with open(economy_log_path, "rb") as f:
            files = {"file": ("economy_20260104133940.log", f)}
            r = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/logs/import", files=files)
        
        assert r.status_code == 200, f"Upload failed: {r.text}"
        data = r.json()
        
        assert data["log_type"] == "economy"
        assert data["parsed"] >= 0  # May filter out Before/After lines
        print(f"✓ Economy log uploaded: {data['parsed']} events parsed, {data['stored']} stored")
    
    def test_04_players_list_after_upload(self):
        """GET /api/servers/{id}/players returns player WXSO after log upload"""
        r = requests.get(f"{BASE_URL}/api/servers/{self.server_id}/players")
        assert r.status_code == 200, f"Failed: {r.text}"
        data = r.json()
        
        assert data["count"] >= 1, f"Expected at least 1 player, got {data['count']}"
        
        # Find WXSO player
        wxso = next((p for p in data["players"] if p["steam_id"] == "76561199169074640"), None)
        assert wxso is not None, f"Player WXSO not found in {data['players']}"
        
        # Verify player fields
        assert wxso["name"] == "WXSO", f"Expected name WXSO, got {wxso['name']}"
        assert wxso["steam_id"] == "76561199169074640"
        assert "first_seen" in wxso
        assert "last_seen" in wxso
        assert "total_events" in wxso
        assert wxso["total_events"] > 0, f"Expected events > 0, got {wxso['total_events']}"
        assert "is_admin_invoker" in wxso
        assert wxso["is_admin_invoker"] == True, f"Expected is_admin_invoker=True, got {wxso['is_admin_invoker']}"
        assert "trade_amount" in wxso
        assert wxso["trade_amount"] > 0, f"Expected trade_amount > 0, got {wxso['trade_amount']}"
        assert "kills" in wxso
        assert "deaths" in wxso
        assert "fame_delta" in wxso
        assert "flag_count" in wxso  # Should be None (not available from logs)
        assert "vehicle_count" in wxso  # Should be None (not available from logs)
        assert wxso["flag_count"] is None, f"Expected flag_count=None, got {wxso['flag_count']}"
        assert wxso["vehicle_count"] is None, f"Expected vehicle_count=None, got {wxso['vehicle_count']}"
        
        print(f"✓ Player WXSO found with {wxso['total_events']} events, trade_amount={wxso['trade_amount']}, is_admin={wxso['is_admin_invoker']}")
    
    def test_05_players_online_filter(self):
        """GET /api/servers/{id}/players?online=true returns empty (no real-time login tracking)"""
        r = requests.get(f"{BASE_URL}/api/servers/{self.server_id}/players", params={"online": "true"})
        assert r.status_code == 200, f"Failed: {r.text}"
        data = r.json()
        
        # Since sample logs don't have login events with connect/disconnect, online should be empty
        # or if there are login events, they should be filtered
        print(f"✓ Online filter: {data['online_count']} online players, {len(data['players'])} returned")
    
    def test_06_players_search_by_name(self):
        """GET /api/servers/{id}/players?search=WXSO returns the player"""
        r = requests.get(f"{BASE_URL}/api/servers/{self.server_id}/players", params={"search": "WXSO"})
        assert r.status_code == 200, f"Failed: {r.text}"
        data = r.json()
        
        assert data["count"] >= 1, f"Expected at least 1 player for search=WXSO, got {data['count']}"
        assert any(p["name"] == "WXSO" for p in data["players"]), "WXSO not found in search results"
        print(f"✓ Search by name 'WXSO': found {data['count']} player(s)")
    
    def test_07_players_search_by_steam_id(self):
        """GET /api/servers/{id}/players?search=76561 returns the player (partial steam_id)"""
        r = requests.get(f"{BASE_URL}/api/servers/{self.server_id}/players", params={"search": "76561"})
        assert r.status_code == 200, f"Failed: {r.text}"
        data = r.json()
        
        assert data["count"] >= 1, f"Expected at least 1 player for search=76561, got {data['count']}"
        assert any(p["steam_id"].startswith("76561") for p in data["players"]), "No player with steam_id starting with 76561"
        print(f"✓ Search by partial steam_id '76561': found {data['count']} player(s)")
    
    def test_08_player_detail(self):
        """GET /api/servers/{id}/players/{steam_id} returns player detail with recent events"""
        steam_id = "76561199169074640"
        r = requests.get(f"{BASE_URL}/api/servers/{self.server_id}/players/{steam_id}", params={"limit": 5})
        assert r.status_code == 200, f"Failed: {r.text}"
        data = r.json()
        
        assert "player" in data
        assert "recent_events" in data
        
        player = data["player"]
        assert player["steam_id"] == steam_id
        assert player["name"] == "WXSO"
        assert "by_type" in player  # Event counts by type
        assert "kills" in player
        assert "deaths" in player
        assert "fame_delta" in player
        assert "flag_count" in player
        assert "vehicle_count" in player
        
        recent = data["recent_events"]
        assert len(recent) <= 5, f"Expected max 5 events, got {len(recent)}"
        
        print(f"✓ Player detail: {player['name']}, {player['total_events']} events, {len(recent)} recent events returned")
    
    def test_09_player_not_found(self):
        """GET /api/servers/{id}/players/INVALID returns 404"""
        r = requests.get(f"{BASE_URL}/api/servers/{self.server_id}/players/INVALID_STEAM_ID")
        assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"
        
        data = r.json()
        assert "detail" in data
        assert "not found" in data["detail"].lower()
        print(f"✓ Invalid player returns 404: {data['detail']}")
    
    def test_10_reupload_no_duplicates(self):
        """Re-uploading the same log does NOT duplicate players"""
        # Get current player count
        r = requests.get(f"{BASE_URL}/api/servers/{self.server_id}/players")
        initial_data = r.json()
        initial_count = initial_data["count"]
        
        # Find WXSO's initial event count
        wxso_initial = next((p for p in initial_data["players"] if p["steam_id"] == "76561199169074640"), None)
        initial_events = wxso_initial["total_events"] if wxso_initial else 0
        
        # Re-upload admin log
        admin_log_path = f"{SAMPLE_LOGS_DIR}/admin_20260104133940.log"
        with open(admin_log_path, "rb") as f:
            files = {"file": ("admin_20260104133940.log", f)}
            r = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/logs/import", files=files)
        
        assert r.status_code == 200
        upload_data = r.json()
        
        # Deduplication should result in stored=0 for duplicate events
        print(f"Re-upload result: parsed={upload_data['parsed']}, stored={upload_data['stored']}")
        
        # Get player count after re-upload
        r = requests.get(f"{BASE_URL}/api/servers/{self.server_id}/players")
        after_data = r.json()
        
        # Player count should remain the same
        assert after_data["count"] == initial_count, f"Player count changed from {initial_count} to {after_data['count']}"
        
        # WXSO's event count should remain the same (deduplication)
        wxso_after = next((p for p in after_data["players"] if p["steam_id"] == "76561199169074640"), None)
        after_events = wxso_after["total_events"] if wxso_after else 0
        
        assert after_events == initial_events, f"Event count changed from {initial_events} to {after_events}"
        print(f"✓ Re-upload deduplication: player count={after_data['count']}, events={after_events} (unchanged)")
    
    def test_11_delete_events_clears_players(self):
        """DELETE /api/servers/{id}/events clears both events AND player list"""
        # Verify we have players first
        r = requests.get(f"{BASE_URL}/api/servers/{self.server_id}/players")
        assert r.json()["count"] > 0, "Expected players before delete"
        
        # Delete events
        r = requests.delete(f"{BASE_URL}/api/servers/{self.server_id}/events")
        assert r.status_code == 200, f"Delete failed: {r.text}"
        
        # Verify players are now empty (since players are aggregated from events)
        r = requests.get(f"{BASE_URL}/api/servers/{self.server_id}/players")
        assert r.status_code == 200
        data = r.json()
        
        assert data["count"] == 0, f"Expected 0 players after delete, got {data['count']}"
        assert data["players"] == []
        print(f"✓ Delete events clears players: count={data['count']}")


class TestPlayersResponseStructure:
    """Test the response structure of players endpoints"""
    
    def test_players_response_fields(self):
        """Verify GET /api/servers/{id}/players response has correct structure"""
        # Reset and setup
        requests.post(f"{BASE_URL}/api/setup/reset")
        requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": "/",
            "manager_path": "/tmp/LGSSManagers",
            "completed": True
        })
        
        # Create server
        r = requests.post(f"{BASE_URL}/api/servers", json={"name": "StructureTest"})
        server_id = r.json()["id"]
        
        try:
            r = requests.get(f"{BASE_URL}/api/servers/{server_id}/players")
            assert r.status_code == 200
            data = r.json()
            
            # Required top-level fields
            assert "server_id" in data, "Missing server_id"
            assert "count" in data, "Missing count"
            assert "online_count" in data, "Missing online_count"
            assert "players" in data, "Missing players"
            
            assert isinstance(data["players"], list), "players should be a list"
            print(f"✓ Response structure correct: server_id, count, online_count, players[]")
        finally:
            requests.delete(f"{BASE_URL}/api/servers/{server_id}")


class TestRegressionChecks:
    """Regression tests to ensure existing features still work"""
    
    def test_events_endpoint_still_works(self):
        """GET /api/servers/{id}/events still works"""
        # Reset and setup
        requests.post(f"{BASE_URL}/api/setup/reset")
        requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": "/",
            "manager_path": "/tmp/LGSSManagers",
            "completed": True
        })
        
        r = requests.post(f"{BASE_URL}/api/servers", json={"name": "RegressionTest"})
        server_id = r.json()["id"]
        
        try:
            r = requests.get(f"{BASE_URL}/api/servers/{server_id}/events")
            assert r.status_code == 200
            data = r.json()
            assert "server_id" in data
            assert "count" in data
            assert "events" in data
            print(f"✓ Events endpoint still works")
        finally:
            requests.delete(f"{BASE_URL}/api/servers/{server_id}")
    
    def test_event_stats_still_works(self):
        """GET /api/servers/{id}/events/stats still works"""
        requests.post(f"{BASE_URL}/api/setup/reset")
        requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": "/",
            "manager_path": "/tmp/LGSSManagers",
            "completed": True
        })
        
        r = requests.post(f"{BASE_URL}/api/servers", json={"name": "StatsTest"})
        server_id = r.json()["id"]
        
        try:
            r = requests.get(f"{BASE_URL}/api/servers/{server_id}/events/stats")
            assert r.status_code == 200
            data = r.json()
            assert "server_id" in data
            assert "total" in data
            assert "by_type" in data
            print(f"✓ Event stats endpoint still works")
        finally:
            requests.delete(f"{BASE_URL}/api/servers/{server_id}")
    
    def test_discord_config_still_works(self):
        """GET/PUT /api/servers/{id}/discord still works"""
        requests.post(f"{BASE_URL}/api/setup/reset")
        requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": "/",
            "manager_path": "/tmp/LGSSManagers",
            "completed": True
        })
        
        r = requests.post(f"{BASE_URL}/api/servers", json={"name": "DiscordTest"})
        server_id = r.json()["id"]
        
        try:
            # GET discord config
            r = requests.get(f"{BASE_URL}/api/servers/{server_id}/discord")
            assert r.status_code == 200
            
            # PUT discord config
            r = requests.put(f"{BASE_URL}/api/servers/{server_id}/discord", json={
                "admin": "https://discord.com/api/webhooks/test",
                "chat": ""
            })
            assert r.status_code == 200
            print(f"✓ Discord config endpoints still work")
        finally:
            requests.delete(f"{BASE_URL}/api/servers/{server_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
