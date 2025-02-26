#!/bin/bash
echo "Starting Isometric RTS Game Setup..."
echo

echo "Step 1: Installing Python dependencies..."
cd server
pip install -r requirements.txt
cd ..
echo

echo "Step 2: Installing Node.js dependencies..."
cd client
npm install
cd ..
echo

echo "Step 3: Ensuring client/dist directory exists and contains necessary files..."
mkdir -p client/dist
cp -f client/dist/index.html client/dist/index.html 2>/dev/null || :
cp -f client/dist/index.js client/dist/index.js 2>/dev/null || :
cp -f client/dist/renderer.js client/dist/renderer.js 2>/dev/null || :

echo "Step 4: Downloading Socket.IO client..."
cd client/dist
node download_socketio.js
cd ../..
echo

echo "Step 5: Starting the game server..."
echo "The game will be available at http://localhost:8000"
echo "Press Ctrl+C to stop the server when you're done playing."
echo

echo "Opening browser to http://localhost:8000..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    open http://localhost:8000
else
    # Linux
    xdg-open http://localhost:8000 &>/dev/null || python -m webbrowser http://localhost:8000
fi

echo "Starting server..."
cd server/src
python main.py
