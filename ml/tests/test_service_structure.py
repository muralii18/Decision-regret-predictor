"""Structure tests for the ML service skeleton.

These tests verify wiring only (routes, status reporting). They make no
claims about model quality because no model exists yet.
"""

from prediction.main import app, health, predict, root


def test_app_exposes_expected_routes():
    paths = {route.path for route in app.routes}
    assert {"/", "/health", "/predict"} <= paths


def test_root_reports_skeleton_status():
    body = root()
    assert body["status"] == "skeleton"
    assert body["model_trained"] is False


def test_health_reports_model_not_trained():
    body = health()
    assert body["status"] == "ok"
    assert body["model_trained"] is False


def test_predict_returns_not_implemented():
    response = predict()
    assert response.status_code == 501
    assert response.body is not None
