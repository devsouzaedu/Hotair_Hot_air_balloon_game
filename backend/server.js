
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "https://devsouzaedu.github.io", // Origem exata do GitHub Pages
        methods: ["GET", "POST"],
        credentials: false // Geralmente não necessário para GitHub Pages
    }
});
const PORT = process.env.PORT || 3000;

let worldState = { 
    players: {}, 
    targets: [], 
    startTime: Date.now(), 
    currentTargetIndex: 0,
    markers: {}
};
const rooms = {};

function generateTargets() {
    return [
        { x: Math.random() * 500 - 250, z: Math.random() * 500 - 250 },
        { x: Math.random() * 500 - 250, z: Math.random() * 500 - 250 },
        { x: Math.random() * 500 - 250, z: Math.random() * 500 - 250 }
    ];
}

worldState.targets = generateTargets();

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

function updateMarkersGravity(state, roomName = null) {
    const fallSpeed = 7;
    for (const markerId in state.markers) {
        const marker = state.markers[markerId];
        if (marker.y > 0) {
            marker.y -= fallSpeed;
            if (marker.y <= 0) {
                marker.y = 0;
                const targets = state.targets;
                const dx = marker.x - targets[0].x;
                const dz = marker.z - targets[0].z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                if (distance < 40 && marker.playerId === marker.playerId) {
                    io.to(roomName || 'world').emit('targetHitUpdate', { targetIndex: state.currentTargetIndex });
                    state.currentTargetIndex++;
                }
            }
        }
    }
}

io.on('connection', (socket) => {
    console.log(`Novo jogador conectado: ${socket.id}`);

    socket.on('joinNow', (playerData) => {
        worldState.players[socket.id] = {
            id: socket.id,
            name: playerData.name,
            color: playerData.color,
            x: 0,
            z: 0,
            y: 100,
            markers: 3,
            score: 0
        };
        socket.join('world');
        socket.emit('gameState', { mode: 'world', state: worldState });
        console.log(`Jogador ${playerData.name} entrou no mundo global`);
    });

    socket.on('createRoom', (roomData) => {
        const roomName = roomData.name;
        if (rooms[roomName]) {
            socket.emit('roomError', 'Uma sala com esse nome já existe');
            return;
        }
        rooms[roomName] = {
            name: roomName,
            players: {},
            targets: generateTargets(),
            started: false,
            startTime: null,
            creator: socket.id,
            currentTargetIndex: 0,
            markers: {}
        };
        rooms[roomName].players[socket.id] = {
            id: socket.id,
            name: roomData.name,
            color: null,
            x: 0,
            z: 0,
            y: 100,
            markers: 3,
            score: 0
        };
        socket.emit('roomCreated', { roomName, creator: socket.id });
        console.log(`Sala ${roomName} criada pelo jogador ${socket.id}`);
    });

    socket.on('joinRoom', ({ roomName, playerData }) => {
        if (rooms[roomName]) {
            rooms[roomName].players[socket.id] = {
                id: socket.id,
                name: playerData.name,
                color: playerData.color,
                x: 0,
                z: 0,
                y: 100,
                markers: 3,
                score: 0
            };
            socket.join(roomName);
            io.to(roomName).emit('playerJoined', { players: rooms[roomName].players, creator: rooms[roomName].creator });
            console.log(`Jogador ${playerData.name} entrou na sala ${roomName}`);
        } else {
            socket.emit('roomError', 'Sala não encontrada');
            console.log(`Tentativa de entrar em sala inexistente: ${roomName}`);
        }
    });

    socket.on('setColor', ({ roomName, color }) => {
        if (rooms[roomName] && rooms[roomName].players[socket.id]) {
            rooms[roomName].players[socket.id].color = color;
            io.to(roomName).emit('playerJoined', { players: rooms[roomName].players, creator: rooms[roomName].creator });
            console.log(`Jogador ${socket.id} escolheu a cor ${color} na sala ${roomName}`);
        }
    });

    socket.on('startRoom', ({ roomName }) => {
        if (rooms[roomName] && rooms[roomName].creator === socket.id && !rooms[roomName].started) {
            rooms[roomName].started = true;
            rooms[roomName].startTime = Date.now();
            let countdown = 3;
            const interval = setInterval(() => {
                io.to(roomName).emit('countdown', countdown);
                countdown--;
                if (countdown < 0) {
                    clearInterval(interval);
                    io.to(roomName).emit('startGame', { state: rooms[roomName] });
                }
            }, 1000);
            console.log(`Sala ${roomName} iniciando contagem regressiva`);
        }
    });

    socket.on('updatePosition', ({ x, y, z, mode, roomName }) => {
        if (mode === 'world' && worldState.players[socket.id]) {
            worldState.players[socket.id].x = x;
            worldState.players[socket.id].y = y;
            worldState.players[socket.id].z = z;
        } else if (mode === 'room' && rooms[roomName] && rooms[roomName].players[socket.id]) {
            rooms[roomName].players[socket.id].x = x;
            rooms[roomName].players[socket.id].y = y;
            rooms[roomName].players[socket.id].z = z;
        }
    });

    socket.on('dropMarker', ({ x, y, z, mode, roomName }) => {
        const player = mode === 'world' ? worldState.players[socket.id] : rooms[roomName]?.players[socket.id];
        if (player && player.markers > 0) {
            player.markers--;
            const markerId = `${socket.id}-${Date.now()}`;
            const targets = mode === 'world' ? worldState.targets : rooms[roomName].targets;
            let score = 0;
            targets.forEach(target => {
                const dx = x - target.x;
                const dz = z - target.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                score += calculateScore(distance);
            });
            player.score += score;

            const markerData = { playerId: socket.id, x, y, z, markerId };
            if (mode === 'world') {
                worldState.markers[markerId] = markerData;
                io.to('world').emit('markerDropped', { ...markerData, markers: player.markers, score: player.score });
            } else {
                rooms[roomName].markers[markerId] = markerData;
                io.to(roomName).emit('markerDropped', { ...markerData, markers: player.markers, score: player.score });
            }
        }
    });

    socket.on('checkGameEnd', ({ mode, roomName }) => {
        let allMarkersUsed = true;
        if (mode === 'world') {
            for (const id in worldState.players) {
                if (worldState.players[id].markers > 0) {
                    allMarkersUsed = false;
                    break;
                }
            }
            if (allMarkersUsed) {
                io.to('world').emit('gameEnd', { players: worldState.players });
            }
        } else if (rooms[roomName]) {
            for (const id in rooms[roomName].players) {
                if (rooms[roomName].players[id].markers > 0) {
                    allMarkersUsed = false;
                    break;
                }
            }
            if (allMarkersUsed) {
                io.to(roomName).emit('gameEnd', { players: rooms[roomName].players });
            }
        }
    });

    socket.on('disconnect', () => {
        delete worldState.players[socket.id];
        for (const roomName in rooms) {
            if (rooms[roomName].players[socket.id]) {
                delete rooms[roomName].players[socket.id];
                io.to(roomName).emit('playerLeft', socket.id);
                if (rooms[roomName].creator === socket.id && !rooms[roomName].started) {
                    io.to(roomName).emit('roomClosed');
                    delete rooms[roomName];
                }
            }
        }
        console.log(`Jogador ${socket.id} desconectado`);
    });
});

