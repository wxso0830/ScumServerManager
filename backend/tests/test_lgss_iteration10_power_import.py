"""
LGSS SCUM Server Manager - Iteration 10 Tests
Features: Install Gate, Power Buttons (Restart/Stop All/Restart All), Import-Bulk Modal

Tests:
- POST /api/servers/{id}/restart - restart installed server
- POST /api/servers/{id}/restart - 400 on uninstalled server
- POST /api/servers/bulk/stop-all - stops all running servers
- POST /api/servers/bulk/restart-all - restarts all installed servers
- POST /api/servers/{id}/import-bulk - multipart file import
- Import validation: file_keys count mismatch
- Import validation: invalid file_key
- Import validation: wrong file type (INI as JSON)
- Import: unchanged files keep defaults
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

@pytest.fixture(scope="module")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture(scope="module")
def setup_env(api_client):
    """Reset and setup environment with 2 servers, install only one"""
    # Reset
    r = api_client.post(f"{BASE_URL}/api/setup/reset")
    assert r.status_code == 200
    
    # Complete setup
    r = api_client.put(f"{BASE_URL}/api/setup", json={
        "is_admin_confirmed": True,
        "selected_disk": "/",
        "manager_path": "/tmp/LGSSManagers",
        "completed": True
    })
    assert r.status_code == 200
    
    # Create 2 servers
    r1 = api_client.post(f"{BASE_URL}/api/servers", json={"name": "TestServer1"})
    assert r1.status_code == 200
    server1 = r1.json()
    
    r2 = api_client.post(f"{BASE_URL}/api/servers", json={"name": "TestServer2"})
    assert r2.status_code == 200
    server2 = r2.json()
    
    # Install only server1
    r = api_client.post(f"{BASE_URL}/api/servers/{server1['id']}/install")
    assert r.status_code == 200
    server1 = r.json()
    assert server1["installed"] == True
    
    return {"server1": server1, "server2": server2}


class TestRestartEndpoint:
    """Tests for POST /api/servers/{id}/restart"""
    
    def test_restart_installed_server(self, api_client, setup_env):
        """Restart on installed server returns ServerProfile with status=Running"""
        server1 = setup_env["server1"]
        
        # First start the server
        r = api_client.post(f"{BASE_URL}/api/servers/{server1['id']}/start")
        assert r.status_code == 200
        
        # Now restart
        r = api_client.post(f"{BASE_URL}/api/servers/{server1['id']}/restart")
        assert r.status_code == 200
        data = r.json()
        
        assert data["status"] == "Running"
        assert data["id"] == server1["id"]
        assert "settings" in data
        print(f"PASS: Restart installed server returns status=Running")
    
    def test_restart_uninstalled_server_returns_400(self, api_client, setup_env):
        """Restart on uninstalled server returns HTTP 400"""
        server2 = setup_env["server2"]
        
        r = api_client.post(f"{BASE_URL}/api/servers/{server2['id']}/restart")
        assert r.status_code == 400
        data = r.json()
        assert "not installed" in data.get("detail", "").lower()
        print(f"PASS: Restart uninstalled server returns 400 with 'not installed' message")


class TestBulkPowerActions:
    """Tests for bulk stop-all and restart-all"""
    
    def test_stop_all_servers(self, api_client, setup_env):
        """POST /api/servers/bulk/stop-all stops all running installed servers"""
        server1 = setup_env["server1"]
        
        # Start server1
        r = api_client.post(f"{BASE_URL}/api/servers/{server1['id']}/start")
        assert r.status_code == 200
        
        # Verify it's running
        r = api_client.get(f"{BASE_URL}/api/servers/{server1['id']}")
        assert r.json()["status"] == "Running"
        
        # Stop all
        r = api_client.post(f"{BASE_URL}/api/servers/bulk/stop-all")
        assert r.status_code == 200
        data = r.json()
        assert "stopped" in data
        assert data["stopped"] >= 1
        print(f"PASS: stop-all returned stopped={data['stopped']}")
        
        # Verify server1 is now stopped
        r = api_client.get(f"{BASE_URL}/api/servers/{server1['id']}")
        assert r.json()["status"] == "Stopped"
        print(f"PASS: Server status is now Stopped after stop-all")
    
    def test_restart_all_servers(self, api_client, setup_env):
        """POST /api/servers/bulk/restart-all restarts all installed servers"""
        server1 = setup_env["server1"]
        
        # Ensure server1 is stopped first
        api_client.post(f"{BASE_URL}/api/servers/{server1['id']}/stop")
        
        # Restart all
        r = api_client.post(f"{BASE_URL}/api/servers/bulk/restart-all")
        assert r.status_code == 200
        data = r.json()
        assert "restarted" in data
        assert data["restarted"] >= 1
        print(f"PASS: restart-all returned restarted={data['restarted']}")
        
        # Verify server1 is now running
        r = api_client.get(f"{BASE_URL}/api/servers/{server1['id']}")
        assert r.json()["status"] == "Running"
        print(f"PASS: Server status is Running after restart-all")


class TestImportBulk:
    """Tests for POST /api/servers/{id}/import-bulk multipart endpoint"""
    
    def test_import_valid_files(self, api_client, setup_env):
        """Import valid ServerSettings.ini and EconomyOverride.json"""
        server1 = setup_env["server1"]
        
        # Read sample files
        with open("/app/backend/scum_defaults/ServerSettings.ini", "rb") as f:
            ss_content = f.read()
        with open("/app/backend/scum_defaults/EconomyOverride.json", "rb") as f:
            eco_content = f.read()
        
        files = [
            ("files", ("ServerSettings.ini", ss_content, "text/plain")),
            ("files", ("EconomyOverride.json", eco_content, "application/json")),
        ]
        data = {"file_keys": "server_settings,economy"}
        
        r = requests.post(
            f"{BASE_URL}/api/servers/{server1['id']}/import-bulk",
            files=files,
            data=data
        )
        assert r.status_code == 200
        result = r.json()
        
        assert result["imported"] == 2
        assert result["errored"] == 0
        assert len(result["results"]) == 2
        
        for row in result["results"]:
            assert row["ok"] == True
            assert row["error"] is None
        
        assert "server" in result
        print(f"PASS: import-bulk with 2 valid files: imported={result['imported']}, errored={result['errored']}")
    
    def test_import_file_keys_count_mismatch(self, api_client, setup_env):
        """file_keys count != files count returns HTTP 400"""
        server1 = setup_env["server1"]
        
        with open("/app/backend/scum_defaults/ServerSettings.ini", "rb") as f:
            ss_content = f.read()
        
        # Send 1 file but 2 keys
        files = [("files", ("ServerSettings.ini", ss_content, "text/plain"))]
        data = {"file_keys": "server_settings,economy"}
        
        r = requests.post(
            f"{BASE_URL}/api/servers/{server1['id']}/import-bulk",
            files=files,
            data=data
        )
        assert r.status_code == 400
        assert "count" in r.json().get("detail", "").lower() or "mismatch" in r.json().get("detail", "").lower()
        print(f"PASS: file_keys count mismatch returns 400")
    
    def test_import_invalid_file_key(self, api_client, setup_env):
        """Invalid file_key like 'garbage' returns ok=false with error"""
        server1 = setup_env["server1"]
        
        with open("/app/backend/scum_defaults/ServerSettings.ini", "rb") as f:
            ss_content = f.read()
        
        files = [("files", ("test.ini", ss_content, "text/plain"))]
        data = {"file_keys": "garbage"}
        
        r = requests.post(
            f"{BASE_URL}/api/servers/{server1['id']}/import-bulk",
            files=files,
            data=data
        )
        assert r.status_code == 200  # Endpoint returns 200 with per-row errors
        result = r.json()
        
        assert result["errored"] == 1
        assert result["imported"] == 0
        assert result["results"][0]["ok"] == False
        assert "unsupported" in result["results"][0]["error"].lower() or "unknown" in result["results"][0]["error"].lower()
        print(f"PASS: Invalid file_key returns ok=false with error: {result['results'][0]['error']}")
    
    def test_import_wrong_file_type(self, api_client, setup_env):
        """Upload INI file as notifications (JSON) returns validation error"""
        server1 = setup_env["server1"]
        
        # ServerSettings.ini is an INI file, not JSON
        with open("/app/backend/scum_defaults/ServerSettings.ini", "rb") as f:
            ini_content = f.read()
        
        files = [("files", ("ServerSettings.ini", ini_content, "text/plain"))]
        data = {"file_keys": "notifications"}  # notifications expects JSON
        
        r = requests.post(
            f"{BASE_URL}/api/servers/{server1['id']}/import-bulk",
            files=files,
            data=data
        )
        assert r.status_code == 200
        result = r.json()
        
        assert result["errored"] == 1
        assert result["imported"] == 0
        assert result["results"][0]["ok"] == False
        assert "invalid json" in result["results"][0]["error"].lower() or "json" in result["results"][0]["error"].lower()
        print(f"PASS: Wrong file type (INI as JSON) returns error: {result['results'][0]['error']}")
    
    def test_import_mixed_valid_invalid(self, api_client, setup_env):
        """Import 2 valid + 1 invalid: imported=2, errored=1"""
        server1 = setup_env["server1"]
        
        with open("/app/backend/scum_defaults/ServerSettings.ini", "rb") as f:
            ss_content = f.read()
        with open("/app/backend/scum_defaults/EconomyOverride.json", "rb") as f:
            eco_content = f.read()
        
        files = [
            ("files", ("ServerSettings.ini", ss_content, "text/plain")),
            ("files", ("EconomyOverride.json", eco_content, "application/json")),
            ("files", ("ServerSettings.ini", ss_content, "text/plain")),  # Wrong type for notifications
        ]
        data = {"file_keys": "server_settings,economy,notifications"}
        
        r = requests.post(
            f"{BASE_URL}/api/servers/{server1['id']}/import-bulk",
            files=files,
            data=data
        )
        assert r.status_code == 200
        result = r.json()
        
        assert result["imported"] == 2
        assert result["errored"] == 1
        
        # Check individual results
        ss_result = next(r for r in result["results"] if r["file_key"] == "server_settings")
        eco_result = next(r for r in result["results"] if r["file_key"] == "economy")
        notif_result = next(r for r in result["results"] if r["file_key"] == "notifications")
        
        assert ss_result["ok"] == True
        assert eco_result["ok"] == True
        assert notif_result["ok"] == False
        print(f"PASS: Mixed import: imported={result['imported']}, errored={result['errored']}")
    
    def test_unchanged_files_keep_defaults(self, api_client, setup_env):
        """Files not included in import keep their current values"""
        server1 = setup_env["server1"]
        
        # Get current settings
        r = api_client.get(f"{BASE_URL}/api/servers/{server1['id']}")
        before = r.json()
        before_notifications = before.get("settings", {}).get("notifications", [])
        before_raid_times = before.get("settings", {}).get("raid_times", [])
        
        # Import only ServerSettings.ini
        with open("/app/backend/scum_defaults/ServerSettings.ini", "rb") as f:
            ss_content = f.read()
        
        files = [("files", ("ServerSettings.ini", ss_content, "text/plain"))]
        data = {"file_keys": "server_settings"}
        
        r = requests.post(
            f"{BASE_URL}/api/servers/{server1['id']}/import-bulk",
            files=files,
            data=data
        )
        assert r.status_code == 200
        
        # Get settings after import
        r = api_client.get(f"{BASE_URL}/api/servers/{server1['id']}")
        after = r.json()
        after_notifications = after.get("settings", {}).get("notifications", [])
        after_raid_times = after.get("settings", {}).get("raid_times", [])
        
        # Notifications and raid_times should be unchanged
        assert after_notifications == before_notifications
        assert after_raid_times == before_raid_times
        print(f"PASS: Unchanged files (notifications, raid_times) kept their values after partial import")


class TestExportEndpoints:
    """Tests for export endpoints used by the modal"""
    
    def test_export_server_settings(self, api_client, setup_env):
        """GET /api/servers/{id}/export/server_settings returns INI content"""
        server1 = setup_env["server1"]
        
        r = api_client.get(f"{BASE_URL}/api/servers/{server1['id']}/export/server_settings")
        assert r.status_code == 200
        data = r.json()
        
        assert "filename" in data
        assert data["filename"] == "ServerSettings.ini"
        assert "content" in data
        assert "[General]" in data["content"]
        print(f"PASS: export server_settings returns {data['filename']}")
    
    def test_export_economy(self, api_client, setup_env):
        """GET /api/servers/{id}/export/economy returns JSON content"""
        server1 = setup_env["server1"]
        
        r = api_client.get(f"{BASE_URL}/api/servers/{server1['id']}/export/economy")
        assert r.status_code == 200
        data = r.json()
        
        assert data["filename"] == "EconomyOverride.json"
        assert "economy-override" in data["content"]
        print(f"PASS: export economy returns {data['filename']}")
    
    def test_export_all_12_file_keys(self, api_client, setup_env):
        """All 12 file keys should be exportable"""
        server1 = setup_env["server1"]
        
        file_keys = [
            "server_settings", "gameusersettings", "economy", "raid_times",
            "notifications", "input", "admins", "server_admins",
            "banned", "whitelisted", "exclusive", "silenced"
        ]
        
        for key in file_keys:
            r = api_client.get(f"{BASE_URL}/api/servers/{server1['id']}/export/{key}")
            assert r.status_code == 200, f"Export {key} failed with {r.status_code}"
            data = r.json()
            assert "filename" in data
            assert "content" in data
        
        print(f"PASS: All 12 file keys are exportable")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
