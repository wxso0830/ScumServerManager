"""
LGSS SCUM Server Manager - Iteration 5 Backend Tests
Tests for:
- POST /api/servers creates server with folder_path='{manager_path}/Servers/Server1' (with 'Servers' subfolder)
- Field `installed` default False
- Field `steam_app_id` default '3792580'
- POST /api/servers/{id}/install — sets installed=true, status=Stopped
- POST /api/servers/{id}/save-config — returns {config_dir, files[], count}
  - config_dir ends with 'SCUM/Saved/Config/WindowsServer'
  - files[] contains 11 file specs including ServerSettings.ini, AdminUsers.ini, etc.
  - Each file has valid path prefix of config_dir and non-empty content
- PUT /api/servers/{id} (rename) still works and preserves settings
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestServerCreationWithServersSubfolder:
    """Test POST /api/servers creates server with 'Servers' subfolder in path"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Reset and setup manager path"""
        requests.post(f"{BASE_URL}/api/setup/reset")
        requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": "/",
            "manager_path": "/tmp/LGSSManagers",
            "completed": True
        })
        yield
        # Cleanup
        requests.post(f"{BASE_URL}/api/setup/reset")
    
    def test_server_folder_path_includes_servers_subfolder(self):
        """POST /servers should create folder_path with 'Servers' subfolder"""
        response = requests.post(f"{BASE_URL}/api/servers", json={"name": "TEST_Server1"})
        assert response.status_code == 200
        data = response.json()
        
        # folder_path should be {manager_path}/Servers/Server1
        assert '/Servers/' in data['folder_path'], f"Expected '/Servers/' in folder_path, got: {data['folder_path']}"
        assert data['folder_path'] == '/tmp/LGSSManagers/Servers/Server1'
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/servers/{data['id']}")
    
    def test_multiple_servers_have_correct_folder_paths(self):
        """Multiple servers should have sequential folder paths with Servers subfolder"""
        # Create first server
        resp1 = requests.post(f"{BASE_URL}/api/servers", json={"name": "TEST_First"})
        assert resp1.status_code == 200
        server1 = resp1.json()
        
        # Create second server
        resp2 = requests.post(f"{BASE_URL}/api/servers", json={"name": "TEST_Second"})
        assert resp2.status_code == 200
        server2 = resp2.json()
        
        # Verify paths
        assert server1['folder_path'] == '/tmp/LGSSManagers/Servers/Server1'
        assert server2['folder_path'] == '/tmp/LGSSManagers/Servers/Server2'
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/servers/{server1['id']}")
        requests.delete(f"{BASE_URL}/api/servers/{server2['id']}")


class TestServerInstalledField:
    """Test that new servers have installed=False by default"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Reset and setup"""
        requests.post(f"{BASE_URL}/api/setup/reset")
        requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": "/",
            "manager_path": "/tmp/LGSSManagers",
            "completed": True
        })
        yield
        requests.post(f"{BASE_URL}/api/setup/reset")
    
    def test_new_server_installed_is_false(self):
        """POST /servers should create server with installed=False"""
        response = requests.post(f"{BASE_URL}/api/servers", json={"name": "TEST_NotInstalled"})
        assert response.status_code == 200
        data = response.json()
        
        assert 'installed' in data, "Server should have 'installed' field"
        assert data['installed'] == False, f"Expected installed=False, got: {data['installed']}"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/servers/{data['id']}")
    
    def test_get_server_returns_installed_field(self):
        """GET /servers/{id} should return installed field"""
        # Create server
        create_resp = requests.post(f"{BASE_URL}/api/servers", json={"name": "TEST_GetInstalled"})
        server_id = create_resp.json()['id']
        
        # Get server
        get_resp = requests.get(f"{BASE_URL}/api/servers/{server_id}")
        assert get_resp.status_code == 200
        data = get_resp.json()
        
        assert 'installed' in data
        assert data['installed'] == False
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/servers/{server_id}")


class TestServerSteamAppIdField:
    """Test that new servers have steam_app_id='3792580' by default"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Reset and setup"""
        requests.post(f"{BASE_URL}/api/setup/reset")
        requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": "/",
            "manager_path": "/tmp/LGSSManagers",
            "completed": True
        })
        yield
        requests.post(f"{BASE_URL}/api/setup/reset")
    
    def test_new_server_steam_app_id_is_3792580(self):
        """POST /servers should create server with steam_app_id='3792580'"""
        response = requests.post(f"{BASE_URL}/api/servers", json={"name": "TEST_SteamAppId"})
        assert response.status_code == 200
        data = response.json()
        
        assert 'steam_app_id' in data, "Server should have 'steam_app_id' field"
        assert data['steam_app_id'] == '3792580', f"Expected steam_app_id='3792580', got: {data['steam_app_id']}"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/servers/{data['id']}")


