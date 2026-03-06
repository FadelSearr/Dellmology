import sys
from pathlib import Path

# Ensure local package `apps/ml-engine` is importable during tests
ROOT = Path(__file__).resolve().parent
ML_ENGINE_PATH = ROOT / "apps" / "ml-engine"
sys.path.insert(0, str(ML_ENGINE_PATH))