setInterval(() => {
    const elapsedWorld = (Date.now() - worldState.startTime) / 1000;
    const timeLeft = Math.max(300 - elapsedWorld, 0);
    updateMarkersGravity(worldState);
    io.to('world').emit('gameUpdate', { state: worldState, timeLeft });

    if (elapsedWorld > 300) {
        const winner = calculateWinner(worldState.players);
        io.to('world').emit('gameOver', winner);
        worldState = { players: {}, targets: generateTargets(), startTime: Date.now(), currentTargetIndex: 0, markers: {} };
        console.log('Novo jogo iniciado no mundo aberto');
    }

    for (const roomName in rooms) {
        const room = rooms[roomName];
        if (room.started) {
            const elapsed = (Date.now() - room.startTime) / 1000;
            const roomTimeLeft = Math.max(300 - elapsed, 0);
            updateMarkersGravity(room, roomName);
            io.to(roomName).emit('gameUpdate', { state: room, timeLeft: roomTimeLeft });
            if (elapsed > 300) {
                io.to(roomName).emit('gameOver', calculateWinner(room.players));
                delete rooms[roomName];
            }
        }
    }
}, 100);

function calculateScore(distance) {
    if (distance < 5) return 1000;
    if (distance < 10) return 500;
    if (distance < 20) return 200;
    if (distance < 40) return 100;
    if (distance < 100) return 50;
    return Math.max(10, Math.floor(200 - distance));
}

function calculateWinner(players) {
    let winner = null;
    let maxScore = -1;
    for (const id in players) {
        if (players[id].score > maxScore) {
            maxScore = players[id].score;
            winner = players[id];
        }
    }
    return winner;
}

server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));