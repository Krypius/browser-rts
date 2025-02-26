import asyncio
import json
import numpy as np
import socketio
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse

# Initialize FastAPI app
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Socket.IO server
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
socket_app = socketio.ASGIApp(sio, app)

# Game state
class GameState:
    def __init__(self):
        self.players = {}  # Map of player_id to player data
        self.troops = []   # List of all troops in the game
        self.next_player_id = 1
        self.next_troop_id = 1
        self.map_size = (2000, 2000)  # Size of the game map
        self.projectiles = []  # List of all projectiles (arrows) in the game
        self.next_projectile_id = 1
        
    def add_player(self, sid):
        player_id = self.next_player_id
        self.next_player_id += 1
        
        # Assign a random position and color to the player
        position = (np.random.randint(0, self.map_size[0]), 
                    np.random.randint(0, self.map_size[1]))
        
        # Generate a random color (RGB)
        color = (
            np.random.randint(50, 200),
            np.random.randint(50, 200),
            np.random.randint(50, 200)
        )
        
        self.players[sid] = {
            'id': player_id,
            'position': position,
            'color': color,
            'troops': []
        }
        
        return player_id
    
    def remove_player(self, sid):
        if sid in self.players:
            # Remove all troops belonging to this player
            self.troops = [t for t in self.troops if t['player_id'] != self.players[sid]['id']]
            del self.players[sid]
    
    def spawn_troops(self, player_id, position, direction, count=50, unit_type=None):
        """Spawn a group of troops for a player at the given position moving in the given direction"""
        new_troops = []
        player_data = None
        
        # Find the player data
        for sid, data in self.players.items():
            if data['id'] == player_id:
                player_data = data
                break
        
        if player_data is None:
            return []
        
        # Normalize direction vector
        direction_norm = np.linalg.norm(direction)
        if direction_norm > 0:
            direction = (direction[0] / direction_norm, direction[1] / direction_norm)
        
        # If no unit type specified, randomly distribute between the three types
        if unit_type is None:
            unit_types = ['soldier', 'knight', 'archer']
            unit_type = np.random.choice(unit_types)
        
        # Create troops in a small cluster around the position
        for _ in range(count):
            # Add some random offset to position
            offset = (np.random.normal(0, 20), np.random.normal(0, 20))
            troop_pos = (position[0] + offset[0], position[1] + offset[1])
            
            # Add some randomness to direction
            dir_offset = (np.random.normal(0, 0.1), np.random.normal(0, 0.1))
            troop_dir = (direction[0] + dir_offset[0], direction[1] + dir_offset[1])
            
            # Normalize direction again
            dir_norm = np.linalg.norm(troop_dir)
            if dir_norm > 0:
                troop_dir = (troop_dir[0] / dir_norm, troop_dir[1] / dir_norm)
            
            # Base troop properties
            troop = {
                'id': self.next_troop_id,
                'player_id': player_id,
                'position': troop_pos,
                'direction': troop_dir,
                'health': 100,
                'color': player_data['color'],
                'type': unit_type,
                'is_attacking': False,
                'target': None,
                'weight': 1.0,  # Base weight for collision calculations
            }
            
            # Set unit-specific properties
            if unit_type == 'soldier':
                troop.update({
                    'speed': 40.0,  # Standard speed
                    'attack_speed': 30.0,  # Reduced speed while attacking
                    'attack': 15.0,
                    'attack_range': 15.0,  # Melee range
                    'shape': 'circle',
                    'attack_cooldown': 0.0,  # Time until next attack
                    'attack_rate': 1.0,  # Attacks per second
                })
            elif unit_type == 'knight':
                troop.update({
                    'speed': 0.0,  # Current speed
                    'max_speed': 80.0,  # Maximum speed
                    'acceleration': 20.0,  # Units per second^2
                    'attack': 0.0,  # Base attack (will be modified by speed)
                    'shape': 'triangle',
                    'weight': 2.0,  # Knights are heavier
                })
            elif unit_type == 'archer':
                troop.update({
                    'speed': 30.0,  # Slower than soldier
                    'attack': 20.0,
                    'min_range': 50.0,  # Minimum attack range
                    'max_range': 200.0,  # Maximum attack range
                    'shape': 'square',
                    'attack_cooldown': 0.0,
                    'attack_rate': 0.5,  # Slower attack rate than soldier
                })
            
            self.next_troop_id += 1
            new_troops.append(troop)
        
        self.troops.extend(new_troops)
        return new_troops
    
    def update(self, dt):
        """Update the game state for a time step dt (in seconds)"""
        # Update projectiles
        self.update_projectiles(dt)
        
        # Update troops based on their type
        for troop in self.troops:
            if troop['type'] == 'soldier':
                self.update_soldier(troop, dt)
            elif troop['type'] == 'knight':
                self.update_knight(troop, dt)
            elif troop['type'] == 'archer':
                self.update_archer(troop, dt)
            
            # Implement screen wrapping for troops
            troop['position'] = (
                troop['position'][0] % self.map_size[0],
                troop['position'][1] % self.map_size[1]
            )
        
        # Process collisions and combat
        self.process_collisions(dt)
        
        # Remove dead troops
        self.troops = [t for t in self.troops if t['health'] > 0]
        
        # Remove expired projectiles
        self.projectiles = [p for p in self.projectiles if p['time_to_live'] > 0]
    
    def update_soldier(self, soldier, dt):
        """Update a soldier unit"""
        # Soldiers can attack while standing still or move at reduced speed while attacking
        if soldier['is_attacking'] and soldier['target'] is not None:
            # Move at reduced speed while attacking
            soldier['speed'] = soldier['attack_speed']
            
            # Decrement attack cooldown
            if soldier['attack_cooldown'] > 0:
                soldier['attack_cooldown'] -= dt
        else:
            # Reset to normal speed when not attacking
            soldier['speed'] = 40.0
            soldier['is_attacking'] = False
            soldier['target'] = None
        
        # Update position based on direction and speed
        soldier['position'] = (
            soldier['position'][0] + soldier['direction'][0] * soldier['speed'] * dt,
            soldier['position'][1] + soldier['direction'][1] * soldier['speed'] * dt
        )
    
    def update_knight(self, knight, dt):
        """Update a knight unit"""
        # Knights accelerate over time
        if knight['speed'] < knight['max_speed']:
            knight['speed'] += knight['acceleration'] * dt
            if knight['speed'] > knight['max_speed']:
                knight['speed'] = knight['max_speed']
        
        # Update position based on direction and speed
        knight['position'] = (
            knight['position'][0] + knight['direction'][0] * knight['speed'] * dt,
            knight['position'][1] + knight['direction'][1] * knight['speed'] * dt
        )
        
        # Knight's attack is proportional to its speed
        knight['attack'] = knight['speed'] / 10.0
    
    def update_archer(self, archer, dt):
        """Update an archer unit"""
        # Update position based on direction and speed
        archer['position'] = (
            archer['position'][0] + archer['direction'][0] * archer['speed'] * dt,
            archer['position'][1] + archer['direction'][1] * archer['speed'] * dt
        )
        
        # Decrement attack cooldown
        if archer['attack_cooldown'] > 0:
            archer['attack_cooldown'] -= dt
    
    def update_projectiles(self, dt):
        """Update all projectiles"""
        for projectile in self.projectiles:
            # Update position
            projectile['position'] = (
                projectile['position'][0] + projectile['direction'][0] * projectile['speed'] * dt,
                projectile['position'][1] + projectile['direction'][1] * projectile['speed'] * dt
            )
            
            # Implement screen wrapping for projectiles
            projectile['position'] = (
                projectile['position'][0] % self.map_size[0],
                projectile['position'][1] % self.map_size[1]
            )
            
            # Decrease time to live
            projectile['time_to_live'] -= dt
    
    def process_collisions(self, dt):
        """Process collisions between troops and projectiles"""
        # Check for collisions between troops of different players
        for i, troop1 in enumerate(self.troops):
            # Track total weight of colliding troops for knights
            total_colliding_weight = 0.0
            
            for j, troop2 in enumerate(self.troops):
                # Skip if same troop or troops belong to the same player
                if i == j or troop1['player_id'] == troop2['player_id']:
                    continue
                
                # Calculate wrapped distance between troops
                dx = troop1['position'][0] - troop2['position'][0]
                dy = troop1['position'][1] - troop2['position'][1]
                
                # Adjust for screen wrapping
                if abs(dx) > self.map_size[0] / 2:
                    dx = self.map_size[0] - abs(dx)
                    if troop1['position'][0] < troop2['position'][0]:
                        dx = -dx
                
                if abs(dy) > self.map_size[1] / 2:
                    dy = self.map_size[1] - abs(dy)
                    if troop1['position'][1] < troop2['position'][1]:
                        dy = -dy
                
                distance = np.sqrt(dx*dx + dy*dy)
                
                # Collision detection
                if distance < 15:  # Collision radius
                    # Handle soldier attacks
                    if troop1['type'] == 'soldier':
                        if distance <= troop1['attack_range']:
                            troop1['is_attacking'] = True
                            troop1['target'] = troop2['id']
                            
                            # Attack if cooldown is ready
                            if troop1['attack_cooldown'] <= 0:
                                troop2['health'] -= troop1['attack']
                                troop1['attack_cooldown'] = 1.0 / troop1['attack_rate']
                    
                    # Handle knight attacks - damage based on speed
                    if troop1['type'] == 'knight':
                        # Knights do damage proportional to their speed
                        troop2['health'] -= troop1['attack'] * dt
                        
                        # Add to total colliding weight
                        total_colliding_weight += troop2['weight']
                    
                    # Handle archer melee defense (archers are weak in close combat)
                    if troop1['type'] == 'archer':
                        # Archers take more damage in melee
                        troop1['health'] -= troop2['attack'] * 1.5 * dt
                    
                    # Troops bounce off each other
                    if distance > 0:
                        # Normalized direction vector from troop2 to troop1
                        nx = dx / distance
                        ny = dy / distance
                        
                        # Update directions to bounce away
                        troop1['direction'] = (nx * 0.5 + troop1['direction'][0] * 0.5, 
                                              ny * 0.5 + troop1['direction'][1] * 0.5)
                        troop2['direction'] = (-nx * 0.5 + troop2['direction'][0] * 0.5, 
                                              -ny * 0.5 + troop2['direction'][1] * 0.5)
                        
                        # Normalize directions
                        dir1_norm = np.linalg.norm(troop1['direction'])
                        if dir1_norm > 0:
                            troop1['direction'] = (troop1['direction'][0] / dir1_norm, 
                                                 troop1['direction'][1] / dir1_norm)
                        
                        dir2_norm = np.linalg.norm(troop2['direction'])
                        if dir2_norm > 0:
                            troop2['direction'] = (troop2['direction'][0] / dir2_norm, 
                                                 troop2['direction'][1] / dir2_norm)
                
                # Handle archer ranged attacks
                elif troop1['type'] == 'archer':
                    if (distance >= troop1['min_range'] and 
                        distance <= troop1['max_range'] and 
                        troop1['attack_cooldown'] <= 0):
                        
                        # Fire an arrow
                        self.fire_arrow(troop1, troop2)
                        troop1['attack_cooldown'] = 1.0 / troop1['attack_rate']
            
            # Apply collision weight penalty to knights
            if troop1['type'] == 'knight' and total_colliding_weight > 0:
                # Reduce knight's speed based on total colliding weight
                speed_reduction = total_colliding_weight * 10.0 * dt
                troop1['speed'] = max(0, troop1['speed'] - speed_reduction)
        
        # Check for projectile hits
        for projectile in list(self.projectiles):
            if projectile['time_to_live'] <= 0:
                continue
                
            for troop in self.troops:
                # Skip if projectile belongs to the same player
                if projectile['player_id'] == troop['player_id']:
                    continue
                
                # Calculate wrapped distance
                dx = projectile['position'][0] - troop['position'][0]
                dy = projectile['position'][1] - troop['position'][1]
                
                # Adjust for screen wrapping
                if abs(dx) > self.map_size[0] / 2:
                    dx = self.map_size[0] - abs(dx)
                    if projectile['position'][0] < troop['position'][0]:
                        dx = -dx
                
                if abs(dy) > self.map_size[1] / 2:
                    dy = self.map_size[1] - abs(dy)
                    if projectile['position'][1] < troop['position'][1]:
                        dy = -dy
                
                distance = np.sqrt(dx*dx + dy*dy)
                
                # Check for hit
                if distance < 10:  # Projectile hit radius
                    # Apply damage
                    troop['health'] -= projectile['damage']
                    
                    # Apply knockback
                    if distance > 0:
                        # Normalized direction vector from projectile to troop
                        nx = dx / distance
                        ny = dy / distance
                        
                        # Apply knockback force
                        knockback = 20.0  # Knockback strength
                        troop['direction'] = (
                            -nx * knockback + troop['direction'][0],
                            -ny * knockback + troop['direction'][1]
                        )
                        
                        # Normalize direction
                        dir_norm = np.linalg.norm(troop['direction'])
                        if dir_norm > 0:
                            troop['direction'] = (
                                troop['direction'][0] / dir_norm,
                                troop['direction'][1] / dir_norm
                            )
                    
                    # Remove the projectile
                    projectile['time_to_live'] = 0
                    break
    
    def fire_arrow(self, archer, target):
        """Fire an arrow from an archer to a target"""
        # Calculate wrapped direction to target
        dx = target['position'][0] - archer['position'][0]
        dy = target['position'][1] - archer['position'][1]
        
        # Adjust for screen wrapping
        if abs(dx) > self.map_size[0] / 2:
            dx = self.map_size[0] - abs(dx)
            if archer['position'][0] < target['position'][0]:
                dx = -dx
        
        if abs(dy) > self.map_size[1] / 2:
            dy = self.map_size[1] - abs(dy)
            if archer['position'][1] < target['position'][1]:
                dy = -dy
        
        distance = np.sqrt(dx*dx + dy*dy)
        
        if distance > 0:
            direction = (dx / distance, dy / distance)
            
            # Create arrow projectile
            projectile = {
                'id': self.next_projectile_id,
                'player_id': archer['player_id'],
                'position': archer['position'],
                'direction': direction,
                'speed': 200.0,  # Arrows are fast
                'damage': archer['attack'],
                'time_to_live': 2.0,  # Seconds before arrow disappears
                'color': archer['color']
            }
            
            self.next_projectile_id += 1
            self.projectiles.append(projectile)
    
    def to_dict(self):
        """Convert the game state to a dictionary for sending to clients"""
        return {
            'players': list(self.players.values()),
            'troops': self.troops,
            'projectiles': self.projectiles,
            'map_size': self.map_size
        }

