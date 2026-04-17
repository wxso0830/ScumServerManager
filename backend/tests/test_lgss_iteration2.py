"""
LGSS SCUM Server Manager - Iteration 2 Backend API Tests
Tests: schema endpoint, new settings categories, export/import endpoints, real SCUM defaults
"""
import pytest
import requests
import os
import json

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestSchemaEndpoint:
    """Tests for GET /api/settings/schema"""
    
    def test_schema_returns_categories_and_sections(self):
        """Test /api/settings/schema returns categories array and sections"""
        response = requests.get(f"{BASE_URL}/api/settings/schema")
        assert response.status_code == 200
        data = response.json()
        
        assert "categories" in data
        assert "sections" in data
        assert isinstance(data["categories"], list)
        assert isinstance(data["sections"], list)
        
        # Should have ~20 categories
        assert len(data["categories"]) >= 18, f"Expected ~20 categories, got {len(data['categories'])}"
        print(f"✓ Schema has {len(data['categories'])} categories and {len(data['sections'])} sections")
    
    def test_schema_has_5_sections(self):
        """Test schema has server/users/economy/advanced/client sections"""
        response = requests.get(f"{BASE_URL}/api/settings/schema")
        data = response.json()
        
        section_keys = [s["key"] for s in data["sections"]]
        expected_sections = ["server", "users", "economy", "advanced", "client"]
        
        for sec in expected_sections:
            assert sec in section_keys, f"Missing section: {sec}"
        print(f"✓ All 5 sections present: {section_keys}")
    
    def test_schema_category_structure(self):
        """Test each category has required fields"""
        response = requests.get(f"{BASE_URL}/api/settings/schema")
        data = response.json()
        
        required_fields = ["key", "labelKey", "icon", "renderer", "exportKey", "section"]
        for cat in data["categories"]:
            for field in required_fields:
                assert field in cat, f"Category {cat.get('key')} missing field: {field}"
        print(f"✓ All categories have required fields")


