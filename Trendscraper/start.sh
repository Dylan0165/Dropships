#!/bin/bash
cd "$(dirname "$0")"
python -m venv venv 2>/dev/null || true
source venv/bin/activate
pip install -r requirements.txt -q
mkdir -p data
uvicorn main:app --host 0.0.0.0 --port 8001
