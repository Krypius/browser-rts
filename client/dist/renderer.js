// JavaScript renderer for Isometric RTS Game
class Renderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.context = this.canvas.getContext('2d');
        this.camera = { x: 0, y: 0, zoom: 1.0 };
        this.isDragging = false;
        this.lastMousePos = { x: 0, y: 0 };
        this.playerId = null;
        this.gameState = null;
        this.devData = null;
        this.showDevTools = true;
    }

    setPlayerId(playerId) {
        this.playerId = playerId;
    }

    updateGameState(state) {
        this.gameState = state;
    }

    updateDevData(data) {
        this.devData = data;
    }

    toggleDevTools() {
        this.showDevTools = !this.showDevTools;
    }

    handleMouseDown(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        this.isDragging = true;
        this.lastMousePos = { x, y };
    }

    handleMouseMove(event) {
        if (!this.isDragging) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        const dx = x - this.lastMousePos.x;
        const dy = y - this.lastMousePos.y;
        
        // Move camera in the opposite direction of mouse movement
        this.camera.x -= dx / this.camera.zoom;
        this.camera.y -= dy / this.camera.zoom;
        
        this.lastMousePos = { x, y };
    }

    handleMouseUp(event) {
        this.isDragging = false;
    }

    handleWheel(deltaY) {
        // Zoom in/out with mouse wheel
        const zoomFactor = deltaY > 0 ? 0.9 : 1.1;
        this.camera.zoom *= zoomFactor;
        
        // Clamp zoom level
        this.camera.zoom = Math.max(0.2, Math.min(5.0, this.camera.zoom));
    }

    handleClick(event) {
        console.log("Renderer handleClick called");
        if (this.isDragging || !this.playerId || !this.gameState) {
            console.log("Renderer handleClick returning null due to:", 
                        this.isDragging ? "isDragging" : 
                        !this.playerId ? "no playerId" : 
                        !this.gameState ? "no gameState" : "unknown reason");
            return null;
        }
        
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;
        
        // Convert canvas coordinates to world coordinates
        const worldX = canvasX / this.camera.zoom + this.camera.x;
        const worldY = canvasY / this.camera.zoom + this.camera.y;
        
        console.log("Renderer handleClick: worldX=", worldX, "worldY=", worldY);
        
        // Find the player's position
        const player = this.gameState.players.find(p => p.id === this.playerId);
        
        if (player) {
            console.log("Renderer handleClick: found player at position", player.position);
            // Calculate direction from player to click point
            const dx = worldX - player.position[0];
            const dy = worldY - player.position[1];
            
            // Create spawn data
            const spawnData = {
                position: player.position,
                direction: [dx, dy],
                count: 50
            };
            console.log("Renderer handleClick: returning spawn data", spawnData);
            return spawnData;
        }
        
        console.log("Renderer handleClick: player not found");
        return null;
    }

    render() {
        this.clearCanvas();
        
        if (this.gameState) {
            this.renderGrid();
            this.renderTroops();
            
            if (this.showDevTools) {
                this.renderDevTools();
            }
        }
    }

    clearCanvas() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        this.context.fillStyle = "#222222";
        this.context.fillRect(0, 0, width, height);
    }

    renderGrid() {
        const mapSize = this.gameState.map_size;
        const gridSize = 100;
        
        this.context.save();
        
        // Apply camera transform
        this.context.translate(-this.camera.x * this.camera.zoom, -this.camera.y * this.camera.zoom);
        this.context.scale(this.camera.zoom, this.camera.zoom);
        
        // Draw grid
        this.context.strokeStyle = "#444444";
        this.context.lineWidth = 1;
        
        // Vertical lines
        for (let x = 0; x <= mapSize[0]; x += gridSize) {
            this.context.beginPath();
            this.context.moveTo(x, 0);
            this.context.lineTo(x, mapSize[1]);
            this.context.stroke();
        }
        
        // Horizontal lines
        for (let y = 0; y <= mapSize[1]; y += gridSize) {
            this.context.beginPath();
            this.context.moveTo(0, y);
            this.context.lineTo(mapSize[0], y);
            this.context.stroke();
        }
        
        // Draw map border
        this.context.strokeStyle = "#888888";
        this.context.lineWidth = 2;
        this.context.strokeRect(0, 0, mapSize[0], mapSize[1]);
        
        this.context.restore();
    }

    renderTroops() {
        this.context.save();
        
        // Apply camera transform
        this.context.translate(-this.camera.x * this.camera.zoom, -this.camera.y * this.camera.zoom);
        this.context.scale(this.camera.zoom, this.camera.zoom);
        
        // Draw troops
        for (const troop of this.gameState.troops) {
            const [x, y] = troop.position;
            const [r, g, b] = troop.color;
            const color = `rgb(${r}, ${g}, ${b})`;
            const size = 10;
            
            this.context.save();
            this.context.translate(x, y);
            
            // Draw health bar
            const healthWidth = size * 1.5;
            const healthHeight = 2;
            const healthY = -size - 5;
            
            this.context.fillStyle = "#ff0000";
            this.context.fillRect(-healthWidth/2, healthY, healthWidth, healthHeight);
            
            this.context.fillStyle = "#00ff00";
            const healthPercent = troop.health / 100;
            this.context.fillRect(-healthWidth/2, healthY, healthWidth * healthPercent, healthHeight);
            
            // Draw troop shape
            this.context.fillStyle = color;
            
            switch (troop.shape) {
                case "circle":
                    this.context.beginPath();
                    this.context.arc(0, 0, size/2, 0, 2 * Math.PI);
                    this.context.fill();
                    break;
                case "square":
                    this.context.fillRect(-size/2, -size/2, size, size);
                    break;
                case "triangle":
                    this.context.beginPath();
                    this.context.moveTo(0, -size/2);
                    this.context.lineTo(size/2, size/2);
                    this.context.lineTo(-size/2, size/2);
                    this.context.closePath();
                    this.context.fill();
                    break;
                default:
                    this.context.fillRect(-size/2, -size/2, size, size);
            }
            
            // Draw direction indicator
            const [dx, dy] = troop.direction;
            this.context.strokeStyle = "#ffffff";
            this.context.lineWidth = 1;
            this.context.beginPath();
            this.context.moveTo(0, 0);
            this.context.lineTo(dx * size, dy * size);
            this.context.stroke();
            
            this.context.restore();
        }
        
        this.context.restore();
    }

    renderDevTools() {
        if (!this.devData) return;
        
        this.context.save();
        
        // Draw dev tools panel
        this.context.fillStyle = "rgba(0, 0, 0, 0.7)";
        this.context.fillRect(10, 10, 200, 150);
        
        this.context.font = "14px Arial";
        this.context.fillStyle = "#ffffff";
        
        // FPS
        this.context.fillText(`FPS: ${this.devData.fps.toFixed(1)}`, 20, 30);
        
        // Player count
        this.context.fillText(`Players: ${this.devData.player_count}`, 20, 50);
        
        // Troop count
        this.context.fillText(`Troops: ${this.devData.troop_count}`, 20, 70);
        
        // Camera position
        this.context.fillText(`Camera: (${Math.floor(this.camera.x)}, ${Math.floor(this.camera.y)})`, 20, 90);
        
        // Zoom level
        this.context.fillText(`Zoom: ${this.camera.zoom.toFixed(1)}x`, 20, 110);
        
        // Player ID
        if (this.playerId) {
            this.context.fillText(`Player ID: ${this.playerId}`, 20, 130);
        }
        
        this.context.restore();
    }
}

// Export the Renderer class
window.Renderer = Renderer;
