const fs = require('fs');
const path = 'public/js/main.js';
let content = fs.readFileSync(path, 'utf8');

// The last correct part was "fetchOrders();\n        }\n    } catch (err) {\n        notifyUser('Failed to place order.', 'danger');\n    }\n}"
// I will find this and cut everything after it.
const anchor = "fetchOrders();\n        }\n    } catch (err) {\n        notifyUser('Failed to place order.', 'danger');\n    }\n}";
const index = content.indexOf("showSection('myOrders');\n            fetchOrders();");

if (index !== -1) {
    // Find the next two closing braces
    const nextBrace = content.indexOf('}', index);
    const secondBrace = content.indexOf('}', nextBrace + 1);
    const thirdBrace = content.indexOf('}', secondBrace + 1);
    
    if (thirdBrace !== -1) {
        const cleanContent = content.substring(0, thirdBrace + 1);
        fs.writeFileSync(path, cleanContent + '\n');
        console.log('Cleaned up to index', thirdBrace);
    } else {
        console.log('Braces not found after anchor.');
    }
} else {
    console.log('Anchor not found.');
}
