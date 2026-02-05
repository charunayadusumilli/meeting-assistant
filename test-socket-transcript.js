const io = require('socket.io-client');

const SOCKET_URL = 'http://localhost:3000';
const socket = io(SOCKET_URL);

console.log('Connecting to', SOCKET_URL);

socket.on('connect', () => {
    console.log('Connected! Session ID:', socket.id);

    // Simulate sending a transcript (as if from Web Speech API)
    const transcriptData = {
        content: 'This is a test transcript from the verification script.',
        timestamp: Date.now()
    };

    console.log('Sending recognized_item:', transcriptData);
    socket.emit('recognized_item', transcriptData);
});

socket.on('transcript', (data) => {
    console.log('Server relayed transcript:', data);
    if (data.content === 'This is a test transcript from the verification script.') {
        console.log('✅ TEST PASSED: Transcript received and relayed.');
        process.exit(0);
    }
});

socket.on('connect_error', (err) => {
    console.error('Connection failed:', err.message);
    process.exit(1);
});

// Timeout
setTimeout(() => {
    console.error('❌ TIMEOUT: No response from server.');
    process.exit(1);
}, 5000);
