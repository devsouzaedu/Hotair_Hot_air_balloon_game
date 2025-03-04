const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

mongoose.set('strictQuery', false);

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "https://devsouzaedu.github.io",
        methods: ["GET", "POST"],
        credentials: true,
        allowedHeaders: ['Authorization']
    }
});

const PORT = process.env.PORT || 10000;

mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('Conectado ao MongoDB'))
  .catch(err => console.error('Erro ao conectar ao MongoDB:', err));

const userSchema = new mongoose.Schema({
    googleId: { type: String, required: true, unique: true },
    nickname: { type: String, maxlength: 18, unique: true },
    targetsHit: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
    joinDate: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

app.use(cors({
    origin: 'https://devsouzaedu.github.io',
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type']
}));

// Middleware adicional para reforçar CORS
app.use((req, res, next) => {
    console.log('Requisição recebida:', req.method, req.url);
    res.header('Access-Control-Allow-Origin', 'https://devsouzaedu.github.io');
    res.header('Access-Control-Allow-Methods', 'GET, POST');
    res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());
app.use(passport.initialize());

// Tratamento de erros não capturados para evitar travamento do servidor
process.on('uncaughtException', (err) => {
    console.error('Erro não capturado:', err);
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'https://hotair-backend.onrender.com/auth/google/callback',
    scope: ['profile', 'email']
}, async (accessToken, refreshToken, profile, done) => {
    console.log('Perfil recebido do Google:', profile);
    try {
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
            user = new User({ 
                googleId: profile.id,
                nickname: profile.displayName.substring(0, 18)
            });
            await user.save();
            console.log('Novo usuário criado:', user.googleId);
        }
        done(null, user);
    } catch (err) {
        console.error('Erro ao processar usuário:', err);
        done(err, null);
    }
}));

app.get('/auth/google', 
    passport.authenticate('google', { 
        scope: ['profile', 'email'],
        prompt: 'select_account'
    })
);

app.get('/auth/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: 'https://devsouzaedu.github.io/Hotair_Hot_air_balloon_game/?auth=failed' }),
    (req, res) => {
        const user = req.user;
        console.log('Autenticação bem-sucedida para usuário:', user.googleId);

        const token = jwt.sign(
            { id: user._id, googleId: user.googleId },
            process.env.JWT_SECRET || 'seu-segredo-super-seguro',
            { expiresIn: '24h' }
        );

        res.redirect(`https://devsouzaedu.github.io/Hotair_Hot_air_balloon_game/?auth=success&token=${token}`);
    }
);

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        console.log('Nenhum token fornecido');
        return res.status(401).json({ authenticated: false, message: 'Token não fornecido' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'seu-segredo-super-seguro', (err, decoded) => {
        if (err) {
            console.log('Token inválido:', err);
            return res.status(403).json({ authenticated: false, message: 'Token inválido' });
        }

        req.user = decoded;
        next();
    });
};

app.get('/auth/check', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ authenticated: false, message: 'Usuário não encontrado' });
        }
        console.log('Usuário autenticado via JWT:', user.googleId);
        res.json({ authenticated: true, user: { googleId: user.googleId, nickname: user.nickname } });
    } catch (err) {
        console.error('Erro ao verificar usuário:', err);
        res.status(500).json({ authenticated: false, message: 'Erro interno' });
    }
});

app.get('/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }
        console.log('Perfil retornado para usuário:', user.googleId);
        res.json({
            googleId: user.googleId,
            nickname: user.nickname,
            targetsHit: user.targetsHit,
            totalPoints: user.totalPoints,
            joinDate: user.joinDate
        });
    } catch (err) {
        console.error('Erro ao carregar perfil:', err);
        res.status(500).json({ message: 'Erro interno' });
    }
});

app.post('/auth/set-nickname', async (req, res) => {
    if (!req.isAuthenticated()) {
        console.log('Tentativa de set-nickname sem autenticação');
        return res.status(401).json({ error: 'Não autenticado' });
    }
    const { nickname } = req.body;
    if (!nickname || nickname.length > 18) {
        console.log('Nickname inválido:', nickname);
        return res.status(400).json({ error: 'Nickname inválido (máx. 18 caracteres)' });
    }

    try {
        const existingUser = await User.findOne({ nickname });
        if (existingUser) {
            console.log('Nickname já em uso:', nickname);
            return res.status(400).json({ error: 'Nickname já em uso' });
        }

        const user = await User.findOne({ googleId: req.user.googleId });
        if (user.nickname) {
            console.log('Nickname já definido para usuário:', user.googleId);
            return res.status(400).json({ error: 'Nickname já definido e não pode ser alterado' });
        }

        user.nickname = nickname;
        await user.save();
        console.log('Nickname definido com sucesso para:', user.googleId, 'Nickname:', nickname);
        res.json({ success: true, nickname });
    } catch (err) {
        console.error('Erro ao salvar nickname:', err);
        res.status(500).json({ error: 'Erro ao salvar nickname' });
    }
});

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
}

