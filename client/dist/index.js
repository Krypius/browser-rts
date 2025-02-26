// Game client for Isometric RTS
(function() {
    // DOM elements
    const canvas = document.getElementById('game-canvas');
    const connectionStatus = document.getElementById('connection-status');
    const loadingScreen = document.getElementById('loading-screen');
    const loadingBar = document.getElementById('loading-bar');
    const toggleDevToolsBtn = document.getElementById('toggle-dev-tools');
    const spawnTroopsBtn = document.getElementById('spawn-troops');
    const unitSoldierBtn = document.getElementById('unit-soldier');
    const unitKnightBtn = document.getElementById('unit-knight');
    const unitArcherBtn = document.getElementById('unit-archer');
    
    // Game state
    let game = null;
    let socket = null;
    let playerId = null;
    let isSpawningTroops = false;
    let animationFrameId = null;
    let selectedUnitType = 'soldier'; // Default unit type
    let isRightMouseDown = false;
    let lastRightClickPosition = null;
    let networkLatency = 0;
    let lastPingTime = 0;
    
    // Initialize the game
    function init() {
        // Add a direct event listener to the spawn-troops button
        document.getElementById('spawn-troops').addEventListener('click', function() {
            console.log('DIRECT CLICK ON SPAWN TROOPS BUTTON');
        });
        
        updateLoadingProgress(10, 'Connecting to server...');
        
        // Connect to the server
        socket = io();
        
        // Socket.IO event handlers
        socket.on('connect', () => {
            connectionStatus.textContent = 'Connected';
            connectionStatus.classList.remove('status-disconnected');
            connectionStatus.classList.add('status-connected');
            updateLoadingProgress(30, 'Connected to server');
            
            // Start ping for network latency measurement
            startPing();
        });
        
        socket.on('disconnect', () => {
            connectionStatus.textContent = 'Disconnected';
            connectionStatus.classList.remove('status-connected');
            connectionStatus.classList.add('status-disconnected');
        });
        
        socket.on('player_id', (data) => {
            playerId = data.player_id;
            console.log(`Assigned player ID: ${playerId}`);
            
            if (game) {
                game.set_player_id(playerId);
            }
        });
        
        socket.on('game_state', (state) => {
            if (game) {
                game.update_game_state(state);
            }
        });
        
        socket.on('dev_data', (data) => {
            if (game) {
                // Add network latency to dev data
                data.network_latency = networkLatency;
                game.update_dev_data(data);
            }
        });
        
        socket.on('pong', () => {
            // Calculate network latency
            networkLatency = Date.now() - lastPingTime;
        });
        
        // Initialize the game
        updateLoadingProgress(70, 'Initializing game...');
        
        // Create game instance
        game = new Game('game-canvas');
        
        // Set player ID if already received
        if (playerId !== null) {
            game.set_player_id(playerId);
        }
            
        // Set up canvas
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        
        // Set up event listeners
        setupEventListeners();
        
        // Start game loop
        startGameLoop();
        
        updateLoadingProgress(100, 'Game loaded!');
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 500);
    }
    
    // Start ping for network latency measurement
    function startPing() {
        setInterval(() => {
            lastPingTime = Date.now();
            socket.emit('ping');
        }, 2000);
    }
    
    // Update loading progress
    function updateLoadingProgress(percent, message) {
        loadingBar.style.width = `${percent}%`;
        const loadingText = document.querySelector('.loading-text');
        if (loadingText) {
            loadingText.textContent = message || 'Loading...';
        }
    }
    
    // Resize canvas to fill container
    function resizeCanvas() {
        const container = canvas.parentElement;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }
    
    // Set up event listeners
    function setupEventListeners() {
        // Unit selection buttons
        unitSoldierBtn.addEventListener('click', () => {
            selectUnitType('soldier');
        });
        
        unitKnightBtn.addEventListener('click', () => {
            selectUnitType('knight');
        });
        
        unitArcherBtn.addEventListener('click', () => {
            selectUnitType('archer');
        });
        
        // Mouse events for camera control and unit selection
        canvas.addEventListener('mousedown', (event) => {
            console.log("mousedown event, button:", event.button, "isSpawningTroops:", isSpawningTroops);
            if (event.button === 0) { // Left mouse button
                if (isSpawningTroops) {
                    console.log("Spawning troops mode active");
                    const spawnData = game.handle_click(event);
                    console.log("Spawn data from game:", spawnData);
                    if (spawnData) {
                        // Add the selected unit type to the spawn data
                        spawnData.unit_type = selectedUnitType;
                        console.log("Emitting spawn_troops event with data:", spawnData);
                        socket.emit('spawn_troops', spawnData);
                    }
                } else {
                    // Handle selection or camera movement
                    game.handle_mouse_down(event);
                }
            } else if (event.button === 2) { // Right mouse button
                isRightMouseDown = true;
                handleRightClick(event);
            }
        });
        
        canvas.addEventListener('mousemove', (event) => {
            // Handle mouse movement
            game.handle_mouse_move(event);
            
            // Update unit movement target if right mouse button is held down
            if (isRightMouseDown) {
                handleRightClick(event);
            }
        });
        
        canvas.addEventListener('mouseup', (event) => {
            if (event.button === 0) { // Left mouse button
                game.handle_mouse_up(event);
            } else if (event.button === 2) { // Right mouse button
                isRightMouseDown = false;
                lastRightClickPosition = null;
            }
        });
        
        // Prevent context menu on right-click
        canvas.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });
        
        // Handle right-click for unit movement
        function handleRightClick(event) {
            const moveData = game.handle_right_click(event);
            if (moveData) {
                // Only send if the position has changed significantly
                const targetPos = moveData.target_position;
                if (!lastRightClickPosition || 
                    Math.abs(targetPos[0] - lastRightClickPosition[0]) > 5 || 
                    Math.abs(targetPos[1] - lastRightClickPosition[1]) > 5) {
                    
                    lastRightClickPosition = targetPos;
                    socket.emit('move_troops', moveData);
                }
            }
        }
        
        // Mouse wheel for zooming
        canvas.addEventListener('wheel', (event) => {
            event.preventDefault();
            game.handle_wheel(event.deltaY);
        });
        
        // Toggle dev tools button
        toggleDevToolsBtn.addEventListener('click', () => {
            game.toggle_dev_tools();
        });
        
        // Spawn troops button - completely new implementation
        document.getElementById('spawn-troops').onclick = function() {
            console.log("NEW HANDLER: Spawn troops button clicked");
            isSpawningTroops = !isSpawningTroops;
            console.log("isSpawningTroops toggled to:", isSpawningTroops);
            game.set_spawning_troops(isSpawningTroops);
            
            this.textContent = isSpawningTroops 
                ? 'Cancel Spawning' 
                : 'Spawn Troops (Click on map)';
            
            if (isSpawningTroops) {
                this.style.backgroundColor = '#f44336';
            } else {
                this.style.backgroundColor = '';
            }
            
            return false; // Prevent default
        };
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            if (event.key === 'd') {
                // Toggle dev tools
                game.toggle_dev_tools();
            } else if (event.key === 's') {
                // Toggle spawn troops mode
                isSpawningTroops = !isSpawningTroops;
                game.set_spawning_troops(isSpawningTroops);
                
                spawnTroopsBtn.textContent = isSpawningTroops 
                    ? 'Cancel Spawning' 
                    : 'Spawn Troops (Click on map)';
                
                if (isSpawningTroops) {
                    spawnTroopsBtn.style.backgroundColor = '#f44336';
                } else {
                    spawnTroopsBtn.style.backgroundColor = '';
                }
            } else if (event.key === '1') {
                // Select soldier
                selectUnitType('soldier');
            } else if (event.key === '2') {
                // Select knight
                selectUnitType('knight');
            } else if (event.key === '3') {
                // Select archer
                selectUnitType('archer');
            } else if (event.key === 'Escape') {
                // Clear selection
                // This will be handled by the input handler in the future
            }
        });
    }
    
    // Select unit type
    function selectUnitType(type) {
        selectedUnitType = type;
        
        // Update UI
        unitSoldierBtn.classList.remove('selected');
        unitKnightBtn.classList.remove('selected');
        unitArcherBtn.classList.remove('selected');
        
        if (type === 'soldier') {
            unitSoldierBtn.classList.add('selected');
        } else if (type === 'knight') {
            unitKnightBtn.classList.add('selected');
        } else if (type === 'archer') {
            unitArcherBtn.classList.add('selected');
        }
        
        console.log(`Selected unit type: ${type}`);
    }
    
    // Game loop
    function startGameLoop() {
        const gameLoop = () => {
            // Render the game
            if (game) {
                game.render();
            }
            
            // Request next frame
            animationFrameId = requestAnimationFrame(gameLoop);
        };
        
        // Start the loop
        gameLoop();
    }
    
    // Initialize the game
    init();
})();
