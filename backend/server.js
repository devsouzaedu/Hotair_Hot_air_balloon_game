const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const mongoose = require('mongoose');
const session = require('express-session');
const cookieParser = require('cookie-parser'); // Adicionado

// Suprimir aviso de strictQuery do Mongoose
mongoose.set('strictQuery', false);

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "https://devsouzaedu.github.io",
        methods: ["GET", "POST"],
        credentials: true
    }
});

const PORT = process.env.PORT || 10000;

// Conexão ao MongoDB Atlas (inalterado)
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('Conectado ao MongoDB'))
  .catch(err => console.error('Erro ao conectar ao MongoDB:', err));

// Schema do Usuário (inalterado)
const userSchema = new mongoose.Schema({
    googleId: { type: String, required: true, unique: true },
    nickname: { type: String, maxlength: 18, unique: true },
    targetsHit: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
    joinDate: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// Middleware
app.use(cookieParser()); // Adicionado antes de session
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: true, // Necessário para SameSite=None em produção (HTTPS)
        sameSite: 'none', // Permite cookies cross-site
        maxAge: 24 * 60 * 60 * 1000, // 24 horas
        httpOnly: true // Segurança
    }
}));
app.use(passport.initialize());
app.use(passport.session());

// Middleware CORS (inalterado)
app.use(cors({
    origin: 'https://devsouzaedu.github.io',
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuração do Google OAuth (inalterado)
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

passport.serializeUser((user, done) => {
    console.log('Serializando usuário:', user.id);
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        console.log('Desserializando usuário:', user ? user.googleId : 'não encontrado');
        done(null, user);
    } catch (err) {
        console.error('Erro ao desserializar usuário:', err);
        done(err, null);
    }
});

// Rotas de Autenticação
app.get('/auth/google', 
    passport.authenticate('google', { 
        scope: ['profile', 'email'],
        prompt: 'select_account'
    })
);

app.get('/auth/google/callback',
    (req, res, next) => {
        console.log('Callback recebido:', req.query);
        next();
    },
    passport.authenticate('google', { 
        failureRedirect: 'https://devsouzaedu.github.io/Hotair_Hot_air_balloon_game/?auth=failed',
        session: true
    }),
    (req, res) => {
        console.log('Autenticação bem-sucedida para usuário:', req.user.googleId);
        req.session.save((err) => { // Garante que a sessão seja salva antes do redirecionamento
            if (err) {
                console.error('Erro ao salvar sessão:', err);
                return res.status(500).send('Erro interno');
            }
            res.redirect('https://devsouzaedu.github.io/Hotair_Hot_air_balloon_game/?auth=success');
        });
    }
);

app.get('/auth/check', (req, res) => {
    console.log('Cookies recebidos:', req.cookies);
    console.log('Sessão:', req.session);
    if (req.isAuthenticated()) {
        console.log('Verificação de autenticação: Usuário autenticado', req.user.googleId);
        res.json({ authenticated: true, user: { googleId: req.user.googleId, nickname: req.user.nickname } });
    } else {
        console.log('Verificação de autenticação: Não autenticado');
        res.json({ authenticated: false });
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

app.get('/profile', async (req, res) => {
    if (!req.isAuthenticated()) {
        console.log('Tentativa de acessar perfil sem autenticação');
        return res.status(401).json({ error: 'Não autenticado' });
    }
    const user = await User.findOne({ googleId: req.user.googleId });
    console.log('Perfil retornado para:', user.googleId);
    res.json({
        googleId: user.googleId,
        nickname: user.nickname,
        targetsHit: user.targetsHit,
        totalPoints: user.totalPoints,
        joinDate: user.joinDate
    });
});

// Lógica do Jogo (mantida como estava)
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

function initializeTargets() {
    worldState.targets = [generateTarget()];
    worldState.lastTargetMoveTime = Date.now();
}

initializeTargets();

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

    socket.on('joinNow', async (playerData) => {
        if (!socket.request.user) {
            socket.emit('authRequired', 'Autenticação com Google necessária');
            return;
        }
        const user = await User.findOne({ googleId: socket.request.user.googleId });
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
        socket.emit('gameState', { mode: 'world', state: worldState });
        console.log(`Jogador ${user.nickname} entrou no mundo global`);
    });

    socket.on('createRoom', async (roomData) => {
        if (!socket.request.user) {
            socket.emit('authRequired', 'Autenticação com Google necessária');
            return;
        }
        const user = await User.findOne({ googleId: socket.request.user.googleId });
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
        if (!socket.request.user) {
            socket.emit('authRequired', 'Autenticação com Google necessária');
            return;
        }
        const user = await User.findOne({ googleId: socket.request.user.googleId });
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
        } else if (mode === 'room' && rooms[roomName] && rooms[roomName].players[socket.id]) {
            rooms[roomName].players[socket.id].x = x;
            rooms[roomName].players[socket.id].y = y;
            rooms[roomName].players[socket.id].z = z;
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
        for (const id in worldState.players) {
            const player = worldState.players[id];
            if (!player.isBot) {
                User.findOne({ googleId: player.googleId }).then(user => {
                    if (user) {
                        user.totalPoints += player.score;
                        user.save();
                    }
                });
            }
        }
        io.to('world').emit('gameReset', { state: resetWorldState() });
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
                for (const id in room.players) {
                    const player = room.players[id];
                    if (!player.isBot) {
                        User.findOne({ googleId: player.googleId }).then(user => {
                            if (user) {
                                user.totalPoints += player.score;
                                user.save();
                            }
                        });
                    }
                }
                io.to(roomName).emit('gameReset', { state: resetRoomState(roomName) });
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