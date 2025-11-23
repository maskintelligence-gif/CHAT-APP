// --- Server Setup ---
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// ✅ UPDATED: Proper CORS configuration for Netlify + local development
const io = new Server(server, {
    cors: {
        origin: [
            "https://groupchatug.netlify.app",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:8000",
            "*" // Fallback for testing
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Define the port (Render will use process.env.PORT)
const PORT = process.env.PORT || 3000;

// ✅ UPDATED: Add root route to avoid 404 errors
app.get('/', (req, res) => {
    res.json({ 
        message: 'Chat server is running', 
        status: 'OK',
        timestamp: new Date().toISOString()
    });
});

// --- In-Memory State Management (Temporary, replace with Firestore/Redis later) ---
// We'll track users and messages in memory for this demo
const activeUsers = {};
const messageHistory = [];

/**
 * Handles incoming Socket.io connections.
 */
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // --- Core Authentication and Initialization ---
    // The client sends its username upon connecting
    socket.on('register_user', (username) => {
        if (!username) {
            socket.emit('system_error', 'Username cannot be empty.');
            socket.disconnect(true);
            return;
        }

        activeUsers[socket.id] = { id: socket.id, username, status: 'online' };
        socket.username = username;
        
        // 1. Send connection confirmation and history to the new user
        socket.emit('user_registered', { userId: socket.id, messageHistory });
        
        // 2. Notify ALL users about the new connection
        io.emit('user_joined', { 
            id: socket.id, 
            username: username 
        });

        // 3. Update all clients with the current list of active users
        io.emit('active_users', Object.values(activeUsers));
        console.log(`User registered as: ${username}`);
    });


    // --- Core Messaging Logic (Event: send_message) ---
    socket.on('send_message', (payload) => {
        const sender = activeUsers[socket.id];
        if (!sender) {
            // User somehow managed to send a message without registering
            socket.emit('system_error', 'Authentication failed. Please refresh.');
            return;
        }

        const message = {
            messageId: Date.now().toString(), // Simple unique ID
            chatId: 'group-1', // Default group chat ID
            senderId: sender.id,
            senderName: sender.username,
            content: payload.content,
            type: 'text',
            timestamp: new Date().toISOString(),
            status: 'delivered' // Will change to 'read' later
        };

        // 1. Persist the message (in-memory array for demo)
        messageHistory.push(message);

        // 2. Broadcast the message to ALL connected clients (Event: new_message)
        io.emit('new_message', message);
        console.log(`[${sender.username}] sent: ${message.content}`);

        // OPTIONAL: Send a 'typing_stop' event after the message is sent
        io.emit('typing_status', { userId: sender.id, isTyping: false });
    });

    // --- Typing Indicator Logic ---
    socket.on('typing_start', () => {
        const sender = activeUsers[socket.id];
        if (sender) {
             // Broadcast to everyone *except* the sender
            socket.broadcast.emit('typing_status', { userId: sender.id, username: sender.username, isTyping: true });
        }
    });

    socket.on('typing_stop', () => {
        const sender = activeUsers[socket.id];
        if (sender) {
            // Broadcast to everyone *except* the sender
            socket.broadcast.emit('typing_status', { userId: sender.id, username: sender.username, isTyping: false });
        }
    });

    // --- Disconnection ---
    socket.on('disconnect', () => {
        const disconnectedUser = activeUsers[socket.id];
        if (disconnectedUser) {
            console.log(`User disconnected: ${disconnectedUser.username}`);
            
            // Remove from active list
            delete activeUsers[socket.id];
            
            // Notify all remaining users
            io.emit('user_left', disconnectedUser.id);
            io.emit('active_users', Object.values(activeUsers));
        }
    });
});

// Start the server
server.listen(PORT, () => {
    console.log(`🚀 Chat Server running on port ${PORT}`);
    console.log(`To run: 1. Install dependencies (express, socket.io). 2. Run 'node server.js'`);
});
