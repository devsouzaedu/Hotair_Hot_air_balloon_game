const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
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
    allowedHeaders: ['Content-Type', 'Authorization'],
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

// Conectar MongoDB
mongoose.connect(process.env.MONGODB_URI);

// Schema do Jogador
const PlayerSchema = new mongoose.Schema({
    googleId: String,
    email: String,
    name: String,
    picture: String,
    totalScore: { type: Number, default: 0 },
    targetsHit: { type: Number, default: 0 },
    startDate: { type: Date, default: Date.now }
});

const Player = mongoose.model('Player', PlayerSchema);

// Configurar Passport
app.use(passport.initialize());

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://hotair-backend.onrender.com/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let player = await Player.findOne({ googleId: profile.id });
        if (!player) {
            player = await Player.create({
                googleId: profile.id,
                email: profile.emails[0].value,
                name: profile.displayName,
                picture: profile.photos[0].value
            });
        }
        return done(null, player);
    } catch (error) {
        return done(error, null);
    }
}));

// Rotas de Auth
app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback', 
    passport.authenticate('google', { session: false }),
    (req, res) => {
        const token = jwt.sign({ id: req.user._id }, process.env.SESSION_SECRET);
        res.redirect(`https://devsouzaedu.github.io/Hotair_Hot_air_balloon_game/?token=${token}`);
    }
);

app.get('/api/profile', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        const decoded = jwt.verify(token, process.env.SESSION_SECRET);
        const player = await Player.findById(decoded.id);
        if (!player) {
            return res.status(404).json({ error: 'Jogador não encontrado' });
        }
        res.json(player);
    } catch (error) {
        res.status(401).json({ error: 'Não autorizado' });
    }
});

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
    for (const markerId in state.markers) {
        const marker = state.markers[markerId];
        if (marker.y > 0) {
            marker.y -= 5.0;
            if (marker.y <= 0) {
                marker.y = 0;
                io.to(roomName || 'world').emit('markerLanded', { 
                    x: marker.x, 
                    y: marker.y, 
                    z: marker.z, 
                    playerId: marker.playerId, 
                    markerId 
                });
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
                targetAltitude: 100,
                waitTime: 0
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
                    if (distance > 60) {
                        bot.x += (dx / distance) * speed;
                        bot.z += (dz / distance) * speed;
                    } else if (distance > 1 && bot.markers > 0) {
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
                        bot.state = 'climbNorth';
                        bot.targetAltitude = 500;
                    }
                    break;

                case 'climbNorth':
                    if (bot.y < bot.targetAltitude) {
                        bot.y += 2;
                    } else {
                        bot.state = 'waitNorth';
                        bot.waitTime = Date.now();
                    }
                    break;

                case 'waitNorth':
                    if (Date.now() - bot.waitTime >= 10000) {
                        bot.state = 'approachTarget';
                        bot.targetAltitude = 100 + Math.random() * 400;
                    }
                    break;
            }

            bot.y = Math.max(100, Math.min(500, bot.y));
            bot.x = Math.max(-mapSize / 2, Math.min(mapSize / 2, bot.x));
            bot.z = Math.max(-mapSize / 2, Math.min(mapSize / 2, bot.z));
        }
    }
}

