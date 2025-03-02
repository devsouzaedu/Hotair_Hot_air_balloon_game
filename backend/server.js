const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
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

let worldState = { 
    players: {}, 
    targets: [], 
    startTime: Date.now(), 
    currentTargetIndex: 0,
    markers: {},
    lastTargetMoveTime: Date.now() // Novo: rastreia o último movimento do alvo
};
const rooms = {};

function generateTarget() {
    const mapSize = 2600;
    const centralArea = mapSize / 4; // Área central (650m de largura por 650m de altura)
    return { 
        x: Math.random() * centralArea - centralArea / 2, 
        z: Math.random() * centralArea - centralArea / 2 
    };
}

function moveTarget(state) {
    const centralArea = 2600 / 4; // Área central do mapa
    const moveDistance = 300; // Distância de movimentação (300m)
    const currentTarget = state.targets[0];

    // Calcula uma direção aleatória
    const angle = Math.random() * 2 * Math.PI;
    let newX = currentTarget.x + Math.cos(angle) * moveDistance;
    let newZ = currentTarget.z + Math.sin(angle) * moveDistance;

    // Garante que o alvo permaneça dentro da área central
    newX = Math.max(-centralArea / 2, Math.min(centralArea / 2, newX));
    newZ = Math.max(-centralArea / 2, Math.min(centralArea / 2, newZ));

    currentTarget.x = newX;
    currentTarget.z = newZ;

    state.lastTargetMoveTime = Date.now(); // Atualiza o tempo do último movimento
    console.log(`Alvo movido para: x=${newX}, z=${newZ}`);
}

function initializeTargets() {
    worldState.targets = [generateTarget()];
    worldState.lastTargetMoveTime = Date.now(); // Inicializa o tempo do último movimento
}

initializeTargets();

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

function addBots() {
    const botNames = ["Aloisio Silvestro", "Santes Raim", "Lional Brutus", "Volodomyr Taveira III", "Eduardes Euro"];
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
                markers: 0,
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
            lastTargetMoveTime: Date.now() // Novo: rastreia o último movimento do alvo em salas
        };
        rooms[roomName].players[socket.id] = {
            id: socket.id,
            name: roomData.name,
            color: null,
            x: 0,
            z: 0,
            y: 100,
            markers: 3,
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
                markers: 3,
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

    socket.on('dropMarker', ({ x, y, z, mode, roomName }) => {
        const player = mode === 'world' ? worldState.players[socket.id] : rooms[roomName]?.players[socket.id];
        if (player && player.markers > 0 && !player.isBot) {
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
                if (!worldState.players[id].isBot && worldState.players[id].markers > 0) {
                    allMarkersUsed = false;
                    break;
                }
            }
            if (allMarkersUsed) {
                io.to('world').emit('gameEnd', { players: worldState.players });
            }
        } else if (rooms[roomName]) {
            for (const id in rooms[roomName].players) {
                if (!rooms[roomName].players[id].isBot && rooms[roomName].players[id].markers > 0) {
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

    addBots();
});

setInterval(() => {
    const elapsedWorld = (Date.now() - worldState.startTime) / 1000;
    const timeLeft = Math.max(300 - elapsedWorld, 0);

    // Movimentação do alvo no mundo aberto a cada 60 segundos
    if ((Date.now() - worldState.lastTargetMoveTime) / 1000 >= 60 && elapsedWorld < 290) {
        moveTarget(worldState);
        io.to('world').emit('gameUpdate', { state: worldState, timeLeft });
    }

    updateMarkersGravity(worldState);
    updateBots();

    io.to('world').emit('gameUpdate', { state: worldState, timeLeft });

    if (elapsedWorld > 300) {
        const winner = calculateWinner(worldState.players);
        io.to('world').emit('gameOver', winner);
        setTimeout(() => {
            worldState = { 
                players: {}, 
                targets: [], 
                startTime: Date.now(), 
                currentTargetIndex: 0, 
                markers: {},
                lastTargetMoveTime: Date.now()
            };
            initializeTargets();
            addBots();
            console.log('Novo jogo iniciado no mundo aberto');
        }, 10000); // Espera 10 segundos antes de reiniciar
    }

    for (const roomName in rooms) {
        const room = rooms[roomName];
        if (room.started) {
            const elapsed = (Date.now() - room.startTime) / 1000;
            const roomTimeLeft = Math.max(300 - elapsed, 0);

            // Movimentação do alvo nas salas a cada 60 segundos
            if ((Date.now() - room.lastTargetMoveTime) / 1000 >= 60 && elapsed < 290) {
                moveTarget(room);
                io.to(roomName).emit('gameUpdate', { state: room, timeLeft: roomTimeLeft });
            }

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