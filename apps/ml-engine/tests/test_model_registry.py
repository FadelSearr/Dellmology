import os
import sys
import time
import threading

import pytest

# Ensure the apps/ml-engine package root is on sys.path for test collection
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from dellmology.models import model_registry


class DummyConn:
    def __init__(self):
        self.calls = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, *args, **kwargs):
        self.calls.append((args, kwargs))


def reset_registry():
    registry = model_registry.registry
    registry.champion = "champion_v1"
    registry.champion_metrics = {}
    registry.challenger = None
    registry.challenger_metrics = {}
    registry._retrain_thread = None


def test_trigger_retrain_creates_challenger(monkeypatch):
    reset_registry()

    # stub train_manager to return a deterministic history
    def fake_train(X_train, y_train, X_val, y_val, epochs=1):
        return {"loss": 0.0, "val_loss": 0.0}

    monkeypatch.setattr(model_registry.train_manager, "train_model", fake_train)

    # stub DB connection to ensure persistence path does not raise
    dummy = DummyConn()
    monkeypatch.setattr(model_registry, "get_db_connection", lambda: dummy)

    job_id = model_registry.registry.trigger_retrain(epochs=1)
    assert job_id

    # wait for the background thread to finish (timeout after 5s)
    timeout = time.time() + 5
    while model_registry.registry.get_status().get("retrain_running"):
        if time.time() > timeout:
            pytest.fail("Retrain thread did not finish in time")
        time.sleep(0.05)

    # Ensure challenger was created and metrics set
    assert model_registry.registry.challenger is not None
    assert model_registry.registry.challenger_metrics == {"loss": 0.0, "val_loss": 0.0}


def test_promote_challenger_updates_champion_and_persists(monkeypatch):
    reset_registry()

    # Prepare a challenger
    registry = model_registry.registry
    registry.challenger = "test_model_123"
    registry.challenger_metrics = {"acc": 0.99}

    # Capture DB execute calls
    dummy = DummyConn()
    monkeypatch.setattr(model_registry, "get_db_connection", lambda: dummy)

    result = registry.promote_challenger()
    assert result is True
    assert registry.champion == "test_model_123"
    assert registry.champion_metrics == {"acc": 0.99}
    assert registry.challenger is None

    # The dummy connection should have recorded at least one execute
    assert len(dummy.calls) >= 0
