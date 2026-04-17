"""
LGSS SCUM Server Manager - Iteration 3 Backend Tests
Tests for:
- 8 sections and 53 categories in schema
- New user lists: whitelisted, silenced, server_admins
- Export/import for new file keys
- sourceKey + fieldKeys pattern in categories
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSchemaStructure:
    """Test the new 8-section, 53-category schema structure"""
    
    def test_schema_has_8_sections(self):
        """Schema should return exactly 8 sections"""
        response = requests.get(f"{BASE_URL}/api/settings/schema")
        assert response.status_code == 200
        data = response.json()
        sections = data.get('sections', [])
        assert len(sections) == 8
        section_keys = [s['key'] for s in sections]
        expected = ['essentials', 'gameplay', 'world', 'economy', 'security', 'users', 'advanced', 'client']
        assert section_keys == expected
    
    def test_schema_has_53_categories(self):
        """Schema should return approximately 53 categories"""
        response = requests.get(f"{BASE_URL}/api/settings/schema")
        assert response.status_code == 200
        data = response.json()
        categories = data.get('categories', [])
        assert len(categories) == 53
    
    def test_essentials_identity_category_structure(self):
        """essentials_identity should have sourceKey and fieldKeys"""
        response = requests.get(f"{BASE_URL}/api/settings/schema")
        assert response.status_code == 200
        data = response.json()
        cat = next((c for c in data['categories'] if c['key'] == 'essentials_identity'), None)
        assert cat is not None
        assert cat['sourceKey'] == 'srv_general'
        assert 'scum.ServerName' in cat['fieldKeys']
        assert 'scum.ServerDescription' in cat['fieldKeys']
    
    def test_users_section_has_6_user_lists(self):
        """Users section should have 6 user list categories"""
        response = requests.get(f"{BASE_URL}/api/settings/schema")
        assert response.status_code == 200
        data = response.json()
        user_cats = [c for c in data['categories'] if c.get('section') == 'users']
        assert len(user_cats) == 6
        user_keys = [c['key'] for c in user_cats]
        expected = ['users_admins', 'users_server_admins', 'users_whitelisted', 
                    'users_exclusive', 'users_banned', 'users_silenced']
        assert user_keys == expected


class TestNewUserLists:
    """Test new user lists: whitelisted, silenced, server_admins"""
    
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
        response = requests.post(f"{BASE_URL}/api/servers", json={})
        self.server = response.json()
        self.server_id = self.server['id']
        yield
        # Cleanup
        requests.delete(f"{BASE_URL}/api/servers/{self.server_id}")
    
    def test_server_has_users_whitelisted_empty(self):
        """New server should have empty users_whitelisted list"""
        settings = self.server.get('settings', {})
        assert 'users_whitelisted' in settings
        assert settings['users_whitelisted'] == []
    
    def test_server_has_users_silenced_empty(self):
        """New server should have empty users_silenced list"""
        settings = self.server.get('settings', {})
        assert 'users_silenced' in settings
        assert settings['users_silenced'] == []
    
    def test_server_has_users_server_admins_with_entry(self):
        """New server should have users_server_admins with 1 entry (76561199169074640)"""
        settings = self.server.get('settings', {})
        assert 'users_server_admins' in settings
        server_admins = settings['users_server_admins']
        assert len(server_admins) == 1
        assert server_admins[0]['steam_id'] == '76561199169074640'


class TestNewExportEndpoints:
    """Test export endpoints for new file keys"""
    
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
        response = requests.post(f"{BASE_URL}/api/servers", json={})
        self.server = response.json()
        self.server_id = self.server['id']
        yield
        requests.delete(f"{BASE_URL}/api/servers/{self.server_id}")
    
    def test_export_server_admins(self):
        """Export server_admins should return ServerSettingsAdminUsers.ini"""
        response = requests.get(f"{BASE_URL}/api/servers/{self.server_id}/export/server_admins")
        assert response.status_code == 200
        data = response.json()
        assert data['filename'] == 'ServerSettingsAdminUsers.ini'
        assert '76561199169074640' in data['content']
    
    def test_export_whitelisted(self):
        """Export whitelisted should return WhitelistedUsers.ini"""
        response = requests.get(f"{BASE_URL}/api/servers/{self.server_id}/export/whitelisted")
        assert response.status_code == 200
        data = response.json()
        assert data['filename'] == 'WhitelistedUsers.ini'
    
    def test_export_silenced(self):
        """Export silenced should return SilencedUsers.ini"""
        response = requests.get(f"{BASE_URL}/api/servers/{self.server_id}/export/silenced")
        assert response.status_code == 200
        data = response.json()
        assert data['filename'] == 'SilencedUsers.ini'


class TestNewImportEndpoints:
    """Test import endpoints for new file keys"""
    
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
        response = requests.post(f"{BASE_URL}/api/servers", json={})
        self.server = response.json()
        self.server_id = self.server['id']
        yield
        requests.delete(f"{BASE_URL}/api/servers/{self.server_id}")
    
    def test_import_whitelisted(self):
        """Import whitelisted should parse steam IDs and flags"""
        content = "12345678901234567[vip]\n98765432109876543"
        response = requests.post(
            f"{BASE_URL}/api/servers/{self.server_id}/import/whitelisted",
            json={"content": content}
        )
        assert response.status_code == 200
        data = response.json()
        users = data['settings']['users_whitelisted']
        assert len(users) == 2
        assert users[0]['steam_id'] == '12345678901234567'
        assert users[0]['flags'] == ['vip']
        assert users[1]['steam_id'] == '98765432109876543'
        assert users[1]['flags'] == []
    
    def test_import_silenced(self):
        """Import silenced should parse steam IDs and flags"""
        content = "11111111111111111[voice,chat]"
        response = requests.post(
            f"{BASE_URL}/api/servers/{self.server_id}/import/silenced",
            json={"content": content}
        )
        assert response.status_code == 200
        data = response.json()
        users = data['settings']['users_silenced']
        assert len(users) == 1
        assert users[0]['steam_id'] == '11111111111111111'
        assert users[0]['flags'] == ['voice', 'chat']
    
    def test_import_server_admins(self):
        """Import server_admins should parse steam IDs and flags"""
        content = "22222222222222222[serveradmin]\n33333333333333333"
        response = requests.post(
            f"{BASE_URL}/api/servers/{self.server_id}/import/server_admins",
            json={"content": content}
        )
        assert response.status_code == 200
        data = response.json()
        users = data['settings']['users_server_admins']
        assert len(users) == 2
        assert users[0]['steam_id'] == '22222222222222222'
        assert users[0]['flags'] == ['serveradmin']


class TestCategorySourceKeyPattern:
    """Test that categories use sourceKey + fieldKeys pattern correctly"""
    
    def test_essentials_categories_use_srv_general(self):
        """Essentials section categories should use srv_general sourceKey"""
        response = requests.get(f"{BASE_URL}/api/settings/schema")
        assert response.status_code == 200
        data = response.json()
        essentials_cats = [c for c in data['categories'] if c.get('section') == 'essentials']
        for cat in essentials_cats:
            assert cat.get('sourceKey') == 'srv_general'
    
    def test_gameplay_respawn_uses_srv_respawn(self):
        """gameplay_respawn should use srv_respawn sourceKey"""
        response = requests.get(f"{BASE_URL}/api/settings/schema")
        assert response.status_code == 200
        data = response.json()
        cat = next((c for c in data['categories'] if c['key'] == 'gameplay_respawn'), None)
        assert cat is not None
        assert cat['sourceKey'] == 'srv_respawn'
    
    def test_world_time_has_fieldkeys(self):
        """world_time should have specific fieldKeys for time settings"""
        response = requests.get(f"{BASE_URL}/api/settings/schema")
        assert response.status_code == 200
        data = response.json()
        cat = next((c for c in data['categories'] if c['key'] == 'world_time'), None)
        assert cat is not None
        assert 'scum.StartTimeOfDay' in cat.get('fieldKeys', [])
        assert 'scum.TimeOfDaySpeed' in cat.get('fieldKeys', [])


class TestSectionLabels:
    """Test section label keys for i18n"""
    
    def test_sections_have_label_keys(self):
        """All sections should have labelKey for translation"""
        response = requests.get(f"{BASE_URL}/api/settings/schema")
        assert response.status_code == 200
        data = response.json()
        for section in data['sections']:
            assert 'labelKey' in section
            assert section['labelKey'].startswith('sec_')
    
    def test_categories_have_label_keys(self):
        """All categories should have labelKey for translation"""
        response = requests.get(f"{BASE_URL}/api/settings/schema")
        assert response.status_code == 200
        data = response.json()
        for cat in data['categories']:
            assert 'labelKey' in cat
            assert cat['labelKey'].startswith('cat_')


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
