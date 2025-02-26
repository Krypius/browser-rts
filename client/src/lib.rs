use wasm_bindgen::prelude::*;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement, MouseEvent};
use js_sys::{Array, Object, Reflect};
use serde::{Serialize, Deserialize};
use std::f64::consts::PI;

// Game state types
#[derive(Serialize, Deserialize, Clone)]
pub struct Player {
    id: u32,
    position: (f64, f64),
    color: (u8, u8, u8),
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Troop {
    id: u32,
    player_id: u32,
    position: (f64, f64),
    direction: (f64, f64),
    speed: f64,
    health: f64,
    attack: f64,
    color: (u8, u8, u8),
    shape: String,
    #[serde(rename = "type")]
    unit_type: String,
    is_attacking: bool,
    weight: f64,
    // Optional fields for different unit types
    #[serde(default)]
    attack_speed: Option<f64>,
    #[serde(default)]
    attack_range: Option<f64>,
    #[serde(default)]
    attack_cooldown: Option<f64>,
    #[serde(default)]
    attack_rate: Option<f64>,
    #[serde(default)]
    max_speed: Option<f64>,
    #[serde(default)]
    acceleration: Option<f64>,
    #[serde(default)]
    min_range: Option<f64>,
    #[serde(default)]
    max_range: Option<f64>,
    #[serde(default)]
    target: Option<u32>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Projectile {
    id: u32,
    player_id: u32,
    position: (f64, f64),
    direction: (f64, f64),
    speed: f64,
    damage: f64,
    time_to_live: f64,
    color: (u8, u8, u8),
}

#[derive(Serialize, Deserialize)]
pub struct GameState {
    players: Vec<Player>,
    troops: Vec<Troop>,
    projectiles: Vec<Projectile>,
    map_size: (f64, f64),
}

#[derive(Serialize, Deserialize)]
pub struct DevData {
    fps: f64,
    player_count: usize,
    troop_count: usize,
    troops_by_player: Object,
}

// Renderer
#[wasm_bindgen]
pub struct Renderer {
    canvas: HtmlCanvasElement,
    context: CanvasRenderingContext2d,
    camera_x: f64,
    camera_y: f64,
    zoom: f64,
    is_dragging: bool,
    last_mouse_x: f64,
    last_mouse_y: f64,
    player_id: Option<u32>,
    game_state: Option<GameState>,
    dev_data: Option<DevData>,
    show_dev_tools: bool,
    selection_start: Option<(f64, f64)>,
    selection_end: Option<(f64, f64)>,
    selected_troops: Vec<u32>,
}

#[wasm_bindgen]
impl Renderer {
    #[wasm_bindgen(constructor)]
    pub fn new(canvas_id: &str) -> Result<Renderer, JsValue> {
        let document = web_sys::window().unwrap().document().unwrap();
        let canvas = document.get_element_by_id(canvas_id)
            .unwrap()
            .dyn_into::<HtmlCanvasElement>()?;
        
        let context = canvas
            .get_context("2d")?
            .unwrap()
            .dyn_into::<CanvasRenderingContext2d>()?;
        
        Ok(Renderer {
            canvas,
            context,
            camera_x: 0.0,
            camera_y: 0.0,
            zoom: 1.0,
            is_dragging: false,
            last_mouse_x: 0.0,
            last_mouse_y: 0.0,
            player_id: None,
            game_state: None,
            dev_data: None,
            show_dev_tools: true,
            selection_start: None,
            selection_end: None,
            selected_troops: Vec::new(),
        })
    }
    
    #[wasm_bindgen]
    pub fn set_player_id(&mut self, player_id: u32) {
        self.player_id = Some(player_id);
    }
    
    #[wasm_bindgen]
    pub fn update_game_state(&mut self, state_js: JsValue) -> Result<(), JsValue> {
        let game_state: GameState = serde_wasm_bindgen::from_value(state_js)?;
        self.game_state = Some(game_state);
        Ok(())
    }
    
    #[wasm_bindgen]
    pub fn update_dev_data(&mut self, data_js: JsValue) -> Result<(), JsValue> {
        let dev_data: DevData = serde_wasm_bindgen::from_value(data_js)?;
        self.dev_data = Some(dev_data);
        Ok(())
    }
    
    #[wasm_bindgen]
    pub fn toggle_dev_tools(&mut self) {
        self.show_dev_tools = !self.show_dev_tools;
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_down(&mut self, event: MouseEvent) {
        let rect = self.canvas.get_bounding_client_rect();
        let x = event.client_x() as f64 - rect.left();
        let y = event.client_y() as f64 - rect.top();
        
        // Convert to world coordinates
        let world_x = x / self.zoom + self.camera_x;
        let world_y = y / self.zoom + self.camera_y;
        
        // Left mouse button (0) for selection or camera drag
        if event.button() == 0 {
            // Start selection by default, use Alt key for camera movement
            if event.alt_key() {
                // Alt + left click for camera movement
                self.is_dragging = true;
                self.last_mouse_x = x;
                self.last_mouse_y = y;
            } else {
                // Regular left click for selection
                self.selection_start = Some((world_x, world_y));
                self.selection_end = Some((world_x, world_y));
                self.is_dragging = false;
                
                // If clicking outside of any selected troops, clear selection
                if !self.is_clicking_selected_troop(world_x, world_y) {
                    self.selected_troops.clear();
                }
            }
        }
    }
    
    fn is_clicking_selected_troop(&self, world_x: f64, world_y: f64) -> bool {
        if let Some(game_state) = &self.game_state {
            for troop in &game_state.troops {
                if self.selected_troops.contains(&troop.id) {
                    let dx = world_x - troop.position.0;
                    let dy = world_y - troop.position.1;
                    let distance = (dx * dx + dy * dy).sqrt();
                    
                    if distance < 10.0 {  // Selection radius
                        return true;
                    }
                }
            }
        }
        false
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_move(&mut self, event: MouseEvent) {
        let rect = self.canvas.get_bounding_client_rect();
        let x = event.client_x() as f64 - rect.left();
        let y = event.client_y() as f64 - rect.top();
        
        // Convert to world coordinates
        let world_x = x / self.zoom + self.camera_x;
        let world_y = y / self.zoom + self.camera_y;
        
        if self.is_dragging {
            let dx = x - self.last_mouse_x;
            let dy = y - self.last_mouse_y;
            
            // Move camera in the opposite direction of mouse movement
            self.camera_x -= dx / self.zoom;
            self.camera_y -= dy / self.zoom;
            
            self.last_mouse_x = x;
            self.last_mouse_y = y;
        } else if self.selection_start.is_some() {
            // Update selection end point
            self.selection_end = Some((world_x, world_y));
        }
    }
    
    #[wasm_bindgen]
    pub fn handle_mouse_up(&mut self, event: MouseEvent) {
        // If we were making a selection, finalize it
        if self.selection_start.is_some() && self.selection_end.is_some() {
            let start = self.selection_start.unwrap();
            let end = self.selection_end.unwrap();
            
            // Calculate selection box
            let min_x = start.0.min(end.0);
            let max_x = start.0.max(end.0);
            let min_y = start.1.min(end.1);
            let max_y = start.1.max(end.1);
            
            // Only select if the box is large enough (to avoid accidental selections)
            let selection_size = (max_x - min_x) * (max_y - min_y);
            if selection_size > 25.0 {  // Minimum selection area
                self.select_troops_in_box(min_x, min_y, max_x, max_y);
            }
            
            self.selection_start = None;
            self.selection_end = None;
        }
        
        self.is_dragging = false;
    }
    
    fn select_troops_in_box(&mut self, min_x: f64, min_y: f64, max_x: f64, max_y: f64) {
        if let Some(game_state) = &self.game_state {
            if let Some(player_id) = self.player_id {
                // Clear previous selection
                self.selected_troops.clear();
                
                // Select all player's troops in the box
                for troop in &game_state.troops {
                    if troop.player_id == player_id {
                        let (x, y) = troop.position;
                        if x >= min_x && x <= max_x && y >= min_y && y <= max_y {
                            self.selected_troops.push(troop.id);
                        }
                    }
                }
            }
        }
    }
    
    #[wasm_bindgen]
    pub fn handle_wheel(&mut self, delta_y: f64) {
        // Zoom in/out with mouse wheel
        let zoom_factor = if delta_y > 0.0 { 0.9 } else { 1.1 };
        self.zoom *= zoom_factor;
        
        // Clamp zoom level
        self.zoom = self.zoom.max(0.2).min(5.0);
    }
    
    #[wasm_bindgen]
    pub fn handle_click(&mut self, event: MouseEvent) -> Option<JsValue> {
        if self.is_dragging || self.player_id.is_none() || self.game_state.is_none() {
            return None;
        }
        
        let rect = self.canvas.get_bounding_client_rect();
        let canvas_x = event.client_x() as f64 - rect.left();
        let canvas_y = event.client_y() as f64 - rect.top();
        
        // Convert canvas coordinates to world coordinates
        let world_x = canvas_x / self.zoom + self.camera_x;
        let world_y = canvas_y / self.zoom + self.camera_y;
        
        // Find the player's position
        let game_state = self.game_state.as_ref().unwrap();
        let player_id = self.player_id.unwrap();
        
        let player_position = game_state.players.iter()
            .find(|p| p.id == player_id)
            .map(|p| p.position);
        
        if let Some(position) = player_position {
            // Calculate direction from player to click point
            let dx = world_x - position.0;
            let dy = world_y - position.1;
            
            // Create spawn data (unit type will be added by JavaScript)
            let spawn_data = Object::new();
            Reflect::set(&spawn_data, &"position".into(), &array_from_tuple(position))?;
            Reflect::set(&spawn_data, &"direction".into(), &array_from_tuple((dx, dy)))?;
            Reflect::set(&spawn_data, &"count".into(), &JsValue::from_f64(15.0))?;
            
            return Some(spawn_data.into());
        }
        
        None
    }
    
    #[wasm_bindgen]
    pub fn handle_right_click(&mut self, event: MouseEvent) -> Option<JsValue> {
        if self.player_id.is_none() || self.game_state.is_none() || self.selected_troops.is_empty() {
            return None;
        }
        
        let rect = self.canvas.get_bounding_client_rect();
        let canvas_x = event.client_x() as f64 - rect.left();
        let canvas_y = event.client_y() as f64 - rect.top();
        
        // Convert canvas coordinates to world coordinates
        let world_x = canvas_x / self.zoom + self.camera_x;
        let world_y = canvas_y / self.zoom + self.camera_y;
        
        // Create move data
        let move_data = Object::new();
        Reflect::set(&move_data, &"target_position".into(), &array_from_tuple((world_x, world_y)))?;
        
        // Add selected troop IDs
        let selected_array = Array::new();
        for &id in &self.selected_troops {
            selected_array.push(&JsValue::from_f64(id as f64));
        }
        Reflect::set(&move_data, &"troop_ids".into(), &selected_array)?;
        
        return Some(move_data.into());
    }
    
    #[wasm_bindgen]
    pub fn get_selected_troops(&self) -> JsValue {
        let selected_array = Array::new();
        for &id in &self.selected_troops {
            selected_array.push(&JsValue::from_f64(id as f64));
        }
        selected_array.into()
    }
    
    #[wasm_bindgen]
    pub fn render(&self) {
        self.clear_canvas();
        
        if let Some(game_state) = &self.game_state {
            self.render_grid(game_state);
            self.render_troops(game_state);
            self.render_projectiles(game_state);
            self.render_selection_box();
            
            if self.show_dev_tools {
                self.render_dev_tools();
            }
        }
    }
    
    fn render_selection_box(&self) {
        if let (Some(start), Some(end)) = (self.selection_start, self.selection_end) {
            self.context.save();
            
            // Apply camera transform
            self.context.translate(-self.camera_x * self.zoom, -self.camera_y * self.zoom).unwrap();
            self.context.scale(self.zoom, self.zoom).unwrap();
            
            // Draw selection box
            let min_x = start.0.min(end.0);
            let max_x = start.0.max(end.0);
            let min_y = start.1.min(end.1);
            let max_y = start.1.max(end.1);
            
            self.context.set_stroke_style(&JsValue::from_str("rgba(0, 255, 0, 0.8)"));
            self.context.set_line_width(1.0 / self.zoom);
            self.context.set_fill_style(&JsValue::from_str("rgba(0, 255, 0, 0.2)"));
            
            self.context.begin_path();
            self.context.rect(min_x, min_y, max_x - min_x, max_y - min_y);
            self.context.fill();
            self.context.stroke();
            
            self.context.restore();
        }
    }
    
    fn clear_canvas(&self) {
        let width = self.canvas.width() as f64;
        let height = self.canvas.height() as f64;
        
        self.context.save();
        self.context.set_fill_style(&JsValue::from_str("#222222"));
        self.context.fill_rect(0.0, 0.0, width, height);
        self.context.restore();
    }
    
    fn render_grid(&self, game_state: &GameState) {
        let (map_width, map_height) = game_state.map_size;
        let grid_size = 100.0;
        
        self.context.save();
        
        // Apply camera transform
        self.context.translate(-self.camera_x * self.zoom, -self.camera_y * self.zoom).unwrap();
        self.context.scale(self.zoom, self.zoom).unwrap();
        
        // Draw grid
        self.context.set_stroke_style(&JsValue::from_str("#444444"));
        self.context.set_line_width(1.0);
        
        // Vertical lines
        for x in (0..=map_width as usize).step_by(grid_size as usize) {
            self.context.begin_path();
            self.context.move_to(x as f64, 0.0);
            self.context.line_to(x as f64, map_height);
            self.context.stroke();
        }
        
        // Horizontal lines
        for y in (0..=map_height as usize).step_by(grid_size as usize) {
            self.context.begin_path();
            self.context.move_to(0.0, y as f64);
            self.context.line_to(map_width, y as f64);
            self.context.stroke();
        }
        
        // Draw map border
        self.context.set_stroke_style(&JsValue::from_str("#888888"));
        self.context.set_line_width(2.0);
        self.context.stroke_rect(0.0, 0.0, map_width, map_height);
        
        self.context.restore();
    }
    
    fn render_troops(&self, game_state: &GameState) {
        self.context.save();
        
        // Apply camera transform
        self.context.translate(-self.camera_x * self.zoom, -self.camera_y * self.zoom).unwrap();
        self.context.scale(self.zoom, self.zoom).unwrap();
        
        // Draw troops
        for troop in &game_state.troops {
            let (x, y) = troop.position;
            let (r, g, b) = troop.color;
            let color = format!("rgb({}, {}, {})", r, g, b);
            let size = 10.0;
            
            self.context.save();
            self.context.translate(x, y).unwrap();
            
            // Draw selection indicator for selected troops
            if self.selected_troops.contains(&troop.id) {
                self.context.set_stroke_style(&JsValue::from_str("#00ff00"));
                self.context.set_line_width(2.0);
                
                // Draw selection circle
                self.context.begin_path();
                self.context.arc(0.0, 0.0, size * 0.8, 0.0, 2.0 * PI).unwrap();
                self.context.stroke();
            }
            
            // Draw health bar
            let health_width = size * 1.5;
            let health_height = 2.0;
            let health_y = -size - 5.0;
            
            self.context.set_fill_style(&JsValue::from_str("#ff0000"));
            self.context.fill_rect(-health_width/2.0, health_y, health_width, health_height);
            
            self.context.set_fill_style(&JsValue::from_str("#00ff00"));
            let health_percent = troop.health / 100.0;
            self.context.fill_rect(-health_width/2.0, health_y, health_width * health_percent, health_height);
            
            // Draw troop shape
            self.context.set_fill_style(&JsValue::from_str(&color));
            
            match troop.shape.as_str() {
                "circle" => {
                    self.context.begin_path();
                    self.context.arc(0.0, 0.0, size/2.0, 0.0, 2.0 * PI).unwrap();
                    self.context.fill();
                },
                "square" => {
                    self.context.fill_rect(-size/2.0, -size/2.0, size, size);
                },
                "triangle" => {
                    self.context.begin_path();
                    self.context.move_to(0.0, -size/2.0);
                    self.context.line_to(size/2.0, size/2.0);
                    self.context.line_to(-size/2.0, size/2.0);
                    self.context.close_path();
                    self.context.fill();
                },
                _ => {
                    self.context.fill_rect(-size/2.0, -size/2.0, size, size);
                }
            }
            
            // Draw direction indicator
            let (dx, dy) = troop.direction;
            self.context.set_stroke_style(&JsValue::from_str("#ffffff"));
            self.context.set_line_width(1.0);
            self.context.begin_path();
            self.context.move_to(0.0, 0.0);
            self.context.line_to(dx * size, dy * size);
            self.context.stroke();
            
            self.context.restore();
        }
        
        self.context.restore();
    }
    
    fn render_projectiles(&self, game_state: &GameState) {
        self.context.save();
        
        // Apply camera transform
        self.context.translate(-self.camera_x * self.zoom, -self.camera_y * self.zoom).unwrap();
        self.context.scale(self.zoom, self.zoom).unwrap();
        
        // Draw projectiles
        for projectile in &game_state.projectiles {
            let (x, y) = projectile.position;
            let (r, g, b) = projectile.color;
            let color = format!("rgb({}, {}, {})", r, g, b);
            
            self.context.save();
            self.context.translate(x, y).unwrap();
            
            // Draw arrow
            self.context.set_fill_style(&JsValue::from_str(&color));
            
            // Rotate context to match arrow direction
            let (dx, dy) = projectile.direction;
            let angle = dy.atan2(dx);
            self.context.rotate(angle).unwrap();
            
            // Draw arrow body
            let arrow_length = 8.0;
            let arrow_width = 2.0;
            
            // Arrow shaft
            self.context.fill_rect(-arrow_length/2.0, -arrow_width/2.0, arrow_length, arrow_width);
            
            // Arrow head
            self.context.begin_path();
            self.context.move_to(arrow_length/2.0, 0.0);
            self.context.line_to(arrow_length/2.0 - 4.0, -4.0);
            self.context.line_to(arrow_length/2.0 - 4.0, 4.0);
            self.context.close_path();
            self.context.fill();
            
            self.context.restore();
        }
        
        self.context.restore();
    }
    
    fn render_dev_tools(&self) {
        if let Some(dev_data) = &self.dev_data {
            self.context.save();
            
            let width = self.canvas.width() as f64;
            let height = self.canvas.height() as f64;
            
            // Draw dev tools panel
            self.context.set_fill_style(&JsValue::from_str("rgba(0, 0, 0, 0.7)"));
            self.context.fill_rect(10.0, 10.0, 200.0, 150.0);
            
            self.context.set_font("14px Arial");
            self.context.set_fill_style(&JsValue::from_str("#ffffff"));
            
            // FPS
            self.context.fill_text(&format!("FPS: {:.1}", dev_data.fps), 20.0, 30.0).unwrap();
            
            // Player count
            self.context.fill_text(&format!("Players: {}", dev_data.player_count), 20.0, 50.0).unwrap();
            
            // Troop count
            self.context.fill_text(&format!("Troops: {}", dev_data.troop_count), 20.0, 70.0).unwrap();
            
            // Camera position
            self.context.fill_text(&format!("Camera: ({:.0}, {:.0})", self.camera_x, self.camera_y), 20.0, 90.0).unwrap();
            
            // Zoom level
            self.context.fill_text(&format!("Zoom: {:.1}x", self.zoom), 20.0, 110.0).unwrap();
            
            // Player ID
            if let Some(player_id) = self.player_id {
                self.context.fill_text(&format!("Player ID: {}", player_id), 20.0, 130.0).unwrap();
            }
            
            self.context.restore();
        }
    }
}

// Helper function to convert a tuple to a JS array
fn array_from_tuple(tuple: (f64, f64)) -> Array {
    let array = Array::new();
    array.push(&JsValue::from_f64(tuple.0));
    array.push(&JsValue::from_f64(tuple.1));
    array
}
