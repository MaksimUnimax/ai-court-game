#!/usr/bin/env bash
set -euo pipefail

# Always start the app with the Silero virtualenv interpreter.
cd "$(dirname "${BASH_SOURCE[0]}")/.."
exec /opt/ai-court-game/.runtime/silero-venv/bin/python app/server.py
