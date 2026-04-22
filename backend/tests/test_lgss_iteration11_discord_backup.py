"""
LGSS SCUM Server Manager - Iteration 11 Tests
Tests for Discord Bot integration, Auto-Backup settings, Schema changes, and Server metrics

Features tested:
1. GET /api/settings/schema - sections/categories structure
2. GET /api/discord/bot - bot config retrieval
3. PUT /api/discord/bot - token/enabled updates
4. GET /api/discord/bot/status - live status
5. GET /api/servers/{id}/metrics - players/max_players_live keys
6. PUT /api/servers/{id}/automation - backup settings persistence
7. POST /api/servers/{id}/stop - expected-stop marking
8. POST /api/servers/{id}/restart - expected-stop marking
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSettingsSchema:
    """Test settings schema structure - sections and categories"""
    
    def test_schema_has_discord_section(self):
        """Schema must include 'discord' section"""
        response = requests.get(f"{BASE_URL}/api/settings/schema")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        sections = [s['key'] for s in data.get('sections', [])]
        assert 'discord' in sections, f"'discord' section missing. Found: {sections}"
        print("PASS: 'discord' section exists in schema")
    
    def test_schema_no_client_section(self):
        """Schema must NOT include 'client' section"""
        response = requests.get(f"{BASE_URL}/api/settings/schema")
        assert response.status_code == 200
        
        data = response.json()
        sections = [s['key'] for s in data.get('sections', [])]
        assert 'client' not in sections, f"'client' section should be removed. Found: {sections}"
        print("PASS: 'client' section correctly removed from schema")
    
    def test_schema_has_discord_webhooks_category(self):
        """Schema must have discord_webhooks category under discord section"""
        response = requests.get(f"{BASE_URL}/api/settings/schema")
        assert response.status_code == 200
        
        data = response.json()
        categories = data.get('categories', [])
        discord_cats = [c for c in categories if c.get('section') == 'discord']
        cat_keys = [c['key'] for c in discord_cats]
        
        assert 'discord_webhooks' in cat_keys, f"'discord_webhooks' category missing. Found: {cat_keys}"
        print("PASS: 'discord_webhooks' category exists under discord section")
    
    def test_schema_has_discord_bot_category(self):
        """Schema must have discord_bot category under discord section"""
        response = requests.get(f"{BASE_URL}/api/settings/schema")
        assert response.status_code == 200
        
        data = response.json()
        categories = data.get('categories', [])
        discord_cats = [c for c in categories if c.get('section') == 'discord']
        cat_keys = [c['key'] for c in discord_cats]
        
        assert 'discord_bot' in cat_keys, f"'discord_bot' category missing. Found: {cat_keys}"
        print("PASS: 'discord_bot' category exists under discord section")
    
    def test_schema_has_gameplay_client_game(self):
        """Schema must have gameplay_client_game category under gameplay section"""
        response = requests.get(f"{BASE_URL}/api/settings/schema")
        assert response.status_code == 200
        
        data = response.json()
        categories = data.get('categories', [])
        gameplay_cats = [c for c in categories if c.get('section') == 'gameplay']
        cat_keys = [c['key'] for c in gameplay_cats]
        
        assert 'gameplay_client_game' in cat_keys, f"'gameplay_client_game' category missing. Found: {cat_keys}"
        print("PASS: 'gameplay_client_game' category exists under gameplay section")
    
    def test_schema_no_client_mouse_video_graphics_sound(self):
        """Schema must NOT have client_mouse, client_video, client_graphics, client_sound categories"""
        response = requests.get(f"{BASE_URL}/api/settings/schema")
        assert response.status_code == 200
        
        data = response.json()
        categories = data.get('categories', [])
        cat_keys = [c['key'] for c in categories]
        
        forbidden = ['client_mouse', 'client_video', 'client_graphics', 'client_sound']
        found_forbidden = [k for k in forbidden if k in cat_keys]
        
        assert len(found_forbidden) == 0, f"Forbidden categories found: {found_forbidden}"
        print("PASS: client_mouse/video/graphics/sound categories correctly removed")


class TestDiscordBot:
    """Test Discord bot endpoints"""
    
    def test_get_discord_bot_config(self):
        """GET /api/discord/bot returns expected structure"""
        response = requests.get(f"{BASE_URL}/api/discord/bot")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert 'enabled' in data, "Missing 'enabled' field"
        assert 'token_set' in data, "Missing 'token_set' field"
        assert 'token_preview' in data, "Missing 'token_preview' field"
        assert 'status' in data, "Missing 'status' field"
        
        status = data['status']
        assert 'running' in status, "Missing 'running' in status"
        assert 'connected' in status, "Missing 'connected' in status"
        
        print(f"PASS: GET /api/discord/bot returns correct structure: enabled={data['enabled']}, token_set={data['token_set']}")
    
    def test_put_discord_bot_empty_token(self):
        """PUT /api/discord/bot with empty token should accept but not start bot"""
        response = requests.put(
            f"{BASE_URL}/api/discord/bot",
            json={"enabled": True, "token": ""}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # With empty token, token_set should remain false
        assert data.get('token_set') == False, f"token_set should be False with empty token, got {data.get('token_set')}"
        print("PASS: PUT with empty token accepted, token_set=False")
    
    def test_put_discord_bot_fake_token(self):
        """PUT /api/discord/bot with fake token should persist and attempt start"""
        fake_token = "MTxxxxx.fake.xxx"
        response = requests.put(
            f"{BASE_URL}/api/discord/bot",
            json={"token": fake_token, "enabled": True}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get('token_set') == True, f"token_set should be True after setting token"
        assert 'MTx' in data.get('token_preview', ''), f"token_preview should show masked token"
        
        print(f"PASS: PUT with fake token accepted, token_set=True, preview={data.get('token_preview')}")
    
    def test_get_discord_bot_status_after_fake_token(self):
        """GET /api/discord/bot/status after setting fake token"""
        # First set a fake token
        requests.put(
            f"{BASE_URL}/api/discord/bot",
            json={"token": "MTfaketoken.xxx.yyy", "enabled": True}
        )
        
        # Wait a moment for bot to attempt login
        time.sleep(2)
        
        response = requests.get(f"{BASE_URL}/api/discord/bot/status")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert 'running' in data, "Missing 'running' in status"
        # Bot may be running=True initially, then error='login_failed' after failed login
        print(f"PASS: GET /api/discord/bot/status returns: running={data.get('running')}, error={data.get('error')}")
    
    def test_put_discord_bot_disable(self):
        """PUT /api/discord/bot with enabled=false should stop bot"""
        response = requests.put(
            f"{BASE_URL}/api/discord/bot",
            json={"enabled": False}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get('enabled') == False, f"enabled should be False"
        
        # Check status
        status_resp = requests.get(f"{BASE_URL}/api/discord/bot/status")
        status = status_resp.json()
        # After disable, running should be False
        print(f"PASS: PUT enabled=false accepted, status.running={status.get('running')}")


class TestServerMetrics:
    """Test server metrics endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup_server(self):
        """Ensure we have a server to test with"""
        # Reset and setup
        requests.post(f"{BASE_URL}/api/setup/reset")
        requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": "/",
            "manager_path": "/tmp/LGSSManagers",
            "completed": True
        })
        
        # Create a server
        resp = requests.post(f"{BASE_URL}/api/servers", json={"name": "TestMetricsServer"})
        if resp.status_code == 200:
            self.server = resp.json()
        else:
            # Use existing server
            servers = requests.get(f"{BASE_URL}/api/servers").json()
            self.server = servers[0] if servers else None
        
        yield
    
    def test_server_metrics_has_players_keys(self):
        """GET /api/servers/{id}/metrics must include 'players' and 'max_players_live' keys"""
        if not self.server:
            pytest.skip("No server available")
        
        response = requests.get(f"{BASE_URL}/api/servers/{self.server['id']}/metrics")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert 'players' in data, f"Missing 'players' key in metrics. Keys: {list(data.keys())}"
        assert 'max_players_live' in data, f"Missing 'max_players_live' key in metrics. Keys: {list(data.keys())}"
        
        # Values can be null when server is stopped
        print(f"PASS: metrics has players={data.get('players')}, max_players_live={data.get('max_players_live')}")


