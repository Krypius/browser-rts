const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Ensure dist directory exists
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

console.log('Building WebAssembly module...');

try {
    // Build the Rust project with wasm-pack
    execSync('wasm-pack build --target web --out-dir dist/pkg', {
        cwd: __dirname,
        stdio: 'inherit'
    });
    
    console.log('WebAssembly module built successfully.');
    
    // Copy the generated files to the dist directory
    const pkgDir = path.join(__dirname, 'dist', 'pkg');
    const wasmFile = path.join(pkgDir, 'isometric_rts_bg.wasm');
    const jsFile = path.join(pkgDir, 'isometric_rts.js');
    
    // Copy to dist directory
    fs.copyFileSync(wasmFile, path.join(distDir, 'isometric_rts_bg.wasm'));
    fs.copyFileSync(jsFile, path.join(distDir, 'isometric_rts.js'));
    
    console.log('Files copied to dist directory.');
    
    console.log('Build completed successfully!');
} catch (error) {
    console.error('Build failed:', error.message);
    process.exit(1);
}