class TestServerCreationWithRealDefaults:
    """Tests that newly created servers get real SCUM defaults"""
    
    @pytest.fixture(autouse=True)
    def setup_completed(self):
        """Ensure setup is completed before server tests"""
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
    
    def test_server_has_srv_general_with_real_defaults(self):
        """Test srv_general has ~64 keys including real ServerName"""
        response = requests.post(f"{BASE_URL}/api/servers", json={})
        assert response.status_code == 200
        server = response.json()
        
        settings = server["settings"]
        assert "srv_general" in settings, "Missing srv_general category"
        
        srv_general = settings["srv_general"]
        # Should have many keys from real ServerSettings.ini
        assert len(srv_general) >= 50, f"Expected ~64 keys in srv_general, got {len(srv_general)}"
        
        # Check for real server name from the config file
        assert "scum.ServerName" in srv_general, "Missing scum.ServerName"
        assert "[TR] LEGENDARY GAMING" in srv_general["scum.ServerName"], \
            f"Expected real server name, got: {srv_general['scum.ServerName']}"
        
        print(f"✓ srv_general has {len(srv_general)} keys, ServerName={srv_general['scum.ServerName'][:50]}...")
    
    def test_server_has_srv_world_with_real_defaults(self):
        """Test srv_world has ~134 keys"""
        response = requests.post(f"{BASE_URL}/api/servers", json={})
        server = response.json()
        
        settings = server["settings"]
        assert "srv_world" in settings, "Missing srv_world category"
        
        srv_world = settings["srv_world"]
        assert len(srv_world) >= 100, f"Expected ~134 keys in srv_world, got {len(srv_world)}"
        print(f"✓ srv_world has {len(srv_world)} keys")
    
    def test_server_has_srv_features_with_real_defaults(self):
        """Test srv_features has ~127 keys"""
        response = requests.post(f"{BASE_URL}/api/servers", json={})
        server = response.json()
        
        settings = server["settings"]
        assert "srv_features" in settings, "Missing srv_features category"
        
        srv_features = settings["srv_features"]
        assert len(srv_features) >= 100, f"Expected ~127 keys in srv_features, got {len(srv_features)}"
        print(f"✓ srv_features has {len(srv_features)} keys")
    
    def test_server_has_economy_traders_with_28_traders(self):
        """Test economy_traders has 28 trader keys"""
        response = requests.post(f"{BASE_URL}/api/servers", json={})
        server = response.json()
        
        settings = server["settings"]
        assert "economy_traders" in settings, "Missing economy_traders category"
        
        traders = settings["economy_traders"]
        assert len(traders) == 28, f"Expected 28 traders, got {len(traders)}"
        
        # Check for specific trader
        assert "A_0_Armory" in traders, "Missing A_0_Armory trader"
        print(f"✓ economy_traders has {len(traders)} traders")
    
    def test_server_has_raid_times_with_5_entries(self):
        """Test raid_times has 5 entries"""
        response = requests.post(f"{BASE_URL}/api/servers", json={})
        server = response.json()
        
        settings = server["settings"]
        assert "raid_times" in settings, "Missing raid_times category"
        
        raid_times = settings["raid_times"]
        assert len(raid_times) == 5, f"Expected 5 raid time entries, got {len(raid_times)}"
        
        # Check structure
        first_entry = raid_times[0]
        assert "day" in first_entry
        assert "time" in first_entry
        print(f"✓ raid_times has {len(raid_times)} entries")
    
    def test_server_has_input_axis_with_40_entries(self):
        """Test input_axis has 40 entries"""
        response = requests.post(f"{BASE_URL}/api/servers", json={})
        server = response.json()
        
        settings = server["settings"]
        assert "input_axis" in settings, "Missing input_axis category"
        
        input_axis = settings["input_axis"]
        assert len(input_axis) == 40, f"Expected 40 axis mappings, got {len(input_axis)}"
        print(f"✓ input_axis has {len(input_axis)} entries")
    
    def test_server_has_users_admins_with_steam_ids(self):
        """Test users_admins has pre-populated steam ids"""
        response = requests.post(f"{BASE_URL}/api/servers", json={})
        server = response.json()
        
        settings = server["settings"]
        assert "users_admins" in settings, "Missing users_admins category"
        
        admins = settings["users_admins"]
        assert len(admins) >= 2, f"Expected at least 2 admin entries, got {len(admins)}"
        
        # Check for specific steam IDs
        steam_ids = [a["steam_id"] for a in admins]
        assert "76561199169074640" in steam_ids, "Missing steam ID 76561199169074640"
        assert "76561199064932818" in steam_ids, "Missing steam ID 76561199064932818"
        
        # Check godmode flag
        godmode_admin = next((a for a in admins if a["steam_id"] == "76561199064932818"), None)
        assert godmode_admin is not None
        assert "godmode" in godmode_admin.get("flags", []), "Missing godmode flag"
        print(f"✓ users_admins has {len(admins)} entries with correct steam IDs and flags")
    
    def test_server_has_client_settings(self):
        """Test client_game/mouse/video/graphics/sound are populated"""
        response = requests.post(f"{BASE_URL}/api/servers", json={})
        server = response.json()
        
        settings = server["settings"]
        client_categories = ["client_game", "client_mouse", "client_video", "client_graphics", "client_sound"]
        
        for cat in client_categories:
            assert cat in settings, f"Missing {cat} category"
            # At least some should have data
        
        print(f"✓ All client categories present")
    
    def test_string_values_preserved(self):
        """Test that time ranges and gold prices stay as strings"""
        response = requests.post(f"{BASE_URL}/api/servers", json={})
        server = response.json()
        
        settings = server["settings"]
        
        # Check time values in srv_general
        srv_general = settings.get("srv_general", {})
        time_key = "scum.MaximumTimeForChestsInForbiddenZones"
        if time_key in srv_general:
            val = srv_general[time_key]
            assert isinstance(val, str), f"{time_key} should be string, got {type(val)}: {val}"
            assert ":" in val, f"{time_key} should be time format, got: {val}"
        
        # Check gold prices in srv_respawn
        srv_respawn = settings.get("srv_respawn", {})
        gold_key = "scum.ShelterRespawnPrice"
        if gold_key in srv_respawn:
            val = srv_respawn[gold_key]
            assert isinstance(val, str), f"{gold_key} should be string, got {type(val)}: {val}"
            assert "g" in val.lower(), f"{gold_key} should have 'g' suffix, got: {val}"
        
        print(f"✓ String values (time ranges, gold prices) preserved correctly")


