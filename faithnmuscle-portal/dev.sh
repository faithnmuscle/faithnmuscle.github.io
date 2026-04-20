#!/bin/bash
# Local dev server for Faith n Muscle Portal
# Usage: ./dev.sh
# Then open http://localhost:3000/login.html

PORT=${1:-3000}
echo "Starting portal dev server on http://localhost:$PORT"
echo "Open: http://localhost:$PORT/login.html"
echo "Press Ctrl+C to stop"
echo ""
python3 -m http.server $PORT