class TestServerInstallEndpoint:
    """Test POST /api/servers/{id}/install endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Reset and create a server for testing"""
        requests.post(f"{BASE_URL}/api/setup/reset")
        requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": "/",
            "manager_path": "/tmp/LGSSManagers",
            "completed": True
        })
        response = requests.post(f"{BASE_URL}/api/servers", json={"name": "TEST_InstallServer"})
        self.server = response.json()
        self.server_id = self.server['id']
        yield
        requests.delete(f"{BASE_URL}/api/servers/{self.server_id}")
    
    def test_install_sets_installed_true(self):
        """POST /servers/{id}/install should set installed=True"""
        # Verify initially not installed
        before = requests.get(f"{BASE_URL}/api/servers/{self.server_id}").json()
        assert before['installed'] == False
        
        # Call install
        response = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/install")
        assert response.status_code == 200
        data = response.json()
        
        assert data['installed'] == True, f"Expected installed=True after install, got: {data['installed']}"
    
    def test_install_sets_status_stopped(self):
        """POST /servers/{id}/install should set status='Stopped'"""
        response = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/install")
        assert response.status_code == 200
        data = response.json()
        
        assert data['status'] == 'Stopped', f"Expected status='Stopped' after install, got: {data['status']}"
    
    def test_install_persists_installed_true(self):
        """After install, GET should return installed=True"""
        # Install
        requests.post(f"{BASE_URL}/api/servers/{self.server_id}/install")
        
        # Verify with GET
        get_resp = requests.get(f"{BASE_URL}/api/servers/{self.server_id}")
        assert get_resp.status_code == 200
        data = get_resp.json()
        
        assert data['installed'] == True
    
    def test_install_404_for_invalid_id(self):
        """POST /servers/{id}/install should return 404 for invalid server"""
        response = requests.post(f"{BASE_URL}/api/servers/invalid-id-12345/install")
        assert response.status_code == 404


class TestServerSaveConfigEndpoint:
    """Test POST /api/servers/{id}/save-config endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Reset and create a server for testing"""
        requests.post(f"{BASE_URL}/api/setup/reset")
        requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": "/",
            "manager_path": "/tmp/LGSSManagers",
            "completed": True
        })
        response = requests.post(f"{BASE_URL}/api/servers", json={"name": "TEST_SaveConfigServer"})
        self.server = response.json()
        self.server_id = self.server['id']
        yield
        requests.delete(f"{BASE_URL}/api/servers/{self.server_id}")
    
    def test_save_config_returns_config_dir(self):
        """POST /servers/{id}/save-config should return config_dir"""
        response = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/save-config")
        assert response.status_code == 200
        data = response.json()
        
        assert 'config_dir' in data, "Response should have 'config_dir' field"
    
    def test_save_config_config_dir_ends_with_windows_server(self):
        """config_dir should end with 'SCUM/Saved/Config/WindowsServer'"""
        response = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/save-config")
        assert response.status_code == 200
        data = response.json()
        
        config_dir = data['config_dir']
        assert config_dir.endswith('SCUM/Saved/Config/WindowsServer'), \
            f"Expected config_dir to end with 'SCUM/Saved/Config/WindowsServer', got: {config_dir}"
    
    def test_save_config_returns_files_array(self):
        """POST /servers/{id}/save-config should return files array"""
        response = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/save-config")
        assert response.status_code == 200
        data = response.json()
        
        assert 'files' in data, "Response should have 'files' field"
        assert isinstance(data['files'], list), "files should be a list"
    
    def test_save_config_returns_count(self):
        """POST /servers/{id}/save-config should return count"""
        response = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/save-config")
        assert response.status_code == 200
        data = response.json()
        
        assert 'count' in data, "Response should have 'count' field"
        assert data['count'] == len(data['files']), "count should match files array length"
    
    def test_save_config_returns_11_files(self):
        """POST /servers/{id}/save-config should return 11 config files"""
        response = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/save-config")
        assert response.status_code == 200
        data = response.json()
        
        assert data['count'] == 11, f"Expected 11 files, got: {data['count']}"
    
    def test_save_config_includes_required_files(self):
        """save-config should include all required config files"""
        response = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/save-config")
        assert response.status_code == 200
        data = response.json()
        
        required_files = [
            'ServerSettings.ini',
            'AdminUsers.ini',
            'ServerSettingsAdminUsers.ini',
            'BannedUsers.ini',
            'WhitelistedUsers.ini',
            'ExclusiveUsers.ini',
            'SilencedUsers.ini',
            'EconomyOverride.json',
            'RaidTimes.json',
            'Notifications.json',
            'Input.ini'
        ]
        
        file_names = [f['path'].split('/')[-1] for f in data['files']]
        
        for req_file in required_files:
            assert req_file in file_names, f"Missing required file: {req_file}"
    
    def test_save_config_files_have_valid_paths(self):
        """Each file should have path starting with config_dir"""
        response = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/save-config")
        assert response.status_code == 200
        data = response.json()
        
        config_dir = data['config_dir']
        for file_spec in data['files']:
            assert 'path' in file_spec, "Each file should have 'path'"
            assert file_spec['path'].startswith(config_dir), \
                f"File path should start with config_dir. Path: {file_spec['path']}, config_dir: {config_dir}"
    
    def test_save_config_files_have_content_field(self):
        """Each file should have content field (user lists may be empty by default)"""
        response = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/save-config")
        assert response.status_code == 200
        data = response.json()
        
        # User list files can be empty by default (no banned/whitelisted/exclusive/silenced users)
        user_list_files = ['BannedUsers.ini', 'WhitelistedUsers.ini', 'ExclusiveUsers.ini', 'SilencedUsers.ini']
        
        for file_spec in data['files']:
            assert 'content' in file_spec, f"File {file_spec.get('path', 'unknown')} should have 'content'"
            filename = file_spec['path'].split('/')[-1]
            
            # Non-user-list files should have non-empty content
            if filename not in user_list_files:
                assert len(file_spec['content']) > 0, \
                    f"File {filename} should have non-empty content"
    
    def test_save_config_404_for_invalid_id(self):
        """POST /servers/{id}/save-config should return 404 for invalid server"""
        response = requests.post(f"{BASE_URL}/api/servers/invalid-id-12345/save-config")
        assert response.status_code == 404


