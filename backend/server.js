const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
const app = express();
const server = http.createServer(app);

const io = socketIO(server, {
    cors: {
        origin: "https://devsouzaedu.github.io",
        methods: ["GET", "POST"],
        credentials: false
    }
});

const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: 'https://devsouzaedu.github.io',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: false
}));

let worldState = { 
    players: {}, 
    targets: [], 
    startTime: Date.now(), 
    currentTargetIndex: 0,
    markers: {},
    lastTargetMoveTime: Date.now()
};
const rooms = {};

function generateTarget() {
    const mapSize = 2600;
    const centralArea = mapSize / 4;
    return { 
        x: Math.random() * centralArea - centralArea / 2, 
        z: Math.random() * centralArea - centralArea / 2 
    };
}

function moveTarget(state) {
    const centralArea = 2600 / 4;
    const moveDistance = 300;
    const currentTarget = state.targets[0];

    const angle = Math.random() * 2 * Math.PI;
    let newX = currentTarget.x + Math.cos(angle) * moveDistance;
    let newZ = currentTarget.z + Math.sin(angle) * moveDistance;

    newX = Math.max(-centralArea / 2, Math.min(centralArea / 2, newX));
    newZ = Math.max(-centralArea / 2, Math.min(centralArea / 2, newZ));

    currentTarget.x = newX;
    currentTarget.z = newZ;

    state.lastTargetMoveTime = Date.now();
    console.log(`Alvo movido para: x=${newX}, z=${newZ}`);
}

function initializeTargets() {
    worldState.targets = [generateTarget()];
    worldState.lastTargetMoveTime = Date.now();
}

initializeTargets();

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