function initializeWorldState() {
    worldState = {
        players: {},
        targets: [generateTarget()],
        startTime: Date.now(),
        currentTargetIndex: 0,
        markers: {},
        lastTargetMoveTime: Date.now()
    };
    addBots();
}

if (!worldState.players) {
    initializeWorldState();
}

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
                const targets = state.targets;
                const dx = marker.x - targets[0].x;
                const dz = marker.z - targets[0].z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                if (distance < 40) {
                    const player = state.players[marker.playerId];
                    if (player && !player.isBot) {
                        const score = calculateScore(distance);
                        player.score += score;
                        io.to(roomName || 'world').emit('targetHitUpdate', { targetIndex: state.currentTargetIndex });
                        state.currentTargetIndex++;
                        User.findOne({ googleId: player.googleId }).then(user => {
                            if (user) {
                                user.targetsHit += 1;
                                user.totalPoints += score;
                                user.save();
                            }
                        });
                    }
                }
            }
        }
    }
}

function addBots() {
    const botNames = ["Bot1", "Bot2", "Bot3", "Bot4", "Bot5"];
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
            if (!worldState.targets || !worldState.targets[0]) {
                console.error('Nenhum alvo definido para bots, gerando novo alvo');
                worldState.targets = [generateTarget()];
            }
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

    const token = socket.handshake.auth.token;
    if (!token) {
        socket.emit('authRequired', 'Token JWT necessário');
        socket.disconnect();
        return;
    }

    jwt.verify(token, process.env.JWT_SECRET || 'seu-segredo-super-seguro', (err, decoded) => {
        if (err) {
            socket.emit('authRequired', 'Token inválido');
            socket.disconnect();
            return;
        }
        socket.user = decoded;
    });

    socket.on('joinNow', async (playerData) => {
        if (!socket.user) {
            socket.emit('authRequired', 'Autenticação com Google necessária');
            return;
        }
        const user = await User.findOne({ googleId: socket.user.googleId });
        if (!user.nickname) {
            socket.emit('setNicknameRequired', 'Defina seu nickname antes de jogar');
            return;
        }
        worldState.players[socket.id] = {
            id: socket.id,
            googleId: user.googleId,
            name: user.nickname,
            color: playerData.color,
            x: 0,
            z: 0,
            y: 100,
            markers: 5,
            score: 0,
            isBot: false
        };
        socket.join('world');
        console.log('Enviando gameState para jogador:', socket.id, 'Dados:', worldState);
        socket.emit('gameState', { mode: 'world', state: worldState });
        console.log(`Jogador ${user.nickname} entrou no mundo global`);
    });

    socket.on('createRoom', async (roomData) => {
        if (!socket.user) {
            socket.emit('authRequired', 'Autenticação com Google necessária');
            return;
        }
        const user = await User.findOne({ googleId: socket.user.googleId });
        if (!user.nickname) {
            socket.emit('setNicknameRequired', 'Defina seu nickname antes de criar uma sala');
            return;
        }
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
            googleId: user.googleId,
            name: user.nickname,
            color: null,
            x: 0,
            z: 0,
            y: 100,
            markers: 5,
            score: 0,
            isBot: false
        };
        socket.emit('roomCreated', { roomName, creator: socket.id });
        console.log(`Sala ${roomName} criada pelo jogador ${user.nickname}`);
    });

    socket.on('joinRoom', async ({ roomName, playerData }) => {
        if (!socket.user) {
            socket.emit('authRequired', 'Autenticação com Google necessária');
            return;
        }
        const user = await User.findOne({ googleId: socket.user.googleId });
        if (!user.nickname) {
            socket.emit('setNicknameRequired', 'Defina seu nickname antes de entrar em uma sala');
            return;
        }
        if (rooms[roomName]) {
            rooms[roomName].players[socket.id] = {
                id: socket.id,
                googleId: user.googleId,
                name: user.nickname,
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
            console.log(`Jogador ${user.nickname} entrou na sala ${roomName}`);
        } else {
            socket.emit('roomError', 'Sala não encontrada');
        }
    });

    socket.on('setColor', ({ roomName, color }) => {
        if (rooms[roomName] && rooms[roomName].players[socket.id]) {
            rooms[roomName].players[socket.id].color = color;
            io.to(roomName).emit('playerJoined', { players: rooms[roomName].players, creator: rooms[roomName].creator });
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
        }
    });

    socket.on('updatePosition', ({ x, y, z, mode, roomName }) => {
        if (mode === 'world' && worldState.players[socket.id]) {
            worldState.players[socket.id].x = x;
            worldState.players[socket.id].y = y;
            worldState.players[socket.id].z = z;
            console.log(`[Server] UpdatePosition: ${socket.id} x=${x}, y=${y}, z=${z}`);
        } else if (mode === 'room' && rooms[roomName] && rooms[roomName].players[socket.id]) {
            rooms[roomName].players[socket.id].x = x;
            rooms[roomName].players[socket.id].y = y;
            rooms[roomName].players[socket.id].z = z;
            console.log(`[Server] UpdatePosition Room ${roomName}: ${socket.id} x=${x}, y=${y}, z=${z}`);
        }
    });

    socket.on('dropMarker', ({ x, y, z, mode, roomName, markerId }) => {
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
            }
        }
    });

    socket.on('markerLanded', ({ x, y, z, mode, roomName, markerId }) => {
        const state = mode === 'world' ? worldState : (rooms[roomName] || null);
        if (!state) return;
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
            if (distance < 40 && player && !player.isBot) {
                const score = calculateScore(distance);
                player.score += score;
                io.to(roomName || 'world').emit('targetHitUpdate', { targetIndex: state.currentTargetIndex });
                state.currentTargetIndex++;
                User.findOne({ googleId: player.googleId }).then(user => {
                    if (user) {
                        user.targetsHit += 1;
                        user.totalPoints += score;
                        user.save();
                    }
                });
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
    });

    addBots();
});