class TestServerRenamePreservesSettings:
    """Test PUT /api/servers/{id} (rename) preserves settings"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Reset and create a server with custom settings"""
        requests.post(f"{BASE_URL}/api/setup/reset")
        requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": "/",
            "manager_path": "/tmp/LGSSManagers",
            "completed": True
        })
        response = requests.post(f"{BASE_URL}/api/servers", json={"name": "TEST_RenameServer"})
        self.server = response.json()
        self.server_id = self.server['id']
        
        # Set custom settings
        self.custom_settings = {
            "srv_general": {
                "scum.ServerName": "Custom Name",
                "scum.MaxPlayers": 50
            }
        }
        requests.put(f"{BASE_URL}/api/servers/{self.server_id}/settings", json={"settings": self.custom_settings})
        yield
        requests.delete(f"{BASE_URL}/api/servers/{self.server_id}")
    
    def test_rename_server_works(self):
        """PUT /servers/{id} should rename the server"""
        response = requests.put(f"{BASE_URL}/api/servers/{self.server_id}", json={"name": "Renamed Server"})
        assert response.status_code == 200
        data = response.json()
        
        assert data['name'] == 'Renamed Server'
    
    def test_rename_preserves_settings(self):
        """PUT /servers/{id} should preserve settings"""
        # Rename
        requests.put(f"{BASE_URL}/api/servers/{self.server_id}", json={"name": "Renamed Server"})
        
        # Get and verify settings
        get_resp = requests.get(f"{BASE_URL}/api/servers/{self.server_id}")
        assert get_resp.status_code == 200
        data = get_resp.json()
        
        assert data['settings'].get('srv_general', {}).get('scum.ServerName') == 'Custom Name'
        assert data['settings'].get('srv_general', {}).get('scum.MaxPlayers') == 50
    
    def test_rename_preserves_installed_status(self):
        """PUT /servers/{id} should preserve installed status"""
        # Install the server first
        requests.post(f"{BASE_URL}/api/servers/{self.server_id}/install")
        
        # Rename
        requests.put(f"{BASE_URL}/api/servers/{self.server_id}", json={"name": "Renamed Installed"})
        
        # Verify installed is still true
        get_resp = requests.get(f"{BASE_URL}/api/servers/{self.server_id}")
        data = get_resp.json()
        
        assert data['installed'] == True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
