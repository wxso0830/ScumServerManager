"""
LGSS SCUM Server Manager - Backend API Tests
Tests all endpoints: admin-check, disks, setup, servers CRUD, settings, start/stop
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSystemEndpoints:
    """System and health check endpoints"""
    
    def test_root_endpoint(self):
        """Test root API endpoint returns service info"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data["service"] == "LGSS SCUM Server Manager"
        assert "version" in data
        print(f"✓ Root endpoint: {data}")
    
    def test_admin_check(self):
        """Test /api/system/admin-check returns is_admin and platform"""
        response = requests.get(f"{BASE_URL}/api/system/admin-check")
        assert response.status_code == 200
        data = response.json()
        assert "is_admin" in data
        assert "platform" in data
        assert "release" in data
        assert isinstance(data["is_admin"], bool)
        print(f"✓ Admin check: is_admin={data['is_admin']}, platform={data['platform']}")


class TestDiskEndpoints:
    """Disk listing and requirements endpoints"""
    
    def test_list_disks(self):
        """Test /api/disks returns disk list with capacity info"""
        response = requests.get(f"{BASE_URL}/api/disks")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0, "Should return at least one disk"
        
        disk = data[0]
        required_fields = ["device", "mountpoint", "fstype", "total_gb", "used_gb", "free_gb", "percent_used", "eligible", "label"]
        for field in required_fields:
            assert field in disk, f"Missing field: {field}"
        
        assert isinstance(disk["total_gb"], (int, float))
        assert isinstance(disk["free_gb"], (int, float))
        assert isinstance(disk["eligible"], bool)
        print(f"✓ Disks found: {len(data)}, first disk: {disk['label']} ({disk['free_gb']} GB free, eligible={disk['eligible']})")
    
    def test_setup_requirements(self):
        """Test /api/setup/requirements returns required_gb_per_server=30"""
        response = requests.get(f"{BASE_URL}/api/setup/requirements")
        assert response.status_code == 200
        data = response.json()
        assert "required_gb_per_server" in data
        assert data["required_gb_per_server"] == 30
        print(f"✓ Requirements: {data}")


class TestSetupEndpoints:
    """Setup state management endpoints"""
    
    def test_reset_setup(self):
        """Test POST /api/setup/reset clears setup and deletes all servers"""
        response = requests.post(f"{BASE_URL}/api/setup/reset")
        assert response.status_code == 200
        data = response.json()
        assert data["completed"] == False
        assert data["is_admin_confirmed"] == False
        assert data["selected_disk"] is None
        assert data["manager_path"] is None
        print(f"✓ Setup reset: completed={data['completed']}")
        
        # Verify servers are deleted
        servers_response = requests.get(f"{BASE_URL}/api/servers")
        assert servers_response.status_code == 200
        servers = servers_response.json()
        assert len(servers) == 0, "All servers should be deleted after reset"
        print(f"✓ Servers cleared: count={len(servers)}")
    
    def test_get_setup_initial(self):
        """Test GET /api/setup returns initial state"""
        # First reset
        requests.post(f"{BASE_URL}/api/setup/reset")
        
        response = requests.get(f"{BASE_URL}/api/setup")
        assert response.status_code == 200
        data = response.json()
        assert "completed" in data
        assert "selected_disk" in data
        assert "manager_path" in data
        assert "is_admin_confirmed" in data
        assert "language" in data
        assert "theme" in data
        print(f"✓ Setup state: completed={data['completed']}, language={data['language']}, theme={data['theme']}")
    
    def test_update_setup_admin_confirmed(self):
        """Test PUT /api/setup updates is_admin_confirmed"""
        # Reset first
        requests.post(f"{BASE_URL}/api/setup/reset")
        
        response = requests.put(f"{BASE_URL}/api/setup", json={"is_admin_confirmed": True})
        assert response.status_code == 200
        data = response.json()
        assert data["is_admin_confirmed"] == True
        print(f"✓ Admin confirmed: {data['is_admin_confirmed']}")
    
    def test_update_setup_disk_selection(self):
        """Test PUT /api/setup updates disk selection and manager_path"""
        # Reset first
        requests.post(f"{BASE_URL}/api/setup/reset")
        
        # Get available disks
        disks_response = requests.get(f"{BASE_URL}/api/disks")
        disks = disks_response.json()
        eligible_disk = next((d for d in disks if d["eligible"]), disks[0])
        
        # Update setup with disk selection
        manager_path = f"{eligible_disk['mountpoint'].rstrip('/')}/LGSSManagers"
        response = requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": eligible_disk["mountpoint"],
            "manager_path": manager_path,
            "completed": True
        })
        assert response.status_code == 200
        data = response.json()
        assert data["completed"] == True
        assert data["selected_disk"] == eligible_disk["mountpoint"]
        assert data["manager_path"] == manager_path
        print(f"✓ Setup completed: disk={data['selected_disk']}, path={data['manager_path']}")
    
    def test_update_setup_language_theme(self):
        """Test PUT /api/setup updates language and theme"""
        response = requests.put(f"{BASE_URL}/api/setup", json={"language": "en", "theme": "cyber_neon"})
        assert response.status_code == 200
        data = response.json()
        assert data["language"] == "en"
        assert data["theme"] == "cyber_neon"
        print(f"✓ Language/theme updated: lang={data['language']}, theme={data['theme']}")


