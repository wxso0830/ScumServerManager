"""
LGSS SCUM Server Manager - Iteration 4 Backend Tests
Tests for:
- POST /api/servers/{id}/update - returns ServerProfile with status='Updating' but settings NOT modified
- POST /api/servers/{id}/update/complete - returns status='Stopped'
- GET /api/app/version - returns {current, latest, update_available, notes}
- POST /api/app/release with {version:'1.0.1', notes:'x'} - then GET /api/app/version returns update_available=true
- POST /api/app/apply-update - returns {ok: true, message}
- Schema no longer contains advanced_virtualization category
- Schema essentials_performance no longer includes scum.MasterServerIsLocalTest
- Schema essentials_wipe no longer includes scum.SettingsVersion
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestServerUpdateEndpoint:
    """Test POST /api/servers/{id}/update endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup_server(self):
        """Reset and create a server for testing"""
        requests.post(f"{BASE_URL}/api/setup/reset")
        requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": "/",
            "manager_path": "/tmp/LGSSManagers",
            "completed": True
        })
        response = requests.post(f"{BASE_URL}/api/servers", json={"name": "TEST_UpdateServer"})
        self.server = response.json()
        self.server_id = self.server['id']
        self.original_settings = self.server.get('settings', {})
        yield
        # Cleanup
        requests.delete(f"{BASE_URL}/api/servers/{self.server_id}")
    
    def test_update_server_returns_updating_status(self):
        """POST /servers/{id}/update should return status='Updating'"""
        response = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/update")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'Updating'
    
    def test_update_server_preserves_settings(self):
        """POST /servers/{id}/update should NOT modify settings"""
        # First modify some settings
        modified_settings = {"srv_general": {"scum.ServerName": "Modified Name"}}
        requests.put(f"{BASE_URL}/api/servers/{self.server_id}/settings", json={"settings": modified_settings})
        
        # Get server before update
        before = requests.get(f"{BASE_URL}/api/servers/{self.server_id}").json()
        before_settings = before.get('settings', {})
        
        # Call update
        response = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/update")
        assert response.status_code == 200
        
        # Verify settings unchanged
        after = requests.get(f"{BASE_URL}/api/servers/{self.server_id}").json()
        after_settings = after.get('settings', {})
        
        # Settings should be identical (only status changed)
        assert after_settings.get('srv_general', {}).get('scum.ServerName') == 'Modified Name'
    
    def test_update_server_404_for_invalid_id(self):
        """POST /servers/{id}/update should return 404 for invalid server"""
        response = requests.post(f"{BASE_URL}/api/servers/invalid-id-12345/update")
        assert response.status_code == 404


