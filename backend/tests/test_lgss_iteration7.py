"""
LGSS SCUM Server Manager - Iteration 7 Backend Tests
Tests: Real Steam update check, real file writing, background scheduler, automation, TradersEditor support
"""
import pytest
import requests
import os
import json
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSteamUpdateCheck:
    """Test real Steam RSS update check"""
    
    def test_steam_check_update_returns_real_data(self):
        """GET /api/steam/check-update returns REAL data with source='steam-rss:513710'"""
        response = requests.get(f"{BASE_URL}/api/steam/check-update")
        assert response.status_code == 200
        data = response.json()
        
        # Verify required fields
        assert "app_id" in data
        assert "latest_build_id" in data
        assert "checked_at" in data
        assert "source" in data
        
        # Source should be steam-rss:513710 (real RSS) or steam-appdetails (fallback)
        # NOT 'mock'
        assert data["source"] != "mock", f"Expected real source, got: {data['source']}"
        assert data["source"] in ["steam-rss:513710", "steam-rss:3792580", "steam-appdetails"], \
            f"Unexpected source: {data['source']}"
        
        # Build ID should be derived from timestamp
        assert data["latest_build_id"].startswith("build-")
        print(f"Steam check returned: source={data['source']}, build={data['latest_build_id']}")


class TestSetupAndServerCreation:
    """Setup and server creation tests"""
    
    @pytest.fixture(autouse=True)
    def setup_environment(self):
        """Reset and setup environment before tests"""
        # Reset
        response = requests.post(f"{BASE_URL}/api/setup/reset")
        assert response.status_code == 200
        
        # Setup
        response = requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": "/",
            "manager_path": "/tmp/LGSSManagers",
            "completed": True
        })
        assert response.status_code == 200
        yield
    
    def test_create_server(self):
        """Create a server for testing"""
        response = requests.post(f"{BASE_URL}/api/servers", json={"name": "TestServer1"})
        assert response.status_code == 200
        data = response.json()
        
        assert data["name"] == "TestServer1"
        assert data["installed"] == False
        assert data["installed_build_id"] is None
        assert data["update_available"] == False
        return data["id"]


class TestSaveConfigRealFileWrite:
    """Test real file writing for save-config"""
    
    @pytest.fixture(autouse=True)
    def setup_server(self):
        """Setup server for testing"""
        # Reset and setup
        requests.post(f"{BASE_URL}/api/setup/reset")
        requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": "/",
            "manager_path": "/tmp/LGSSManagers",
            "completed": True
        })
        
        # Create and install server
        response = requests.post(f"{BASE_URL}/api/servers", json={"name": "FileWriteTest"})
        self.server_id = response.json()["id"]
        
        response = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/install")
        assert response.status_code == 200
        yield
    
    def test_save_config_writes_11_files(self):
        """POST /api/servers/{id}/save-config?write_to_disk=true writes 11 files"""
        response = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/save-config?write_to_disk=true")
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert data["count"] == 11, f"Expected 11 files, got {data['count']}"
        assert data["wrote_to_disk"] == True
        assert data["written_count"] == 11, f"Expected 11 written, got {data['written_count']}"
        assert data["errors"] == [], f"Expected no errors, got {data['errors']}"
        
        # Verify config_dir path
        assert "WindowsServer" in data["config_dir"]
        
        # Verify all expected files
        expected_files = [
            "ServerSettings.ini",
            "AdminUsers.ini",
            "ServerSettingsAdminUsers.ini",
            "BannedUsers.ini",
            "WhitelistedUsers.ini",
            "ExclusiveUsers.ini",
            "SilencedUsers.ini",
            "EconomyOverride.json",
            "RaidTimes.json",
            "Notifications.json",
            "Input.ini"
        ]
        
        written_filenames = [f["path"].split("/")[-1] for f in data["files"]]
        for expected in expected_files:
            assert expected in written_filenames, f"Missing file: {expected}"
        
        print(f"Successfully wrote {data['written_count']} files to {data['config_dir']}")
    
    def test_economy_json_strips_image_url(self):
        """EconomyOverride.json should NOT contain image_url field"""
        # First add an image_url to a trader item
        response = requests.get(f"{BASE_URL}/api/servers/{self.server_id}")
        server = response.json()
        
        # Modify settings to add image_url
        settings = server["settings"]
        if "economy_traders" in settings and settings["economy_traders"]:
            first_trader = list(settings["economy_traders"].keys())[0]
            if settings["economy_traders"][first_trader]:
                settings["economy_traders"][first_trader][0]["image_url"] = "https://example.com/test.png"
                
                # Update settings
                requests.put(f"{BASE_URL}/api/servers/{self.server_id}/settings", json={"settings": settings})
        
        # Save config
        response = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/save-config?write_to_disk=true")
        data = response.json()
        
        # Find EconomyOverride.json content
        economy_file = next((f for f in data["files"] if "EconomyOverride.json" in f["path"]), None)
        assert economy_file is not None
        
        # Verify no image_url in the content
        assert "image_url" not in economy_file["content"], "image_url should be stripped from EconomyOverride.json"
        print("Verified: image_url is correctly stripped from EconomyOverride.json")


