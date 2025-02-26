# Browser RTS Game

A multiplayer isometric real-time strategy game with particle-like troop simulation. The game features waves of troops crashing into each other with simple, distinct shapes for graphics.

## Features

- Multiplayer real-time strategy gameplay
- Isometric view with camera controls (pan and zoom)
- Particle-like troop simulation with different shapes and colors
- No resource gathering - focus on troop movement and combat
- Built-in dev tools for game insights during gameplay
- Python server backend with WebAssembly frontend

## Technical Stack

- **Backend**: Python with FastAPI and Socket.IO for real-time communication
- **Frontend**: Rust compiled to WebAssembly with JavaScript interface
- **Rendering**: HTML5 Canvas with isometric projection
- **Communication**: Socket.IO for real-time game state updates

## Prerequisites

- Python 3.8+
- Node.js and npm
- Rust and Cargo
- wasm-pack (for compiling Rust to WebAssembly)

## Setup Instructions

### 1. Install Dependencies

First, install the required Python packages:

```bash
cd server
pip install -r requirements.txt
```

Then, install the Node.js dependencies for the client:

```bash
cd client
npm install
```

### 2. Build the WebAssembly Module

Build the Rust code into WebAssembly:

```bash
cd client
npm run build
```

This will compile the Rust code to WebAssembly and copy the necessary files to the client/dist directory.

### 3. Run the Game

Start the server:

```bash
cd client
npm start
```

This will start the Python server, which will serve the client files and handle the game logic.

Open your browser and navigate to:

```
http://localhost:8000
```

## Game Controls

- **Mouse Drag**: Move the camera
- **Mouse Wheel**: Zoom in/out
- **Click**: Spawn troops in the clicked direction (when spawn mode is active)
- **S Key**: Toggle spawn troops mode
- **D Key**: Toggle dev tools display

## Dev Tools

The game includes built-in developer tools that provide insights into the game as it's being played:

- FPS counter
- Player count
- Troop count
- Camera position
- Zoom level
- Player ID

## Game Mechanics

- Each player is assigned a random color
- Players can spawn troops that move in a specified direction
- Troops are represented by different shapes (circles, squares, triangles)
- When troops from different players collide, they attack each other and bounce off
- Troops have health bars and die when their health reaches zero

## Project Structure

```
├── server/              # Python server
│   ├── requirements.txt # Python dependencies
│   └── src/             # Server source code
│       └── main.py      # Main server file
│
├── client/              # Client code
│   ├── Cargo.toml       # Rust dependencies
│   ├── src/             # Rust source code
│   │   └── lib.rs       # WebAssembly module
│   ├── dist/            # Distribution files
│   │   ├── index.html   # HTML entry point
│   │   └── index.js     # JavaScript code
│   ├── build.js         # Build script
│   └── package.json     # Node.js dependencies
│
└── README.md            # This file
```

## Extending the Game

Here are some ideas for extending the game:

- Add different troop types with unique abilities
- Implement terrain features that affect troop movement
- Add buildings or structures that can be captured
- Implement a simple AI opponent
- Add more advanced dev tools like heatmaps or path visualization