class TestServerCRUD:
    """Server profile CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup_completed(self):
        """Ensure setup is completed before server tests"""
        # Reset and complete setup
        requests.post(f"{BASE_URL}/api/setup/reset")
        disks = requests.get(f"{BASE_URL}/api/disks").json()
        eligible_disk = next((d for d in disks if d["eligible"]), disks[0])
        manager_path = f"{eligible_disk['mountpoint'].rstrip('/')}/LGSSManagers"
        requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": eligible_disk["mountpoint"],
            "manager_path": manager_path,
            "completed": True
        })
        yield
    
    def test_create_server_without_setup_fails(self):
        """Test POST /api/servers returns 400 if setup not completed"""
        # Reset setup to incomplete state
        requests.post(f"{BASE_URL}/api/setup/reset")
        
        response = requests.post(f"{BASE_URL}/api/servers", json={})
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        print(f"✓ Server creation blocked without setup: {data['detail']}")
    
    def test_create_server_sequential_naming(self):
        """Test POST /api/servers creates Server1, Server2, etc."""
        # Complete setup first
        disks = requests.get(f"{BASE_URL}/api/disks").json()
        eligible_disk = next((d for d in disks if d["eligible"]), disks[0])
        manager_path = f"{eligible_disk['mountpoint'].rstrip('/')}/LGSSManagers"
        requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": eligible_disk["mountpoint"],
            "manager_path": manager_path,
            "completed": True
        })
        
        # Create first server
        response1 = requests.post(f"{BASE_URL}/api/servers", json={})
        assert response1.status_code == 200
        server1 = response1.json()
        assert server1["folder_name"] == "Server1"
        assert "Server1" in server1["folder_path"]
        assert server1["status"] == "Stopped"
        assert "settings" in server1
        # New settings structure uses srv_general instead of administration
        assert "srv_general" in server1["settings"]
        print(f"✓ Server1 created: {server1['name']}, path={server1['folder_path']}")
        
        # Create second server
        response2 = requests.post(f"{BASE_URL}/api/servers", json={})
        assert response2.status_code == 200
        server2 = response2.json()
        assert server2["folder_name"] == "Server2"
        print(f"✓ Server2 created: {server2['name']}")
        
        return server1["id"], server2["id"]
    
    def test_list_servers(self):
        """Test GET /api/servers returns list of servers"""
        response = requests.get(f"{BASE_URL}/api/servers")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Servers listed: count={len(data)}")
    
    def test_get_server_by_id(self):
        """Test GET /api/servers/{id} returns server details"""
        # Create a server first
        create_response = requests.post(f"{BASE_URL}/api/servers", json={})
        server = create_response.json()
        server_id = server["id"]
        
        response = requests.get(f"{BASE_URL}/api/servers/{server_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == server_id
        assert "settings" in data
        print(f"✓ Server retrieved: {data['name']}")
    
    def test_get_server_not_found(self):
        """Test GET /api/servers/{id} returns 404 for non-existent server"""
        response = requests.get(f"{BASE_URL}/api/servers/non-existent-id")
        assert response.status_code == 404
        print(f"✓ 404 for non-existent server")
    
    def test_rename_server(self):
        """Test PUT /api/servers/{id} renames server"""
        # Create a server
        create_response = requests.post(f"{BASE_URL}/api/servers", json={})
        server = create_response.json()
        server_id = server["id"]
        
        # Rename it
        new_name = "TEST_MyCustomServer"
        response = requests.put(f"{BASE_URL}/api/servers/{server_id}", json={"name": new_name})
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == new_name
        
        # Verify persistence
        get_response = requests.get(f"{BASE_URL}/api/servers/{server_id}")
        assert get_response.json()["name"] == new_name
        print(f"✓ Server renamed to: {new_name}")
    
    def test_delete_server(self):
        """Test DELETE /api/servers/{id} removes server"""
        # Create a server
        create_response = requests.post(f"{BASE_URL}/api/servers", json={})
        server = create_response.json()
        server_id = server["id"]
        
        # Delete it
        response = requests.delete(f"{BASE_URL}/api/servers/{server_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] == True
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/servers/{server_id}")
        assert get_response.status_code == 404
        print(f"✓ Server deleted: {server_id}")


class TestServerSettings:
    """Server settings update endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup_and_create_server(self):
        """Setup and create a server for settings tests"""
        requests.post(f"{BASE_URL}/api/setup/reset")
        disks = requests.get(f"{BASE_URL}/api/disks").json()
        eligible_disk = next((d for d in disks if d["eligible"]), disks[0])
        manager_path = f"{eligible_disk['mountpoint'].rstrip('/')}/LGSSManagers"
        requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": eligible_disk["mountpoint"],
            "manager_path": manager_path,
            "completed": True
        })
        
        # Create server
        server = requests.post(f"{BASE_URL}/api/servers", json={}).json()
        self.server_id = server["id"]
        yield
    
    def test_update_settings_partial(self):
        """Test PUT /api/servers/{id}/settings merges nested category dicts"""
        # Update only srv_general settings (new structure)
        new_settings = {
            "srv_general": {
                "scum.ServerName": "TEST_Updated Server Name",
                "scum.MaxPlayers": 100
            }
        }
        response = requests.put(f"{BASE_URL}/api/servers/{self.server_id}/settings", json={"settings": new_settings})
        assert response.status_code == 200
        data = response.json()
        
        # Verify updated fields
        assert data["settings"]["srv_general"]["scum.ServerName"] == "TEST_Updated Server Name"
        assert data["settings"]["srv_general"]["scum.MaxPlayers"] == 100
        
        # Verify other fields in srv_general are preserved (should have many keys from real defaults)
        assert len(data["settings"]["srv_general"]) > 10, "Other srv_general fields should be preserved"
        
        # Verify other categories are preserved
        assert "srv_world" in data["settings"]
        assert "srv_features" in data["settings"]
        print(f"✓ Settings partially updated: ServerName={data['settings']['srv_general']['scum.ServerName']}")
    
    def test_update_settings_multiple_categories(self):
        """Test updating multiple categories at once"""
        new_settings = {
            "srv_world": {
                "scum.StartTimeOfDay": "12:00:00",
                "scum.TimeOfDaySpeed": 2.0
            },
            "srv_features": {
                "scum.QuestsEnabled": False
            }
        }
        response = requests.put(f"{BASE_URL}/api/servers/{self.server_id}/settings", json={"settings": new_settings})
        assert response.status_code == 200
        data = response.json()
        
        assert data["settings"]["srv_world"]["scum.StartTimeOfDay"] == "12:00:00"
        assert data["settings"]["srv_world"]["scum.TimeOfDaySpeed"] == 2.0
        assert data["settings"]["srv_features"]["scum.QuestsEnabled"] == False
        print(f"✓ Multiple categories updated")
    
    def test_update_settings_persistence(self):
        """Test settings are persisted in database"""
        new_settings = {
            "srv_general": {
                "scum.WelcomeMessage": "TEST_Welcome to my server!"
            }
        }
        requests.put(f"{BASE_URL}/api/servers/{self.server_id}/settings", json={"settings": new_settings})
        
        # Fetch server again
        get_response = requests.get(f"{BASE_URL}/api/servers/{self.server_id}")
        data = get_response.json()
        assert data["settings"]["srv_general"]["scum.WelcomeMessage"] == "TEST_Welcome to my server!"
        print(f"✓ Settings persisted in database")