class TestServerUpdateCompleteEndpoint:
    """Test POST /api/servers/{id}/update/complete endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup_server(self):
        """Reset and create a server for testing"""
        requests.post(f"{BASE_URL}/api/setup/reset")
        requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": "/",
            "manager_path": "/tmp/LGSSManagers",
            "completed": True
        })
        response = requests.post(f"{BASE_URL}/api/servers", json={"name": "TEST_UpdateCompleteServer"})
        self.server = response.json()
        self.server_id = self.server['id']
        yield
        requests.delete(f"{BASE_URL}/api/servers/{self.server_id}")
    
    def test_update_complete_returns_stopped_status(self):
        """POST /servers/{id}/update/complete should return status='Stopped'"""
        # First start an update
        requests.post(f"{BASE_URL}/api/servers/{self.server_id}/update")
        
        # Then complete it
        response = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/update/complete")
        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'Stopped'
    
    def test_update_complete_404_for_invalid_id(self):
        """POST /servers/{id}/update/complete should return 404 for invalid server"""
        response = requests.post(f"{BASE_URL}/api/servers/invalid-id-12345/update/complete")
        assert response.status_code == 404


class TestAppVersionEndpoint:
    """Test GET /api/app/version endpoint"""
    
    def test_get_app_version_structure(self):
        """GET /app/version should return {current, latest, update_available, notes}"""
        response = requests.get(f"{BASE_URL}/api/app/version")
        assert response.status_code == 200
        data = response.json()
        assert 'current' in data
        assert 'latest' in data
        assert 'update_available' in data
        assert 'notes' in data
    
    def test_get_app_version_current_is_1_0_0(self):
        """GET /app/version should return current='1.0.0'"""
        response = requests.get(f"{BASE_URL}/api/app/version")
        assert response.status_code == 200
        data = response.json()
        assert data['current'] == '1.0.0'
    
    def test_get_app_version_no_update_by_default(self):
        """GET /app/version should return update_available=false by default"""
        # Reset to clear any previous release
        requests.post(f"{BASE_URL}/api/setup/reset")
        response = requests.get(f"{BASE_URL}/api/app/version")
        assert response.status_code == 200
        data = response.json()
        # When latest == current, update_available should be false
        assert data['update_available'] == (data['latest'] != data['current'])


class TestAppReleaseEndpoint:
    """Test POST /api/app/release endpoint"""
    
    def test_publish_release_updates_latest(self):
        """POST /app/release should update latest version"""
        response = requests.post(f"{BASE_URL}/api/app/release", json={
            "version": "1.0.1",
            "notes": "Test release notes"
        })
        assert response.status_code == 200
        data = response.json()
        assert data['ok'] == True
        assert data['latest'] == '1.0.1'
    
    def test_publish_release_makes_update_available(self):
        """After POST /app/release, GET /app/version should show update_available=true"""
        # Publish a new version
        requests.post(f"{BASE_URL}/api/app/release", json={
            "version": "1.0.1",
            "notes": "New features"
        })
        
        # Check version
        response = requests.get(f"{BASE_URL}/api/app/version")
        assert response.status_code == 200
        data = response.json()
        assert data['latest'] == '1.0.1'
        assert data['update_available'] == True
        assert data['notes'] == 'New features'


class TestAppApplyUpdateEndpoint:
    """Test POST /api/app/apply-update endpoint"""
    
    def test_apply_update_returns_ok(self):
        """POST /app/apply-update should return {ok: true, message}"""
        response = requests.post(f"{BASE_URL}/api/app/apply-update")
        assert response.status_code == 200
        data = response.json()
        assert data['ok'] == True
        assert 'message' in data


class TestSchemaRemovedFields:
    """Test that removed fields/categories are no longer in schema"""
    
    def test_no_advanced_virtualization_category(self):
        """Schema should NOT contain advanced_virtualization category"""
        response = requests.get(f"{BASE_URL}/api/settings/schema")
        assert response.status_code == 200
        data = response.json()
        category_keys = [c['key'] for c in data.get('categories', [])]
        assert 'advanced_virtualization' not in category_keys
    
    def test_essentials_performance_no_master_server_is_local_test(self):
        """essentials_performance should NOT include scum.MasterServerIsLocalTest"""
        response = requests.get(f"{BASE_URL}/api/settings/schema")
        assert response.status_code == 200
        data = response.json()
        cat = next((c for c in data['categories'] if c['key'] == 'essentials_performance'), None)
        assert cat is not None
        field_keys = cat.get('fieldKeys', [])
        assert 'scum.MasterServerIsLocalTest' not in field_keys
    
    def test_essentials_wipe_no_settings_version(self):
        """essentials_wipe should NOT include scum.SettingsVersion"""
        response = requests.get(f"{BASE_URL}/api/settings/schema")
        assert response.status_code == 200
        data = response.json()
        cat = next((c for c in data['categories'] if c['key'] == 'essentials_wipe'), None)
        assert cat is not None
        field_keys = cat.get('fieldKeys', [])
        assert 'scum.SettingsVersion' not in field_keys


class TestUpdateServerSettingsIntegrity:
    """Test that server update preserves all settings"""
    
    @pytest.fixture(autouse=True)
    def setup_server(self):
        """Reset and create a server with custom settings"""
        requests.post(f"{BASE_URL}/api/setup/reset")
        requests.put(f"{BASE_URL}/api/setup", json={
            "is_admin_confirmed": True,
            "selected_disk": "/",
            "manager_path": "/tmp/LGSSManagers",
            "completed": True
        })
        response = requests.post(f"{BASE_URL}/api/servers", json={"name": "TEST_SettingsIntegrity"})
        self.server = response.json()
        self.server_id = self.server['id']
        
        # Set custom settings
        self.custom_settings = {
            "srv_general": {
                "scum.ServerName": "Custom Server Name",
                "scum.MaxPlayers": 100
            },
            "srv_world": {
                "scum.TimeOfDaySpeed": 2.5
            }
        }
        requests.put(f"{BASE_URL}/api/servers/{self.server_id}/settings", json={"settings": self.custom_settings})
        yield
        requests.delete(f"{BASE_URL}/api/servers/{self.server_id}")
    
    def test_update_then_complete_preserves_all_settings(self):
        """Full update cycle should preserve all custom settings"""
        # Get settings before update
        before = requests.get(f"{BASE_URL}/api/servers/{self.server_id}").json()
        before_settings = before.get('settings', {})
        
        # Start update
        update_resp = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/update")
        assert update_resp.status_code == 200
        assert update_resp.json()['status'] == 'Updating'
        
        # Complete update
        complete_resp = requests.post(f"{BASE_URL}/api/servers/{self.server_id}/update/complete")
        assert complete_resp.status_code == 200
        assert complete_resp.json()['status'] == 'Stopped'
        
        # Get settings after update
        after = requests.get(f"{BASE_URL}/api/servers/{self.server_id}").json()
        after_settings = after.get('settings', {})
        
        # Verify custom settings preserved
        assert after_settings.get('srv_general', {}).get('scum.ServerName') == 'Custom Server Name'
        assert after_settings.get('srv_general', {}).get('scum.MaxPlayers') == 100
        assert after_settings.get('srv_world', {}).get('scum.TimeOfDaySpeed') == 2.5


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