function updateMarkersGravity(state, roomName = null) {
    const fallSpeed = 0.5;
    for (const markerId in state.markers) {
        const marker = state.markers[markerId];
        if (marker.y > 0) {
            marker.y -= fallSpeed;
            if (marker.y <= 0) {
                marker.y = 0;
                io.to(roomName || 'world').emit('markerLanded', { 
                    x: marker.x, 
                    y: marker.y, 
                    z: marker.z, 
                    playerId: marker.playerId, 
                    markerId 
                });
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

function addBots() {
    const botNames = [
        "João Silva", 
        "Maria Oliveira", 
        "Pedro Santos", 
        "Ana Costa", 
        "Lucas Pereira"
    ];
    const botColors = ["#FF4500", "#3498db", "#2ecc71", "#f1c40f", "#FFFFFF"];
    for (let i = 0; i < 5; i++) {
        const botId = `bot_${i}`;
        if (!worldState.players[botId]) {
            worldState.players[botId] = {
                id: botId,
                name: botNames[i],
                color: botColors[i],
                x: Math.random() * 2600 - 1300,
                z: Math.random() * 2600 - 1300,
                y: 100 + Math.random() * 400,
                markers: 5,
                score: 0,
                isBot: true,
                state: 'approachTarget',
                targetAltitude: 100
            };
        }
    }
}

function updateBots() {
    const mapSize = 2600;
    for (const id in worldState.players) {
        if (worldState.players[id].isBot) {
            const bot = worldState.players[id];
            const target = worldState.targets[0];
            const speed = 0.8;

            for (const otherId in worldState.players) {
                if (otherId !== id && worldState.players[otherId].isBot) {
                    const otherBot = worldState.players[otherId];
                    const dx = bot.x - otherBot.x;
                    const dz = bot.z - otherBot.z;
                    const distance = Math.sqrt(dx * dx + dz * dz);
                    if (distance < 100) {
                        const repulsion = 1 / distance;
                        bot.x += dx * repulsion * speed;
                        bot.z += dz * repulsion * speed;
                    }
                }
            }

            switch (bot.state) {
                case 'approachTarget':
                    const dx = target.x - bot.x;
                    const dz = target.z - bot.z;
                    const distance = Math.sqrt(dx * dx + dz * dz);
                    if (distance > 50) {
                        bot.x += (dx / distance) * speed;
                        bot.z += (dz / distance) * speed;
                    } else {
                        bot.state = 'climbNorth';
                        bot.targetAltitude = 500;
                    }
                    break;

                case 'climbNorth':
                    if (bot.y < bot.targetAltitude) {
                        bot.y += 2;
                    } else {
                        bot.state = 'rideSouth';
                        bot.targetAltitude = 200;
                    }
                    break;

                case 'rideSouth':
                    if (bot.y > bot.targetAltitude) {
                        bot.y -= 2;
                    } else {
                        bot.state = 'randomize';
                    }
                    break;

                case 'randomize':
                    bot.x = Math.random() * mapSize - mapSize / 2;
                    bot.z = Math.random() * mapSize - mapSize / 2;
                    bot.state = 'approachTarget';
                    bot.targetAltitude = 100 + Math.random() * 200;
                    break;
            }

            bot.y = Math.max(20, Math.min(500, bot.y));
            bot.x = Math.max(-mapSize / 2, Math.min(mapSize / 2, bot.x));
            bot.z = Math.max(-mapSize / 2, Math.min(mapSize / 2, bot.z));

            // Bots soltam marcas eventualmente (1 por minuto em média)
            if (bot.markers > 0 && Math.random() < 0.0017) { // 0.17% de chance por ciclo (100ms)
                const markerId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const markerData = {
                    playerId: bot.id,
                    x: bot.x + (Math.random() * 20 - 10),
                    y: bot.y - 10,
                    z: bot.z + (Math.random() * 20 - 10),
                    markerId
                };
                bot.markers--;
                worldState.markers[markerId] = markerData;
                io.to('world').emit('markerDropped', { ...markerData, markers: bot.markers, score: bot.score, markerId });
                console.log(`Bot ${bot.name} soltou marcador: ${markerId}, restantes: ${bot.markers}`);
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
            markers: 5,
            score: 0,
            isBot: false
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
            targets: [generateTarget()],
            started: false,
            startTime: null,
            creator: socket.id,
            currentTargetIndex: 0,
            markers: {},
            lastTargetMoveTime: Date.now()
        };
        rooms[roomName].players[socket.id] = {
            id: socket.id,
            name: roomData.name,
            color: null,
            x: 0,
            z: 0,
            y: 100,
            markers: 5,
            score: 0,
            isBot: false
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
                markers: 5,
                score: 0,
                isBot: false
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

    socket.on('dropMarker', ({ x, y, z, mode, roomName, markerId }) => {
        console.log('dropMarker recebido:', { x, y, z, mode, roomName, markerId });
        const player = mode === 'world' ? worldState.players[socket.id] : rooms[roomName]?.players[socket.id];
        if (player && player.markers > 0 && !player.isBot) {
            player.markers--;
            const markerData = { playerId: socket.id, x, y, z, markerId };
            if (mode === 'world') {
                worldState.markers[markerId] = markerData;
                io.to('world').emit('markerDropped', { ...markerData, markers: player.markers, score: player.score, markerId });
            } else if (rooms[roomName]) {
                rooms[roomName].markers[markerId] = markerData;
                io.to(roomName).emit('markerDropped', { ...markerData, markers: player.markers, score: player.score, markerId });
            } else {
                console.error(`Sala ${roomName} não encontrada para mode: ${mode}`);
            }
        } else {
            console.warn(`Jogador ${socket.id} não pode soltar marcador:`, { markers: player?.markers, isBot: player?.isBot });
        }
    });

    socket.on('markerLanded', ({ x, y, z, mode, roomName, markerId }) => {
        console.log('markerLanded recebido:', { x, y, z, mode, roomName, markerId });
        const state = mode === 'world' ? worldState : (rooms[roomName] || null);
        if (!state) {
            console.error(`Estado não encontrado para mode: ${mode}, roomName: ${roomName}. Usando worldState como fallback`);
            if (worldState.markers[markerId]) {
                worldState.markers[markerId].x = x;
                worldState.markers[markerId].y = y;
                worldState.markers[markerId].z = z;
                io.to('world').emit('markerLanded', { x, y, z, playerId: worldState.markers[markerId].playerId, markerId });
                const targets = worldState.targets;
                const dx = x - targets[0].x;
                const dz = z - targets[0].z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                const player = worldState.players[worldState.markers[markerId].playerId];
                if (distance < 40 && player) {
                    const score = calculateScore(distance);
                    player.score += score;
                    io.to('world').emit('targetHitUpdate', { targetIndex: worldState.currentTargetIndex });
                    worldState.currentTargetIndex++;
                }
            }
            return;
        }
        if (state.markers[markerId]) {
            state.markers[markerId].x = x;
            state.markers[markerId].y = y;
            state.markers[markerId].z = z;
            io.to(roomName || 'world').emit('markerLanded', { x, y, z, playerId: state.markers[markerId].playerId, markerId });
            const targets = state.targets;
            const dx = x - targets[0].x;
            const dz = z - targets[0].z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            const player = state.players[state.markers[markerId].playerId];
            if (distance < 40 && player) {
                const score = calculateScore(distance);
                player.score += score;
                io.to(roomName || 'world').emit('targetHitUpdate', { targetIndex: state.currentTargetIndex });
                state.currentTargetIndex++;
            }
        } else {
            console.warn(`Marcador ${markerId} não encontrado em state.markers`);
        }
    });

    socket.on('leaveWorld', () => {
        delete worldState.players[socket.id];
        socket.leave('world');
        console.log(`Jogador ${socket.id} saiu do mundo`);
    });

    socket.on('leaveRoom', ({ roomName }) => {
        if (rooms[roomName] && rooms[roomName].players[socket.id]) {
            delete rooms[roomName].players[socket.id];
            io.to(roomName).emit('playerLeft', socket.id);
            if (rooms[roomName].creator === socket.id && !rooms[roomName].started) {
                io.to(roomName).emit('roomClosed');
                delete rooms[roomName];
            }
            socket.leave(roomName);
            console.log(`Jogador ${socket.id} saiu da sala ${roomName}`);
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

    addBots();
});

setInterval(() => {
    const elapsedWorld = (Date.now() - worldState.startTime) / 1000;
    const timeLeft = Math.max(300 - elapsedWorld, 0);

    if ((Date.now() - worldState.lastTargetMoveTime) / 1000 >= 60 && elapsedWorld < 290) {
        moveTarget(worldState);
    }

    updateMarkersGravity(worldState);
    updateBots();
    io.to('world').emit('gameUpdate', { state: worldState, timeLeft });

    if (elapsedWorld >= 300 && elapsedWorld < 307) {
        io.to('world').emit('showLeaderboard', { players: worldState.players });
    } else if (elapsedWorld >= 307) {
        io.to('world').emit('gameReset', { state: resetWorldState() });
        console.log('Novo jogo iniciado no mundo aberto');
    }

    for (const roomName in rooms) {
        const room = rooms[roomName];
        if (room.started) {
            const elapsed = (Date.now() - room.startTime) / 1000;
            const roomTimeLeft = Math.max(300 - elapsed, 0);

            if ((Date.now() - room.lastTargetMoveTime) / 1000 >= 60 && elapsed < 290) {
                moveTarget(room);
            }

            updateMarkersGravity(room, roomName);
            io.to(roomName).emit('gameUpdate', { state: room, timeLeft: roomTimeLeft });

            if (elapsed >= 300 && elapsed < 307) {
                io.to(roomName).emit('showLeaderboard', { players: room.players });
            } else if (elapsed >= 307) {
                io.to(roomName).emit('gameReset', { state: resetRoomState(roomName) });
                console.log(`Novo jogo iniciado na sala ${roomName}`);
            }
        }
    }
}, 100);

function resetWorldState() {
    worldState = {
        players: Object.keys(worldState.players).reduce((acc, id) => {
            acc[id] = { ...worldState.players[id], x: 0, y: 100, z: 0, markers: 5, score: 0 };
            return acc;
        }, {}),
        targets: [generateTarget()],
        startTime: Date.now(),
        currentTargetIndex: 0,
        markers: {},
        lastTargetMoveTime: Date.now()
    };
    addBots();
    return worldState;
}

function resetRoomState(roomName) {
    const room = rooms[roomName];
    room.players = Object.keys(room.players).reduce((acc, id) => {
        acc[id] = { ...room.players[id], x: 0, y: 100, z: 0, markers: 5, score: 0 };
        return acc;
    }, {});
    room.targets = [generateTarget()];
    room.startTime = Date.now();
    room.currentTargetIndex = 0;
    room.markers = {};
    room.lastTargetMoveTime = Date.now();
    return room;
}

function calculateScore(distance) {
    if (distance < 5) return 1000;
    if (distance < 10) return 500;
    if (distance < 20) return 200;
    if (distance < 40) return 100;
    if (distance < 100) return 50;
    return Math.max(10, Math.floor(200 - distance));
}

server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));