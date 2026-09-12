from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from backend.app import app

client = TestClient(app)

def test_select_folder_cancelled_mock():
    with patch("subprocess.run") as mock_run:
        mock_res = MagicMock()
        mock_res.stdout = ""
        mock_run.return_value = mock_res
        response = client.post("/api/select-folder")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "cancelled"
        assert data["folder_path"] is None

def test_select_folder_success_mock():
    with patch("subprocess.run") as mock_run:
        mock_res = MagicMock()
        mock_res.stdout = "/Users/test/Documents/Media\n"
        mock_run.return_value = mock_res
        response = client.post("/api/select-folder")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["folder_path"] == "/Users/test/Documents/Media"
