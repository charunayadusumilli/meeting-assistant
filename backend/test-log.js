const fetch = require('node-fetch');

async function testLog() {
    try {
        console.log('Testing HTTP log endpoint...');
        const res = await fetch('http://127.0.0.1:3000/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ level: 'info', msg: 'SIMULATION_TEST', data: 'hello' })
        });
        console.log('LOG STATUS:', res.status);
    } catch (e) {
        console.error('LOG ERROR:', e.message);
    }
}

testLog();