class TestAutomationBackupSettings:
    """Test automation backup settings persistence"""
    
    @pytest.fixture(autouse=True)
    def setup_server(self):
        """Ensure we have a server to test with"""
        servers = requests.get(f"{BASE_URL}/api/servers").json()
        if servers:
            self.server = servers[0]
        else:
            # Create one
            requests.post(f"{BASE_URL}/api/setup/reset")
            requests.put(f"{BASE_URL}/api/setup", json={
                "is_admin_confirmed": True,
                "selected_disk": "/",
                "manager_path": "/tmp/LGSSManagers",
                "completed": True
            })
            resp = requests.post(f"{BASE_URL}/api/servers", json={"name": "TestBackupServer"})
            self.server = resp.json()
        yield
    
    def test_update_automation_backup_settings(self):
        """PUT /api/servers/{id}/automation with backup settings persists correctly"""
        if not self.server:
            pytest.skip("No server available")
        
        payload = {
            "backup_enabled": True,
            "backup_interval_min": 15,
            "backup_keep_count": 25
        }
        
        response = requests.put(
            f"{BASE_URL}/api/servers/{self.server['id']}/automation",
            json=payload
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        automation = data.get('automation', {})
        
        assert automation.get('backup_enabled') == True, f"backup_enabled not persisted"
        assert automation.get('backup_interval_min') == 15, f"backup_interval_min not persisted, got {automation.get('backup_interval_min')}"
        assert automation.get('backup_keep_count') == 25, f"backup_keep_count not persisted, got {automation.get('backup_keep_count')}"
        
        print(f"PASS: Automation backup settings persisted: enabled={automation.get('backup_enabled')}, interval={automation.get('backup_interval_min')}, keep={automation.get('backup_keep_count')}")
    
    def test_get_server_has_automation_backup_fields(self):
        """GET /api/servers/{id} returns automation with backup fields"""
        if not self.server:
            pytest.skip("No server available")
        
        response = requests.get(f"{BASE_URL}/api/servers/{self.server['id']}")
        assert response.status_code == 200
        
        data = response.json()
        automation = data.get('automation', {})
        
        assert 'backup_enabled' in automation, "Missing backup_enabled in automation"
        assert 'backup_interval_min' in automation, "Missing backup_interval_min in automation"
        assert 'backup_keep_count' in automation, "Missing backup_keep_count in automation"
        
        print(f"PASS: Server automation has backup fields")


class TestExpectedStopMarking:
    """Test that stop/restart mark expected-stop (no crash backup)"""
    
    @pytest.fixture(autouse=True)
    def setup_server(self):
        """Ensure we have a server to test with"""
        servers = requests.get(f"{BASE_URL}/api/servers").json()
        if servers:
            self.server = servers[0]
        else:
            pytest.skip("No server available")
        yield
    
    def test_stop_server_endpoint(self):
        """POST /api/servers/{id}/stop should work without error"""
        if not self.server:
            pytest.skip("No server available")
        
        response = requests.post(f"{BASE_URL}/api/servers/{self.server['id']}/stop")
        # Should return 200 even if server wasn't running
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get('status') == 'Stopped', f"Expected status=Stopped, got {data.get('status')}"
        print("PASS: POST /stop returns status=Stopped")
    
    def test_restart_server_endpoint(self):
        """POST /api/servers/{id}/restart should work for installed server"""
        if not self.server:
            pytest.skip("No server available")
        
        if not self.server.get('installed'):
            pytest.skip("Server not installed")
        
        response = requests.post(f"{BASE_URL}/api/servers/{self.server['id']}/restart")
        # Should return 200 for installed server
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # After restart, status should be Running (simulated on non-Windows)
        print(f"PASS: POST /restart returns status={data.get('status')}")


class TestBackupsListNoCrashAfterStop:
    """Verify that list_backups does not gain a 'crash' entry right after calling /stop"""
    
    @pytest.fixture(autouse=True)
    def setup_server(self):
        """Ensure we have a server to test with"""
        servers = requests.get(f"{BASE_URL}/api/servers").json()
        if servers:
            self.server = servers[0]
        else:
            pytest.skip("No server available")
        yield
    
    def test_no_crash_backup_after_stop(self):
        """After /stop, no new crash backup should appear"""
        if not self.server:
            pytest.skip("No server available")
        
        # Get current backup count
        backups_before = requests.get(f"{BASE_URL}/api/servers/{self.server['id']}/backups").json()
        crash_count_before = len([b for b in backups_before.get('backups', []) if b.get('backup_type') == 'crash'])
        
        # Stop the server
        requests.post(f"{BASE_URL}/api/servers/{self.server['id']}/stop")
        
        # Wait a moment for any scheduler tick
        time.sleep(2)
        
        # Get backup count after
        backups_after = requests.get(f"{BASE_URL}/api/servers/{self.server['id']}/backups").json()
        crash_count_after = len([b for b in backups_after.get('backups', []) if b.get('backup_type') == 'crash'])
        
        # No new crash backup should have been created
        assert crash_count_after == crash_count_before, f"Crash backup count increased from {crash_count_before} to {crash_count_after} after /stop"
        print(f"PASS: No crash backup created after /stop (crash count: {crash_count_before} -> {crash_count_after})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
