"""
In-memory model registry and retraining controller
"""
import threading
import logging
import time
from typing import Dict, Optional
import json
import numpy as np

from . import train_manager
from dellmology.utils.db_utils import get_db_connection
from dellmology.models import retrain_manager

logger = logging.getLogger(__name__)


class ModelRegistry:
    def __init__(self):
        self._lock = threading.Lock()
        self.champion: Optional[str] = "champion_v1"
        self.champion_metrics: Dict = {}
        self.champion_checkpoint: Optional[str] = None
        self.challenger: Optional[str] = None
        self.challenger_metrics: Dict = {}
        self.challenger_checkpoint: Optional[str] = None
        self._retrain_thread: Optional[threading.Thread] = None

    def get_status(self) -> Dict:
        with self._lock:
            return {
                "champion": self.champion,
                "champion_metrics": self.champion_metrics,
                "champion_checkpoint": self.champion_checkpoint,
                "challenger": self.challenger,
                "challenger_metrics": self.challenger_metrics,
                "challenger_checkpoint": self.challenger_checkpoint,
                "retrain_running": self._retrain_thread is not None and self._retrain_thread.is_alive(),
            }

    def trigger_retrain(self, epochs: int = 5) -> str:
        """Start retraining in background. Returns a job id (timestamp string)."""
        def _job():
            logger.info("Retrain job started")
            # Simulate loading data / training — call train_manager.train_model with dummy arrays
            try:
                X_train = np.zeros((1, 10))
                y_train = np.zeros((1,))
                X_val = np.zeros((1, 10))
                y_val = np.zeros((1,))
                history = train_manager.train_model(X_train, y_train, X_val, y_val, epochs=epochs)
                # create challenger name
                challenger_name = f"model_{int(time.time())}"
                with self._lock:
                    self.challenger = challenger_name
                    self.challenger_metrics = history
                # Persist challenger record to DB if available
                try:
                    with get_db_connection() as conn:
                        # Try to update existing record first
                        try:
                            update_sql = """
                            UPDATE ml_models
                            SET role='challenger', metrics = :metrics::jsonb, created_at = now()
                            WHERE model_name = :name
                            """
                            res = conn.execute(update_sql, {
                                'name': challenger_name,
                                'metrics': json.dumps(history or {})
                            })
                            # If no row updated, insert a new record
                            if getattr(res, 'rowcount', None) in (None, 0):
                                insert_sql = """
                                INSERT INTO ml_models (model_name, role, metrics)
                                VALUES (:name, 'challenger', :metrics::jsonb)
                                """
                                conn.execute(insert_sql, {
                                    'name': challenger_name,
                                    'metrics': json.dumps(history or {})
                                })
                        except Exception:
                            # Fallback: try insert directly
                            try:
                                conn.execute(
                                    "INSERT INTO ml_models (model_name, role, metrics) VALUES (:name, 'challenger', :metrics::jsonb)",
                                    {'name': challenger_name, 'metrics': json.dumps(history or {})}
                                )
                            except Exception:
                                pass

                        # Best-effort: write an audit entry for challenger creation
                        try:
                            conn.execute(
                                "INSERT INTO ml_model_audit (model_name, action, details) VALUES (:name, 'created_challenger', :details::jsonb)",
                                {'name': challenger_name, 'details': json.dumps({'metrics': history or {}})}
                            )
                        except Exception:
                            # ignore audit write failures
                            pass
                except Exception:
                    logger.debug("DB not available or failed to persist challenger metadata")
                # Best-effort: save a local checkpoint for this challenger
                try:
                    retrain_manager.save_checkpoint(challenger_name, history or {}, metadata={"source": "auto_retrain"})
                except Exception:
                    logger.debug("Failed to save retrain checkpoint locally")

                logger.info(f"Retrain job finished, challenger={challenger_name}")
            except Exception:
                logger.exception("Retrain job failed")

        job_id = str(int(time.time()))
        thread = threading.Thread(target=_job, name=f"retrain-{job_id}", daemon=True)
        with self._lock:
            self._retrain_thread = thread
        thread.start()
        return job_id

    def promote_challenger(self) -> bool:
        """Promote challenger to champion. Returns True on success."""
        with self._lock:
            if not self.challenger:
                return False
            # Promote in-memory
            self.champion = self.challenger
            self.champion_metrics = self.challenger_metrics or {}
            self.champion_checkpoint = self.challenger_checkpoint
            # reset challenger
            self.challenger = None
            self.challenger_metrics = {}
            self.challenger_checkpoint = None
            logger.info(f"Promoted new champion: {self.champion}")

        # Persist role change to DB if available (best-effort)
        try:
            with get_db_connection() as conn:
                try:
                    trans = conn.begin()
                    try:
                        conn.execute("UPDATE ml_models SET role='archived' WHERE role='champion'")
                        res = conn.execute(
                            "UPDATE ml_models SET role='champion', checkpoint_name = :checkpoint WHERE model_name = :name",
                            {'name': self.champion, 'checkpoint': getattr(self, 'champion_checkpoint', None)}
                        )
                        if getattr(res, 'rowcount', None) in (None, 0):
                            conn.execute(
                                "INSERT INTO ml_models (model_name, role, metrics, checkpoint_name) VALUES (:name, 'champion', :metrics::jsonb, :checkpoint)",
                                {'name': self.champion, 'metrics': json.dumps(self.champion_metrics or {}), 'checkpoint': getattr(self, 'champion_checkpoint', None)}
                            )
                        # Attempt to record promotion in audit table
                        try:
                            conn.execute(
                                "INSERT INTO ml_model_audit (model_name, action, details) VALUES (:name, 'promoted_to_champion', :details::jsonb)",
                                {'name': self.champion, 'details': json.dumps({'metrics': self.champion_metrics or {}, 'checkpoint': getattr(self, 'champion_checkpoint', None)})}
                            )
                        except Exception:
                            pass
                        trans.commit()
                    except Exception:
                        try:
                            trans.rollback()
                        except Exception:
                            pass
                except Exception:
                    # Best-effort: ignore DB failures
                    pass
        except Exception:
            logger.debug("DB not available or failed to persist promotion")

        return True


# Singleton registry
registry = ModelRegistry()
