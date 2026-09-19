import os
import sys

os.environ.setdefault("ANTHROPIC_API_KEY", "test-not-used")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
