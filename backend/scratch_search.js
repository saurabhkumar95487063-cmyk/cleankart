const fs = require('fs');
const path = require('path');

function searchDir(dirPath, pattern) {
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.git') {
                searchDir(fullPath, pattern);
            }
        } else {
            const ext = path.extname(fullPath);
            if (['.js', '.html', '.css', '.ejs'].includes(ext)) {
                const content = fs.readFileSync(fullPath, 'utf8');
                const lines = content.split('\n');
                lines.forEach((line, index) => {
                    if (line.toLowerCase().includes(pattern.toLowerCase())) {
                        console.log(`${fullPath}:${index + 1}: ${line.trim()}`);
                    }
                });
            }
        }
    });
}

console.log("Searching for 'api':");
searchDir('./public', '/api');
console.log("\nSearching for 'API_URL':");
searchDir('./public', 'API_URL');
console.log("\nSearching for 'localhost':");
searchDir('./public', 'localhost');
console.log("\nSearching for 'io(':");
searchDir('./public', 'io(');
console.log("\nSearching for 'socket':");
searchDir('./public', 'socket');
