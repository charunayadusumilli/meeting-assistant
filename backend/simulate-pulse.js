const { io } = require('socket.io-client');

const BACKEND_URL = 'http://127.0.0.1:3000';
const socket = io(BACKEND_URL, {
    query: { sessionId: 'stress-test-' + Date.now() }
});

socket.on('connect', () => {
    console.log('CONNECTED');

    const lines = [
        "Welcome to the meeting.",
        "We are discussing the new architecture.",
        "The benefits of using React include its component-based structure.",
        "We also need to consider performance optimization.",
        "One technique is using React.memo for expensive renders.",
        "Let's ask the assistant for more details."
    ];

    let i = 0;
    const interval = setInterval(() => {
        if (i >= lines.length) {
            clearInterval(interval);
            console.log('Sending final question...');
            socket.emit('question', { content: 'Summarize the React performance tips discussed so far.' });
            return;
        }
        console.log('Sending transcript:', lines[i]);
        socket.emit('recognized_item', { content: lines[i], timestamp: Date.now() });
        i++;
    }, 1000);
});

socket.on('transcript', (data) => console.log('ECHO:', data.content));
socket.on('answer', (data) => console.log('AI:', data.content || data.text));
socket.on('connect_error', (err) => console.error('ERROR:', err.message));

setTimeout(() => {
    console.log('Done.');
    socket.disconnect();
    process.exit(0);
}, 20000);