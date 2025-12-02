#!/bin/bash
# Quick script to kill processes on ports 5000 and 5173

echo "Killing processes on ports 5000 and 5173..."

# Kill port 5000 (backend)
if lsof -ti:5000 > /dev/null 2>&1; then
  echo "Killing process on port 5000..."
  lsof -ti:5000 | xargs kill -9
  echo "✓ Port 5000 freed"
else
  echo "✓ Port 5000 is already free"
fi

# Kill port 5173 (frontend)
if lsof -ti:5173 > /dev/null 2>&1; then
  echo "Killing process on port 5173..."
  lsof -ti:5173 | xargs kill -9
  echo "✓ Port 5173 freed"
else
  echo "✓ Port 5173 is already free"
fi

echo ""
echo "Ports are now free. You can run 'npm run dev' now."