setInterval(() => {
    const windLayers = [
        { minAlt: 0, maxAlt: 100, direction: { x: 0, z: 0 }, speed: 0 },
        { minAlt: 100, maxAlt: 200, direction: { x: 1, z: 0 }, speed: 0.3 },
        { minAlt: 200, maxAlt: 300, direction: { x: 0, z: 1 }, speed: 0.4 },
        { minAlt: 300, maxAlt: 400, direction: { x: -1, z: 0 }, speed: 0.4 },
        { minAlt: 400, maxAlt: 500, direction: { x: 0, z: -1 }, speed: 0.6 }
    ];

    for (const id in worldState.players) {
        const player = worldState.players[id];
        const currentLayer = windLayers.find(layer => player.y >= layer.minAlt && player.y < layer.maxAlt) || windLayers[0];
        player.x += currentLayer.direction.x * currentLayer.speed;
        player.z += currentLayer.direction.z * currentLayer.speed;
        console.log(`[Wind Debug] Player ${id}: x=${player.x.toFixed(2)}, y=${player.y.toFixed(2)}, z=${player.z.toFixed(2)}, Wind: ${currentLayer.direction.x},${currentLayer.direction.z}`);
    }
    
    updateMarkersGravity(worldState);
    updateBots();
    const elapsedWorld = (Date.now() - worldState.startTime) / 1000;
const timeLeft = Math.max(300 - elapsedWorld, 0);
if (timeLeft <= 0) io.to('world').emit('gameEnd', { players: worldState.players });
io.to('world').emit('gameUpdate', { state: worldState, timeLeft });

    for (const roomName in rooms) {
        const room = rooms[roomName];
        if (room.started) {
            for (const id in room.players) {
                const player = room.players[id];
                const currentLayer = windLayers.find(layer => player.y >= layer.minAlt && player.y < layer.maxAlt) || windLayers[0];
                player.x += currentLayer.direction.x * currentLayer.speed;
                player.z += currentLayer.direction.z * currentLayer.speed;
                console.log(`[Server] Room ${roomName}, Player ${id}: x=${player.x.toFixed(2)}, y=${player.y.toFixed(2)}, z=${player.z.toFixed(2)}, Wind: ${currentLayer.direction.x},${currentLayer.direction.z}`);
            }
            updateMarkersGravity(room, roomName);
            const elapsed = (Date.now() - room.startTime) / 1000;
            const roomTimeLeft = Math.max(300 - elapsed, 0);
            io.to(roomName).emit('gameUpdate', { state: room, timeLeft: roomTimeLeft });
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