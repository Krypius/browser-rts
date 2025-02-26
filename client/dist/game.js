// Game class for Isometric RTS Game
class Game {
    constructor(canvasId) {
        this.renderer = new Renderer(canvasId);
        this.playerId = null;
        this.selectedTroops = [];
        this.isSpawningTroops = false;
        this.isSelecting = false;
        this.selectionStart = { x: 0, y: 0 };
        this.selectionEnd = { x: 0, y: 0 };
        this.gameState = null;
    }

    set_player_id(playerId) {
        this.playerId = playerId;
        this.renderer.setPlayerId(playerId);
    }

    update_game_state(state) {
        this.gameState = state;
        this.renderer.updateGameState(state);
    }

    update_dev_data(data) {
        this.renderer.updateDevData(data);
    }

    handle_click(event) {
        // Always return spawn data, let the caller decide whether to use it based on spawning mode
        const spawnData = this.renderer.handleClick(event);
        console.log("handle_click called, spawn data:", spawnData);
        return spawnData;
    }

    handle_mouse_down(event) {
        const rect = this.renderer.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        // Check if Alt key is pressed for camera movement
        if (event.altKey) {
            this.renderer.handleMouseDown(event);
        } else {
            // Start selection
            this.isSelecting = true;
            this.selectionStart = { x, y };
            this.selectionEnd = { x, y };
        }
    }

    handle_mouse_move(event) {
        const rect = this.renderer.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        // If Alt key is pressed or renderer is already dragging, handle camera movement
        if (event.altKey || this.renderer.isDragging) {
            this.renderer.handleMouseMove(event);
        } else if (this.isSelecting) {
            // Update selection end point
            this.selectionEnd = { x, y };
        }
    }

    handle_mouse_up(event) {
        // If renderer is dragging, handle camera movement
        if (this.renderer.isDragging) {
            this.renderer.handleMouseUp(event);
        } else if (this.isSelecting) {
            // Finish selection
            this.isSelecting = false;
            
            // Calculate selection rectangle in world coordinates
            const startWorldX = this.selectionStart.x / this.renderer.camera.zoom + this.renderer.camera.x;
            const startWorldY = this.selectionStart.y / this.renderer.camera.zoom + this.renderer.camera.y;
            const endWorldX = this.selectionEnd.x / this.renderer.camera.zoom + this.renderer.camera.x;
            const endWorldY = this.selectionEnd.y / this.renderer.camera.zoom + this.renderer.camera.y;
            
            // Calculate min/max for selection rectangle
            const minX = Math.min(startWorldX, endWorldX);
            const maxX = Math.max(startWorldX, endWorldX);
            const minY = Math.min(startWorldY, endWorldY);
            const maxY = Math.max(startWorldY, endWorldY);
            
            // Clear previous selection
            this.selectedTroops = [];
            
            // Select troops within the selection rectangle
            if (this.gameState && this.gameState.troops) {
                for (const troop of this.gameState.troops) {
                    // Only select troops belonging to the player
                    if (troop.player_id === this.playerId) {
                        const [x, y] = troop.position;
                        if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                            this.selectedTroops.push(troop.id);
                        }
                    }
                }
            }
            
            console.log(`Selected ${this.selectedTroops.length} troops`);
        }
    }

    handle_right_click(event) {
        if (!this.playerId || !this.gameState) {
            return null;
        }
        
        const rect = this.renderer.canvas.getBoundingClientRect();
        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;
        
        // Convert canvas coordinates to world coordinates
        const worldX = canvasX / this.renderer.camera.zoom + this.renderer.camera.x;
        const worldY = canvasY / this.renderer.camera.zoom + this.renderer.camera.y;
        
        // If we have selected troops, move them
        if (this.selectedTroops.length > 0) {
            return {
                troop_ids: this.selectedTroops,
                target_position: [worldX, worldY]
            };
        }
        
        return null;
    }

    handle_wheel(deltaY) {
        this.renderer.handleWheel(deltaY);
    }

    toggle_dev_tools() {
        this.renderer.toggleDevTools();
    }

    set_spawning_troops(isSpawning) {
        this.isSpawningTroops = isSpawning;
    }

    render() {
        // First let the renderer render the base game
        this.renderer.render();
        
        // Then render our selection rectangle if selecting
        if (this.isSelecting) {
            const ctx = this.renderer.context;
            ctx.save();
            
            // Draw selection rectangle
            ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
            ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
            ctx.lineWidth = 2;
            
            const width = this.selectionEnd.x - this.selectionStart.x;
            const height = this.selectionEnd.y - this.selectionStart.y;
            
            ctx.fillRect(this.selectionStart.x, this.selectionStart.y, width, height);
            ctx.strokeRect(this.selectionStart.x, this.selectionStart.y, width, height);
            
            ctx.restore();
        }
        
        // Highlight selected troops
        if (this.selectedTroops.length > 0 && this.gameState && this.gameState.troops) {
            const ctx = this.renderer.context;
            ctx.save();
            
            // Apply camera transform
            ctx.translate(-this.renderer.camera.x * this.renderer.camera.zoom, -this.renderer.camera.y * this.renderer.camera.zoom);
            ctx.scale(this.renderer.camera.zoom, this.renderer.camera.zoom);
            
            // Draw selection indicator for each selected troop
            for (const troopId of this.selectedTroops) {
                const troop = this.gameState.troops.find(t => t.id === troopId);
                if (troop) {
                    const [x, y] = troop.position;
                    const size = 12; // Slightly larger than the troop
                    
                    ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(x, y, size/2, 0, 2 * Math.PI);
                    ctx.stroke();
                }
            }
            
            ctx.restore();
        }
    }
}

// Export the Game class
window.Game = Game;
