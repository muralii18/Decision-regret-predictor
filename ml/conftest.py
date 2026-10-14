"""Ensures the ml/ directory is importable when running pytest from anywhere."""
import sys
from pathlib import Path

ML_ROOT = str(Path(__file__).resolve().parent)
if ML_ROOT not in sys.path:
    sys.path.insert(0, ML_ROOT)
