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
                        # Ensure a DB session user is set so audit triggers record who made changes.
                        try:
                            cur = conn.execute("SELECT current_setting('app.current_user', true) AS cu")
                            row = cur.fetchone()
                            if not row or not row[0]:
                                try:
                                    conn.execute("SELECT set_config('app.current_user','system', true)")
                                except Exception:
                                    pass
                        except Exception:
                            # ignore session inspection errors
                            pass
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
                    # Ensure session user for audit triggers (background promote)
                    try:
                        cur = conn.execute("SELECT current_setting('app.current_user', true) AS cu")
                        row = cur.fetchone()
                        if not row or not row[0]:
                            try:
                                conn.execute("SELECT set_config('app.current_user','system', true)")
                            except Exception:
                                pass
                    except Exception:
                        pass

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
                logger.debug("DB not available or failed to persist promotion")

        return True

    def evaluate_and_promote(self, min_net_return: float = None, min_trades: int = None, auto_promote: bool = False) -> dict:
        """Evaluate challenger vs champion using simple promotion rules.

        Checks for a numeric net return and minimum trades in the challenger's
        metrics. If `auto_promote` is True and rules are satisfied, perform
        promotion and return the promotion result.
        """
        with self._lock:
            if not self.challenger:
                return {'promoted': False, 'reason': 'no_challenger'}

            cm = self.champion_metrics or {}
            chm = self.challenger_metrics or {}

        # Determine candidate metric keys
        # net return may be stored under keys like 'net_return', 'net_return_pct', 'return_pct'
        net_keys = ['net_return', 'net_return_pct', 'return_pct', 'return']
        trades_keys = ['total_trades', 'trades', 'n_trades']

        net = None
        for k in net_keys:
            if k in chm:
                try:
                    net = float(chm[k])
                    break
                except Exception:
                    continue

        trades = None
        for k in trades_keys:
            if k in chm:
                try:
                    trades = int(chm[k])
                    break
                except Exception:
                    continue

        # Apply defaults from config if not provided
        try:
            from dellmology.utils.config import Config
            if min_net_return is None:
                min_net_return = float(getattr(Config, 'PROMOTE_MIN_NET_RETURN', 0.5))
            if min_trades is None:
                min_trades = int(getattr(Config, 'PROMOTE_MIN_TRADES', 3))
        except Exception:
            if min_net_return is None:
                min_net_return = 0.5
            if min_trades is None:
                min_trades = 3

        reasons = []
        if net is None:
            reasons.append('no_net_return')
        else:
            # If net is expressed as a percent (0-100), normalize to percent if > 1
            if abs(net) > 1 and abs(net) > 100:
                # likely a raw number, accept as-is
                pass
        if trades is None:
            reasons.append('no_trades')

        # Check thresholds
        passed = True
        if net is not None and min_net_return is not None:
            if net < min_net_return:
                passed = False
                reasons.append(f'net_return_below_threshold:{net}<{min_net_return}')
        if trades is not None and min_trades is not None:
            if trades < min_trades:
                passed = False
                reasons.append(f'trades_below_threshold:{trades}<{min_trades}')

        result = {
            'champion': self.champion,
            'challenger': self.challenger,
            'champion_metrics': cm,
            'challenger_metrics': chm,
            'net': net,
            'trades': trades,
            'min_net_return': min_net_return,
            'min_trades': min_trades,
            'passed': passed,
            'reasons': reasons,
        }

        if passed and auto_promote:
            promoted = self.promote_challenger()
            result['promoted'] = promoted

        return result


# Singleton registry
registry = ModelRegistry()
