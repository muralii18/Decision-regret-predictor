"""Service wiring tests for the FastAPI prediction API.

Routes and status reporting only; model behaviour, validation and safety are
covered in test_prediction_api.py. No test asserts model quality — the
dataset is synthetic and tiny.
"""

from prediction.main import app, health, root


def test_app_exposes_expected_routes():
    paths = {route.path for route in app.routes}
    assert {"/", "/health", "/predict"} <= paths


def test_root_reports_service_status():
    body = root()
    assert body["status"] == "ok"
    # Loadable-model state depends on whether the (git-ignored) local
    # artifact exists — only its type is asserted, never its value.
    assert isinstance(body["model_loaded"], bool)


def test_health_reports_ok_and_model_state():
    body = health()
    assert body["status"] == "ok"
    assert isinstance(body["model_loaded"], bool)
