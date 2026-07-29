from __future__ import annotations

import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ENV_FILE = PROJECT_ROOT / ".env"


def load_project_env(path: Path | None = None) -> Path:
    """Load simple KEY=VALUE entries without overriding process environment."""

    env_path = path or DEFAULT_ENV_FILE
    if not env_path.exists():
        return env_path
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, value)
    return env_path


load_project_env()


def configured(name: str) -> bool:
    value = os.environ.get(name)
    return bool(value and value.strip())