# Create game state
game_state = GameState()

# Game loop
async def game_loop():
    last_update = asyncio.get_event_loop().time()
    while True:
        now = asyncio.get_event_loop().time()
        dt = now - last_update
        last_update = now
        
        # Update game state
        game_state.update(dt)
        
        # Send game state to all clients
        await sio.emit('game_state', game_state.to_dict())
        
        # Dev tools data
        dev_data = {
            'fps': 1/dt if dt > 0 else 0,
            'player_count': len(game_state.players),
            'troop_count': len(game_state.troops),
            'troops_by_player': {player_data['id']: len([t for t in game_state.troops if t['player_id'] == player_data['id']]) 
                                for _, player_data in game_state.players.items()}
        }
        await sio.emit('dev_data', dev_data)
        
        # Sleep to maintain target frame rate (30 FPS)
        target_frame_time = 1/30
        elapsed = asyncio.get_event_loop().time() - now
        if elapsed < target_frame_time:
            await asyncio.sleep(target_frame_time - elapsed)

# Socket.IO event handlers
@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")
    player_id = game_state.add_player(sid)
    await sio.emit('player_id', {'player_id': player_id}, room=sid)

@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")
    game_state.remove_player(sid)

@sio.event
async def spawn_troops(sid, data):
    player_id = game_state.players[sid]['id']
    position = data.get('position')
    direction = data.get('direction')
    count = data.get('count', 50)
    unit_type = data.get('unit_type')  # Can be 'soldier', 'knight', 'archer', or None for random
    
    if position and direction:
        game_state.spawn_troops(player_id, position, direction, count, unit_type)

