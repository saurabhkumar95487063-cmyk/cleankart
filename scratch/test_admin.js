const axios = require('axios');
const API_URL = 'http://localhost:5001/api';

async function runTest() {
    try {
        console.log('Testing login with phone number 9548706353 and password SAUR@2008...');
        const res = await axios.post(`${API_URL}/auth/login`, {
            email: '9548706353',
            password: 'SAUR@2008'
        });
        console.log('Login Response:', res.data);
    } catch (err) {
        console.error('Login Error:', err.response ? err.response.data : err.message);
    }
}

runTest();