class TestServerStartStop:
    """Server start/stop endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup_and_create_server(self):
        """Setup and create a server for start/stop tests"""
        requests.post(f"{BASE_URL}/api/setup/reset")
        disks = requests.get(f"{BASE_URL}/api/disks").json()
        eligible_disk = next((d for d in disks if d["eligible"]), disks[0])
        manager_path = f"{eligible_disk['mountpoint'].rstrip('/')}/LGSSManagers"
        requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": eligible_disk["mountpoint"],
            "manager_path": manager_path,
            "completed": True
        })
        
        server = requests.post(f"{BASE_URL}/api/servers", json={}).json()
        self.server_id = server["id"]
        yield
    
    def test_start_server(self):
        """Test POST /api/servers/{id}/start sets status to Running"""
        response = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/start")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "Running"
        
        # Verify persistence
        get_response = requests.get(f"{BASE_URL}/api/servers/{self.server_id}")
        assert get_response.json()["status"] == "Running"
        print(f"✓ Server started: status={data['status']}")
    
    def test_stop_server(self):
        """Test POST /api/servers/{id}/stop sets status to Stopped"""
        # First start the server
        requests.post(f"{BASE_URL}/api/servers/{self.server_id}/start")
        
        # Then stop it
        response = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/stop")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "Stopped"
        
        # Verify persistence
        get_response = requests.get(f"{BASE_URL}/api/servers/{self.server_id}")
        assert get_response.json()["status"] == "Stopped"
        print(f"✓ Server stopped: status={data['status']}")
    
    def test_start_stop_not_found(self):
        """Test start/stop returns 404 for non-existent server"""
        response = requests.post(f"{BASE_URL}/api/servers/non-existent-id/start")
        assert response.status_code == 404
        
        response = requests.post(f"{BASE_URL}/api/servers/non-existent-id/stop")
        assert response.status_code == 404
        print(f"✓ 404 for start/stop on non-existent server")


# Cleanup fixture to reset state after all tests
@pytest.fixture(scope="session", autouse=True)
def cleanup_after_tests():
    yield
    # Reset setup after all tests
    requests.post(f"{BASE_URL}/api/setup/reset")
    print("\n✓ Cleanup: Setup reset after all tests")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