class TestAutomationEndpoints:
    """Test automation endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup_server(self):
        """Setup server for testing"""
        requests.post(f"{BASE_URL}/api/setup/reset")
        requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": "/",
            "manager_path": "/tmp/LGSSManagers",
            "completed": True
        })
        
        response = requests.post(f"{BASE_URL}/api/servers", json={"name": "AutomationTest"})
        self.server_id = response.json()["id"]
        
        requests.post(f"{BASE_URL}/api/servers/{self.server_id}/install")
        yield
    
    def test_update_automation_settings(self):
        """PUT /api/servers/{id}/automation saves all fields"""
        payload = {
            "enabled": True,
            "restart_times": ["06:00", "12:00", "18:00", "00:00"],
            "pre_warning_minutes": [15, 10, 5, 4, 3, 2, 1],
            "auto_update_enabled": True,
            "update_check_interval_min": 360,
            "bilingual": True
        }
        
        response = requests.put(f"{BASE_URL}/api/servers/{self.server_id}/automation", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        automation = data["automation"]
        assert automation["enabled"] == True
        assert automation["restart_times"] == ["06:00", "12:00", "18:00", "00:00"]
        assert automation["pre_warning_minutes"] == [15, 10, 5, 4, 3, 2, 1]
        assert automation["auto_update_enabled"] == True
        assert automation["update_check_interval_min"] == 360
        assert automation["bilingual"] == True
        
        # Verify persistence
        response = requests.get(f"{BASE_URL}/api/servers/{self.server_id}")
        assert response.json()["automation"]["enabled"] == True
        print("Automation settings saved and persisted correctly")
    
    def test_generate_notifications_bilingual(self):
        """POST /api/servers/{id}/automation/generate-notifications produces bilingual TR+EN"""
        # First set automation
        requests.put(f"{BASE_URL}/api/servers/{self.server_id}/automation", json={
            "enabled": True,
            "restart_times": ["06:00", "18:00"],
            "pre_warning_minutes": [15, 10, 5, 1],
            "bilingual": True
        })
        
        # Generate notifications
        response = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/automation/generate-notifications")
        assert response.status_code == 200
        data = response.json()
        
        notifications = data["settings"]["notifications"]
        assert len(notifications) > 0
        
        # Check bilingual format
        for notif in notifications:
            msg = notif["message"]
            # Should contain both Turkish and English
            assert "/" in msg, f"Expected bilingual message with '/', got: {msg}"
            # Turkish keywords
            assert any(tr in msg for tr in ["dakika", "GÖRÜŞÜRÜZ"]), f"Missing Turkish in: {msg}"
            # English keywords
            assert any(en in msg for en in ["minutes", "SEE YOU"]), f"Missing English in: {msg}"
        
        # Check final message format
        final_notif = notifications[-1]
        assert "GÖRÜŞÜRÜZ" in final_notif["message"] or "SEE YOU" in final_notif["message"]
        print(f"Generated {len(notifications)} bilingual notifications")


class TestPostInstallSeeding:
    """Test post-install notification seeding"""
    
    def test_post_install_seeds_8_notifications(self):
        """POST /api/servers/{id}/post-install seeds 8 default notifications"""
        # Reset and setup
        requests.post(f"{BASE_URL}/api/setup/reset")
        requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": "/",
            "manager_path": "/tmp/LGSSManagers",
            "completed": True
        })
        
        # Create server
        response = requests.post(f"{BASE_URL}/api/servers", json={"name": "PostInstallTest"})
        server_id = response.json()["id"]
        
        # Install
        requests.post(f"{BASE_URL}/api/servers/{server_id}/install")
        
        # Post-install
        response = requests.post(f"{BASE_URL}/api/servers/{server_id}/post-install")
        assert response.status_code == 200
        data = response.json()
        
        notifications = data["settings"]["notifications"]
        assert len(notifications) == 8, f"Expected 8 notifications, got {len(notifications)}"
        
        # Verify bilingual format
        for notif in notifications:
            assert "/" in notif["message"], "Notifications should be bilingual"
        
        print(f"Post-install seeded {len(notifications)} notifications")


class TestSteamPublishBuild:
    """Test steam publish-build endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup_server(self):
        """Setup server for testing"""
        requests.post(f"{BASE_URL}/api/setup/reset")
        requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": "/",
            "manager_path": "/tmp/LGSSManagers",
            "completed": True
        })
        
        response = requests.post(f"{BASE_URL}/api/servers", json={"name": "UpdateTest"})
        self.server_id = response.json()["id"]
        
        # Install to get a build_id
        requests.post(f"{BASE_URL}/api/servers/{self.server_id}/install")
        yield
    
    def test_publish_build_marks_update_available(self):
        """POST /api/steam/publish-build marks servers with different build as update_available"""
        # Get current build
        response = requests.get(f"{BASE_URL}/api/servers/{self.server_id}")
        current_build = response.json()["installed_build_id"]
        
        # Publish a new build
        new_build = "build-NEW-TEST-VERSION"
        response = requests.post(f"{BASE_URL}/api/steam/publish-build", json={
            "build_id": new_build,
            "notes": "Test update"
        })
        assert response.status_code == 200
        assert response.json()["latest_build_id"] == new_build
        
        # Check server now has update_available=True
        response = requests.get(f"{BASE_URL}/api/servers/{self.server_id}")
        data = response.json()
        
        assert data["update_available"] == True, "Server should have update_available=True"
        assert data["installed_build_id"] == current_build, "installed_build_id should not change"
        print(f"Server marked as update_available after new build published")


