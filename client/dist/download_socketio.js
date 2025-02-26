const https = require('https');
const fs = require('fs');
const path = require('path');

const socketIoUrl = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
const outputPath = path.join(__dirname, 'socket.io.js');

console.log(`Downloading Socket.IO client from ${socketIoUrl}...`);

https.get(socketIoUrl, (response) => {
    if (response.statusCode !== 200) {
        console.error(`Failed to download: ${response.statusCode} ${response.statusMessage}`);
        return;
    }

    const fileStream = fs.createWriteStream(outputPath);
    response.pipe(fileStream);

    fileStream.on('finish', () => {
        fileStream.close();
        console.log(`Socket.IO client downloaded to ${outputPath}`);
    });
}).on('error', (err) => {
    console.error(`Error downloading Socket.IO client: ${err.message}`);
});
