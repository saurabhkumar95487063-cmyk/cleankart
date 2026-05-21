const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/js/main.js');
let content = fs.readFileSync(filePath, 'utf8');

// Regex to find alert(...)
const alertRegex = /alert\((.*?)\);?/g;

content = content.replace(alertRegex, (match, p1) => {
    const message = p1.trim();
    let type = 'info';
    
    // Guess type based on message content
    if (message.includes('success') || message.includes('successfully') || message.includes('verified') || message.includes('sent') || message.includes('Welcome') || message.includes('Thank you')) {
        type = 'success';
    } else if (message.includes('fail') || message.includes('Error') || message.includes('wrong') || message.includes('denied') || message.includes('failed') || message.includes('CRITICAL') || message.includes('required') || message.includes('expired')) {
        type = 'danger';
    } else if (message.includes('login') || message.includes('provide') || message.includes('active')) {
        type = 'warning';
    }
    
    return `notifyUser(${p1}, '${type}')`;
});

fs.writeFileSync(filePath, content, 'utf8');
console.log('Replaced alerts with notifyUser successfully!');
