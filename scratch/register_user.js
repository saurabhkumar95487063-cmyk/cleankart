const axios = require('axios');

const register = async () => {
    try {
        const res = await axios.post('http://localhost:5000/api/auth/register', {
            name: 'Test User',
            email: 'testuser@example.com',
            phone: '9999999999',
            password: 'password123'
        });
        console.log('Registration Response:', res.data);
    } catch (err) {
        console.error('Registration Error:', err.response ? err.response.data : err.message);
    }
};

register();