class TestExportEndpoints:
    """Tests for GET /api/servers/{id}/export/{file_key}"""
    
    @pytest.fixture(autouse=True)
    def setup_and_create_server(self):
        """Setup and create a server for export tests"""
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
    
    def test_export_server_settings(self):
        """Test export server_settings returns INI with 6 sections"""
        response = requests.get(f"{BASE_URL}/api/servers/{self.server_id}/export/server_settings")
        assert response.status_code == 200
        data = response.json()
        
        assert data["filename"] == "ServerSettings.ini"
        content = data["content"]
        
        # Check for all 6 sections
        expected_sections = ["[General]", "[World]", "[Respawn]", "[Vehicles]", "[Damage]", "[Features]"]
        for section in expected_sections:
            assert section in content, f"Missing section: {section}"
        
        print(f"✓ ServerSettings.ini export has all 6 sections")
    
    def test_export_raid_times(self):
        """Test export raid_times returns JSON with raiding-times array"""
        response = requests.get(f"{BASE_URL}/api/servers/{self.server_id}/export/raid_times")
        assert response.status_code == 200
        data = response.json()
        
        assert data["filename"] == "RaidTimes.json"
        content = json.loads(data["content"])
        
        assert "raiding-times" in content
        assert isinstance(content["raiding-times"], list)
        assert len(content["raiding-times"]) == 5
        print(f"✓ RaidTimes.json export has {len(content['raiding-times'])} entries")
    
    def test_export_notifications(self):
        """Test export notifications returns JSON with Notifications array"""
        response = requests.get(f"{BASE_URL}/api/servers/{self.server_id}/export/notifications")
        assert response.status_code == 200
        data = response.json()
        
        assert data["filename"] == "Notifications.json"
        content = json.loads(data["content"])
        
        assert "Notifications" in content
        assert isinstance(content["Notifications"], list)
        print(f"✓ Notifications.json export correct")
    
    def test_export_input(self):
        """Test export input returns INI with AxisMappings lines"""
        response = requests.get(f"{BASE_URL}/api/servers/{self.server_id}/export/input")
        assert response.status_code == 200
        data = response.json()
        
        assert data["filename"] == "Input.ini"
        content = data["content"]
        
        assert "[/Script/Engine.InputSettings]" in content
        assert "AxisMappings=" in content
        
        # Count axis mappings
        axis_count = content.count("AxisMappings=")
        assert axis_count == 40, f"Expected 40 AxisMappings, got {axis_count}"
        print(f"✓ Input.ini export has {axis_count} AxisMappings")
    
    def test_export_economy(self):
        """Test export economy returns JSON with economy-override and traders"""
        response = requests.get(f"{BASE_URL}/api/servers/{self.server_id}/export/economy")
        assert response.status_code == 200
        data = response.json()
        
        assert data["filename"] == "EconomyOverride.json"
        content = json.loads(data["content"])
        
        assert "economy-override" in content
        override = content["economy-override"]
        assert "traders" in override
        assert len(override["traders"]) == 28
        print(f"✓ EconomyOverride.json export has {len(override['traders'])} traders")
    
    def test_export_gameusersettings(self):
        """Test export gameusersettings returns INI with client sections"""
        response = requests.get(f"{BASE_URL}/api/servers/{self.server_id}/export/gameusersettings")
        assert response.status_code == 200
        data = response.json()
        
        assert data["filename"] == "GameUserSettings.ini"
        content = data["content"]
        
        expected_sections = ["[Game]", "[Mouse]", "[Video]", "[Graphics]", "[Sound]"]
        for section in expected_sections:
            assert section in content, f"Missing section: {section}"
        print(f"✓ GameUserSettings.ini export has all 5 sections")
    
    def test_export_admins(self):
        """Test export admins returns INI with steam IDs and flags"""
        response = requests.get(f"{BASE_URL}/api/servers/{self.server_id}/export/admins")
        assert response.status_code == 200
        data = response.json()
        
        assert data["filename"] == "AdminUsers.ini"
        content = data["content"]
        
        assert "76561199169074640" in content
        assert "76561199064932818[godmode]" in content
        print(f"✓ AdminUsers.ini export has correct steam IDs with flags")