@sio.event
async def move_troops(sid, data):
    player_id = game_state.players[sid]['id']
    troop_ids = data.get('troop_ids', [])
    target_position = data.get('target_position')
    
    if troop_ids and target_position:
        # Update direction for each troop to move toward the target position
        for troop in game_state.troops:
            if troop['id'] in troop_ids and troop['player_id'] == player_id:
                # Calculate wrapped direction from troop to target
                dx = target_position[0] - troop['position'][0]
                dy = target_position[1] - troop['position'][1]
                
                # Adjust for screen wrapping
                if abs(dx) > game_state.map_size[0] / 2:
                    dx = game_state.map_size[0] - abs(dx)
                    if troop['position'][0] < target_position[0]:
                        dx = -dx
                
                if abs(dy) > game_state.map_size[1] / 2:
                    dy = game_state.map_size[1] - abs(dy)
                    if troop['position'][1] < target_position[1]:
                        dy = -dy
                
                # Normalize direction
                distance = (dx**2 + dy**2)**0.5
                if distance > 0:
                    direction = (dx / distance, dy / distance)
                    troop['direction'] = direction

# Serve static files
import os
client_dist_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../client/dist"))
app.mount("/", StaticFiles(directory=client_dist_path, html=True), name="static")

# Start game loop when the server starts
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(game_loop())

# Run the server
if __name__ == "__main__":
    uvicorn.run("main:socket_app", host="0.0.0.0", port=8000, reload=True)