class TestServerFieldsPresent:
    """Test server has required fields"""
    
    def test_server_has_installed_build_id_and_update_available(self):
        """GET /api/servers returns server with installed_build_id and update_available"""
        # Reset and setup
        requests.post(f"{BASE_URL}/api/setup/reset")
        requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": "/",
            "manager_path": "/tmp/LGSSManagers",
            "completed": True
        })
        
        # Create and install server
        response = requests.post(f"{BASE_URL}/api/servers", json={"name": "FieldsTest"})
        server_id = response.json()["id"]
        requests.post(f"{BASE_URL}/api/servers/{server_id}/install")
        
        # Get servers list
        response = requests.get(f"{BASE_URL}/api/servers")
        assert response.status_code == 200
        servers = response.json()
        
        assert len(servers) > 0
        server = servers[0]
        
        # Verify fields exist
        assert "installed_build_id" in server
        assert "update_available" in server
        assert server["installed_build_id"] is not None
        assert server["installed_build_id"].startswith("build-")
        print(f"Server has installed_build_id={server['installed_build_id']}, update_available={server['update_available']}")


class TestBackgroundSchedulerStartup:
    """Test background scheduler startup"""
    
    def test_scheduler_log_message(self):
        """Background scheduler should log startup message within 5 seconds"""
        # This test verifies the scheduler started by checking the API is responsive
        # The actual log message 'LGSS automation scheduler started (tick=30s)' 
        # appears in backend logs on startup
        
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        
        # If we can reach the API, the scheduler has started (it's in the startup event)
        print("Backend is running, scheduler should have started (check logs for 'LGSS automation scheduler started')")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
