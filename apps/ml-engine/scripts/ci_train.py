"""CI wrapper to call the training script and print artifact path.

Used by CI to produce a small model artifact for downstream steps.
"""
import subprocess
import sys
from pathlib import Path


def main():
    # run training script
    p = subprocess.run([sys.executable, "train_cnn.py"], cwd=Path(__file__).parents[1])
    if p.returncode != 0:
        print("TRAIN_FAILED")
        sys.exit(p.returncode)
    print("TRAIN_OK")


if __name__ == '__main__':
    main()
