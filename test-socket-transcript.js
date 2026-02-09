const { io } = require('socket.io-client');

const socket = io('http://localhost:3000', {
    query: { sessionId: 'test-session-' + Date.now() }
});

socket.on('connect', () => {
    console.log('Connected to backend!');
    socket.emit('recognized_item', {
        content: 'Hello, this is a test transcript item',
        timestamp: Date.now()
    });
});

socket.on('transcript', (data) => {
    console.log('Received transcript back:', data);
    process.exit(0);
});

socket.on('connect_error', (err) => {
    console.error('Connection error:', err);
    process.exit(1);
});

setTimeout(() => {
    console.log('Timeout waiting for transcript');
    process.exit(1);
}, 5000);