class TestImportEndpoints:
    """Tests for POST /api/servers/{id}/import/{file_key}"""
    
    @pytest.fixture(autouse=True)
    def setup_and_create_server(self):
        """Setup and create a server for import tests"""
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
    
    def test_import_server_settings(self):
        """Test import server_settings parses INI and merges into srv_* categories"""
        ini_content = """[General]
scum.ServerName=TEST_Imported Server
scum.MaxPlayers=100

[World]
scum.MaxAllowedBirds=20
"""
        response = requests.post(
            f"{BASE_URL}/api/servers/{self.server_id}/import/server_settings",
            json={"content": ini_content}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify imported values
        assert data["settings"]["srv_general"]["scum.ServerName"] == "TEST_Imported Server"
        assert data["settings"]["srv_general"]["scum.MaxPlayers"] == 100
        assert data["settings"]["srv_world"]["scum.MaxAllowedBirds"] == 20
        print(f"✓ ServerSettings.ini import merged correctly")
    
    def test_import_raid_times(self):
        """Test import raid_times parses JSON and replaces raid_times array"""
        json_content = json.dumps({
            "raiding-times": [
                {"day": "Monday", "time": "10:00-12:00", "start-announcement-time": "15", "end-announcement-time": "15"}
            ]
        })
        response = requests.post(
            f"{BASE_URL}/api/servers/{self.server_id}/import/raid_times",
            json={"content": json_content}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["settings"]["raid_times"]) == 1
        assert data["settings"]["raid_times"][0]["day"] == "Monday"
        print(f"✓ RaidTimes.json import replaced correctly")
    
    def test_import_input(self):
        """Test import input parses INI and sets input_axis + input_action"""
        ini_content = """[/Script/Engine.InputSettings]
AxisMappings=(AxisName="TestAxis1",Scale=1.0,Key=W)
AxisMappings=(AxisName="TestAxis2",Scale=-1.0,Key=S)
ActionMappings=(ActionName="TestAction",Key=SpaceBar)
"""
        response = requests.post(
            f"{BASE_URL}/api/servers/{self.server_id}/import/input",
            json={"content": ini_content}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["settings"]["input_axis"]) == 2
        assert len(data["settings"]["input_action"]) == 1
        print(f"✓ Input.ini import parsed correctly")


class TestSettingsUpdate:
    """Tests for PUT /api/servers/{id}/settings with new categories"""
    
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
        
        server = requests.post(f"{BASE_URL}/api/servers", json={}).json()
        self.server_id = server["id"]
        yield
    
    def test_update_srv_general_partial(self):
        """Test partial update to srv_general preserves other keys"""
        # Get current settings
        get_response = requests.get(f"{BASE_URL}/api/servers/{self.server_id}")
        original_settings = get_response.json()["settings"]["srv_general"]
        original_key_count = len(original_settings)
        
        # Update only one key
        new_settings = {
            "srv_general": {
                "scum.ServerName": "TEST_Updated Name"
            }
        }
        response = requests.put(
            f"{BASE_URL}/api/servers/{self.server_id}/settings",
            json={"settings": new_settings}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify update
        assert data["settings"]["srv_general"]["scum.ServerName"] == "TEST_Updated Name"
        
        # Verify other keys preserved
        assert len(data["settings"]["srv_general"]) == original_key_count
        print(f"✓ Partial update preserved {original_key_count} keys")
    
    def test_update_raid_times_array(self):
        """Test updating raid_times array"""
        new_settings = {
            "raid_times": [
                {"day": "TEST_Day", "time": "00:00-01:00", "start-announcement-time": "5", "end-announcement-time": "5"}
            ]
        }
        response = requests.put(
            f"{BASE_URL}/api/servers/{self.server_id}/settings",
            json={"settings": new_settings}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["settings"]["raid_times"]) == 1
        assert data["settings"]["raid_times"][0]["day"] == "TEST_Day"
        print(f"✓ raid_times array updated correctly")


# Cleanup fixture
@pytest.fixture(scope="session", autouse=True)
def cleanup_after_tests():
    yield
    requests.post(f"{BASE_URL}/api/setup/reset")
    print("\n✓ Cleanup: Setup reset after all tests")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