io.on('connection', (socket) => {
    console.log(`Novo jogador conectado: ${socket.id}`);

    socket.on('joinNow', async (playerData) => {
        let playerId = socket.id; // Default para socket.id
        const token = socket.handshake.auth.token;
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.SESSION_SECRET);
                playerId = decoded.id; // Usa o _id do MongoDB
                console.log(`Token verificado, usando _id do MongoDB: ${playerId}`);
            } catch (error) {
                console.error('Erro ao verificar token no joinNow:', error);
            }
        } else {
            console.warn('Nenhum token fornecido no handshake, usando socket.id como fallback');
        }
        worldState.players[socket.id] = {
            id: playerId, // Usa o _id do MongoDB ou socket.id
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

    socket.on('markerLanded', async ({ x, y, z, mode, roomName, markerId }) => {
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
                console.log(`Distância calculada: ${distance}, alvo em x=${targets[0].x}, z=${targets[0].z}, marcador em x=${x}, z=${z}`);
                
                const player = worldState.players[worldState.markers[markerId].playerId];
                if (!player) {
                    console.error(`Jogador com ID ${worldState.markers[markerId].playerId} não encontrado no worldState.players`);
                    return;
                }
                if (distance < 40) {
                    const score = calculateScore(distance);
                    player.score = (player.score || 0) + score;
                    io.to('world').emit('targetHitUpdate', { targetIndex: worldState.currentTargetIndex });
                    worldState.currentTargetIndex++;
                    console.log(`Alvo acertado por ${player.name}! Distância: ${distance}, Pontos ganhos: ${score}, Novo score: ${player.score}`);
                    
                    if (!player.isBot) {
                        try {
                            const updatedPlayer = await Player.findOneAndUpdate(
                                { _id: player.id },
                                { $inc: { totalScore: score, targetsHit: 1 } },
                                { new: true }
                            );
                            if (updatedPlayer) {
                                console.log(`Pontuação e alvos atualizados no MongoDB para jogador ${player.name}: +${score} pontos, +1 alvo`);
                            } else {
                                console.error(`Jogador com _id ${player.id} não encontrado no MongoDB`);
                            }
                        } catch (error) {
                            console.error('Erro ao atualizar jogador no MongoDB:', error);
                        }
                    }
                } else {
                    console.log(`Marcador fora do alcance do alvo: distância ${distance} > 40`);
                }
            } else {
                console.warn(`Marcador ${markerId} não encontrado em worldState.markers`);
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
            console.log(`Distância calculada: ${distance}, alvo em x=${targets[0].x}, z=${targets[0].z}, marcador em x=${x}, z=${z}`);
            
            const player = state.players[state.markers[markerId].playerId];
            if (!player) {
                console.error(`Jogador com ID ${state.markers[markerId].playerId} não encontrado em state.players`);
                return;
            }
            if (distance < 40) {
                const score = calculateScore(distance);
                player.score = (player.score || 0) + score;
                io.to(roomName || 'world').emit('targetHitUpdate', { targetIndex: state.currentTargetIndex });
                state.currentTargetIndex++;
                console.log(`Alvo acertado por ${player.name}! Distância: ${distance}, Pontos ganhos: ${score}, Novo score: ${player.score}`);
                
                if (!player.isBot) {
                    try {
                        const updatedPlayer = await Player.findOneAndUpdate(
                            { _id: player.id },
                            { $inc: { totalScore: score, targetsHit: 1 } },
                            { new: true }
                        );
                        if (updatedPlayer) {
                            console.log(`Pontuação e alvos atualizados no MongoDB para jogador ${player.name}: +${score} pontos, +1 alvo`);
                        } else {
                            console.error(`Jogador com _id ${player.id} não encontrado no MongoDB`);
                        }
                    } catch (error) {
                        console.error('Erro ao atualizar jogador no MongoDB:', error);
                    }
                }
            } else {
                console.log(`Marcador fora do alcance do alvo: distância ${distance} > 40`);
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

    const secondsElapsed = elapsedWorld % 60;
    if (secondsElapsed < 0.1 && elapsedWorld < 290 && Date.now() - worldState.lastTargetMoveTime >= 59 * 1000) {
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

            const roomSecondsElapsed = elapsed % 60;
            if (roomSecondsElapsed < 0.1 && elapsed < 290 && Date.now() - room.lastTargetMoveTime >= 59 * 1000) {
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
    const mapSize = 2600;
    worldState = {
        players: Object.keys(worldState.players).reduce((acc, id) => {
            acc[id] = { 
                ...worldState.players[id], 
                x: Math.random() * mapSize - mapSize / 2, 
                y: 100 + Math.random() * 400, 
                z: Math.random() * mapSize - mapSize / 2, 
                markers: 5, 
                score: 0 
            };
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
    const mapSize = 2600;
    const room = rooms[roomName];
    room.players = Object.keys(room.players).reduce((acc, id) => {
        acc[id] = { 
            ...room.players[id], 
            x: Math.random() * mapSize - mapSize / 2, 
            y: 100 + Math.random() * 400, 
            z: Math.random() * mapSize - mapSize / 2, 
            markers: 5, 
            score: 0 
        };
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