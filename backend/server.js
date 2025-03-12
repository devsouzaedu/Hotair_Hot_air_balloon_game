// server.js
require('dotenv').config();
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

// Determina a origem do frontend com base no ambiente
const frontendOrigin = process.env.NODE_ENV === 'production' 
    ? 'https://devsouzaedu.github.io' 
    : 'http://localhost:8080';

const io = socketIO(server, {
    cors: {
        origin: frontendOrigin,
        methods: ['GET', 'POST'],
        credentials: false
    }
});

const PORT = process.env.PORT || 10000;

// Definição das camadas de vento com velocidades ajustadas
const windLayers = [
    { minAlt: 0, maxAlt: 100, direction: { x: 0, z: 0 }, speed: 0, name: "Nenhum" },
    { minAlt: 100, maxAlt: 200, direction: { x: 1, z: 0 }, speed: 0.7, name: "Leste" },
    { minAlt: 200, maxAlt: 300, direction: { x: 0, z: 1 }, speed: 0.8, name: "Sul" },
    { minAlt: 300, maxAlt: 400, direction: { x: -1, z: 0 }, speed: 0.8, name: "Oeste" },
    { minAlt: 400, maxAlt: 500, direction: { x: 0, z: -1 }, speed: 0.9, name: "Norte" }
];

app.use(cors({
    origin: frontendOrigin,
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
    lastTargetMoveTime: Date.now(),
    windLayers: windLayers, // Adicionando as camadas de vento ao estado do mundo
    timeLeft: 300 // Adicionando a variável timeLeft ao worldState
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


console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID);
console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET);
console.log('MONGODB_URI:', process.env.MONGODB_URI);
console.log('SESSION_SECRET:', process.env.SESSION_SECRET);
console.log('PORT:', process.env.PORT);
console.log('FRONTEND_URL:', process.env.FRONTEND_URL);
console.log('NODE_ENV:', process.env.NODE_ENV);

// Configurar Passport
app.use(passport.initialize());

// URL de callback baseada no ambiente
const callbackURL = process.env.NODE_ENV === 'production'
    ? 'https://hotair-backend.onrender.com/auth/google/callback'
    : 'http://localhost:3000/auth/google/callback';

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: callbackURL
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
        const frontendUrl = process.env.FRONTEND_URL; // Removido o fallback
        console.log('FRONTEND_URL do .env:', process.env.FRONTEND_URL);
        console.log('Redirecionando para:', `${frontendUrl}?token=${token}`);
        if (!frontendUrl) {
            console.error('Erro: FRONTEND_URL não está definido no .env');
            return res.status(500).send('Erro de configuração do servidor: FRONTEND_URL não definido');
        }
        res.redirect(`${frontendUrl}?token=${token}`);
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
        id: `target-${Date.now()}`,
        x: Math.random() * centralArea - centralArea / 2, 
        z: Math.random() * centralArea - centralArea / 2 
    };
}

function moveTarget(state) {
    const mapSize = 2600;
    const newTarget = generateTarget();
    
    // Atualizar o alvo
    if (state.targets.length > 0) {
        state.targets[0] = newTarget;
    } else {
        state.targets.push(newTarget);
    }
    
    // Notificar os clientes sobre a mudança de alvo
    io.to('world').emit('targetMoved', newTarget);
    state.lastTargetMoveTime = Date.now();
    
    console.log(`Alvo movido para x=${newTarget.x}, z=${newTarget.z}`);
    
    // Atualizar o ID do alvo para os bots
    const targetId = newTarget.id || `${newTarget.x},${newTarget.z}`;
    for (const id in state.players) {
        if (state.players[id].isBot) {
            const bot = state.players[id];
            
            // Forçar os bots a tentarem soltar marcador no próximo alvo
            if (bot.markers > 0) {
                bot.botState.idleMode = false;
                bot.botState.mode = 'explore';
                bot.botState.forceDropOnNextTarget = true;
                console.log(`[BOT] ${bot.name} vai tentar soltar marcador no novo alvo (marcadores restantes: ${bot.markers})`);
            }
        }
    }
    
    return newTarget;
}

function initializeTargets() {
    worldState.targets = [generateTarget()];
    worldState.lastTargetMoveTime = Date.now();
    for (const roomName in rooms) {
        rooms[roomName].targets = [generateTarget()];
    }
}

initializeTargets();

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Função para obter a camada de vento atual com base na altitude
function getCurrentWindLayer(altitude) {
    for (let i = 0; i < windLayers.length; i++) {
        if (altitude >= windLayers[i].minAlt && altitude < windLayers[i].maxAlt) {
            return i;
        }
    }
    return 0;
}

// Adicionar variável para controlar os logs
let lastLogTime = Date.now();

// Função para aplicar o efeito do vento aos jogadores
function applyWindToPlayers(state) {
    const mapSize = 2600;
    
    for (const id in state.players) {
        const player = state.players[id];
        const currentLayerIndex = getCurrentWindLayer(player.y);
        const currentLayer = windLayers[currentLayerIndex];
        
        // Armazenar a posição anterior para calcular o deslocamento
        const prevX = player.x;
        const prevZ = player.z;
        
        // Aplicar o efeito do vento à posição do jogador
        player.x += currentLayer.direction.x * currentLayer.speed;
        player.z += currentLayer.direction.z * currentLayer.speed;
        
        // Calcular o deslocamento causado pelo vento
        const windDeltaX = player.x - prevX;
        const windDeltaZ = player.z - prevZ;
        
        // Garantir que o jogador permaneça dentro dos limites do mapa
        player.x = Math.max(-mapSize / 2, Math.min(mapSize / 2, player.x));
        player.z = Math.max(-mapSize / 2, Math.min(mapSize / 2, player.z));
        player.y = Math.max(110, Math.min(490, player.y)); // Garantir limites verticais também
        
        // Armazenar a informação da camada de vento atual para o jogador
        player.currentWindLayer = currentLayerIndex;
        player.windDirection = currentLayer.name;
        player.windSpeed = currentLayer.speed;
        
        // Armazenar o deslocamento causado pelo vento para os logs
        player.windDeltaX = windDeltaX;
        player.windDeltaZ = windDeltaZ;
    }
    
    // Logs a cada 10 segundos para verificar o movimento horizontal
    if (Date.now() - lastLogTime > 10000) {
        console.log("\n[BACKEND LOG] ===== POSIÇÕES DOS JOGADORES E INFORMAÇÕES DE VENTO =====");
        for (const id in state.players) {
            const player = state.players[id];
            const isBot = player.isBot ? "[BOT] " : "";
            console.log(`[BACKEND LOG] ${isBot}Jogador ${player.name}: x=${player.x.toFixed(2)}, y=${player.y.toFixed(2)}, z=${player.z.toFixed(2)}, vento=${player.windDirection} (${player.windSpeed} m/s)`);
            console.log(`[BACKEND LOG] Deslocamento pelo vento: dx=${player.windDeltaX?.toFixed(2) || '0.00'}, dz=${player.windDeltaZ?.toFixed(2) || '0.00'}`);
        }
        console.log("[BACKEND LOG] ========================================================\n");
        lastLogTime = Date.now();
    }
}

function updateMarkersGravity(state, roomName = null) {
    for (const markerId in state.markers) {
        const marker = state.markers[markerId];
        if (marker.y > 0) {
            marker.y -= 5.0;
            if (marker.y <= 0) {
                marker.y = 0;
                console.log(`Marcador ${markerId} atingiu o chão em x=${marker.x}, z=${marker.z}`);
                
                // Calcular distância e pontuação
                const targets = state.targets;
                const dx = marker.x - targets[0].x;
                const dz = marker.z - targets[0].z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                const score = calculateScore(distance);
                
                io.to(roomName || 'world').emit('markerLanded', { 
                    x: marker.x, 
                    y: marker.y, 
                    z: marker.z, 
                    playerId: marker.playerId, 
                    markerId,
                    distance,
                    score
                });
            }
        }
    }
}

function addBots() {
    // Remover bots existentes para garantir que sempre tenhamos os 4 bots
    for (const id in worldState.players) {
        if (worldState.players[id].isBot) {
            delete worldState.players[id];
        }
    }
    
    // Novos bots com nomes de pilotos internacionais
    const botPilots = [
        { id: 'nick-jonner', name: 'Nick Jonner', country: 'USA', color: '#0000FF', skill: 0.75, patience: 7, dropAccuracy: 0.7 },
        { id: 'flavio-bracos', name: 'Flavio Bracos', country: 'BRA', color: '#00FF00', skill: 0.8, patience: 7, dropAccuracy: 0.75 },
        { id: 'uve-nielster', name: 'Uve Nielster', country: 'GER', color: '#FFCC00', skill: 0.85, patience: 7, dropAccuracy: 0.8 },
        { id: 'yasuo-fujita', name: 'Yasuo Fujita', country: 'JPN', color: '#FF0000', skill: 0.9, patience: 7, dropAccuracy: 0.9 }
    ];
    
    // Obter a posição do alvo atual para spawnar próximo
    const target = worldState.targets[0] || { x: 0, z: 0 };
    const spawnRadius = 300; // Raio de spawn ao redor do alvo
    
    for (const pilot of botPilots) {
        // Gerar posição aleatória próxima ao alvo
        const angle = Math.random() * 2 * Math.PI;
        const distance = Math.random() * spawnRadius;
        const spawnX = target.x + Math.cos(angle) * distance;
        const spawnZ = target.z + Math.sin(angle) * distance;
        
        const botId = `${pilot.id}-${Date.now()}`;
        worldState.players[botId] = {
            id: botId,
            name: `${pilot.name} (${pilot.country})`,
            color: pilot.color,
            x: spawnX,
            y: 100 + Math.random() * 400,
            z: spawnZ,
            markers: 5,
            score: 0,
            isBot: true,
            // Estado do bot para a IA
            botState: {
                mode: 'explore',           // explore, approach, position, drop
                targetAltitude: null,      // altitude alvo para buscar vento favorável
                lastAltitudeChange: Date.now(),
                lastDirectionChange: Date.now(),
                lastStrategyUpdate: Date.now(),
                preferredWind: null,       // direção de vento preferida
                targetDistance: null,      // distância atual até o alvo
                lastTargetDistance: null,  // distância anterior até o alvo
                approachingTarget: false,  // se está se aproximando do alvo
                waitTime: 0,               // tempo de espera para próxima decisão
                patience: pilot.patience,  // paciência para mudar de estratégia (segundos)
                skill: pilot.skill,        // habilidade do piloto (0-1)
                dropAccuracy: pilot.dropAccuracy, // precisão ao soltar marcadores (0-1)
                lastMarkerTime: 0,         // último momento em que soltou um marcador
                markerCooldown: 8000 + Math.random() * 4000, // tempo mínimo entre marcadores (8-12s)
                lastWindCheck: Date.now(), // último momento em que verificou o vento
                windCheckInterval: 1000,   // intervalo para verificar o vento (ms)
                consecutiveApproaches: 0,  // contador de aproximações consecutivas
                bestAltitude: null,        // melhor altitude encontrada
                windEfficiency: {},        // eficiência de cada vento para aproximação
                lastTargetId: null,        // ID do último alvo onde soltou marcador
                droppedMarkers: [],        // IDs dos alvos onde já soltou marcadores
                idleMode: false,           // se está em modo de espera entre alvos
                lastDecisionTime: Date.now(), // último momento em que tomou uma decisão
                dropThreshold: pilot.name.includes('Yasuo') ? 20 : 30 + Math.random() * 10, // distância mínima para soltar marcador
                forceDropOnNextTarget: false // forçar a soltar marcador no próximo alvo
            },
            // Informações de vento
            currentWindLayer: 0,
            windDirection: "Nenhum",
            windSpeed: 0
        };
        
        console.log(`[BOT] ${pilot.name} (${pilot.country}) adicionado ao jogo em x=${spawnX.toFixed(2)}, z=${spawnZ.toFixed(2)}`);
    }
    
    console.log("[BOTS] Todos os 4 pilotos competidores adicionados ao jogo!");
}

// Garantir que os bots não voem fora dos limites do mapa ou acima de 490m e abaixo de 110m
function ensureBotWithinBounds(bot) {
    const mapSize = 2600;
    bot.x = Math.max(-mapSize / 2, Math.min(mapSize / 2, bot.x));
    bot.z = Math.max(-mapSize / 2, Math.min(mapSize / 2, bot.z));
    bot.y = Math.max(110, Math.min(490, bot.y));
}

// Atualizar a função updateBots para incluir o modo idle
function updateBots() {
    const target = worldState.targets[0];
    if (!target) return;
    
    for (const id in worldState.players) {
        if (!worldState.players[id].isBot) continue;
        
        const bot = worldState.players[id];
        ensureBotWithinBounds(bot);
        const botState = bot.botState;
        const now = Date.now();
        
        // Calcular distância até o alvo
        const dx = target.x - bot.x;
        const dz = target.z - bot.z;
        const distanceToTarget = Math.sqrt(dx * dx + dz * dz);
        
        // Atualizar informações de distância
        botState.lastTargetDistance = botState.targetDistance;
        botState.targetDistance = distanceToTarget;
        
        // Verificar se está se aproximando do alvo
        if (botState.lastTargetDistance !== null) {
            botState.approachingTarget = botState.targetDistance < botState.lastTargetDistance;
        }
        
        // Atualizar estratégia periodicamente com base na paciência do piloto
        if (now - botState.lastStrategyUpdate > botState.patience * 1000) {
            updateBotStrategy(bot, target);
            botState.lastStrategyUpdate = now;
        }
        
        // Executar ação com base no modo atual
        switch (botState.mode) {
            case 'explore':
                exploreLayers(bot, target);
                break;
            case 'approach':
                approachTarget(bot, target);
                break;
            case 'position':
                positionForDrop(bot, target);
                break;
            case 'drop':
                dropMarker(bot, target);
                break;
            case 'idle':
                handleIdleMode(bot);
                break;
        }
    }
}

// Função para atualizar a estratégia do bot
function updateBotStrategy(bot, target) {
    const botState = bot.botState;
    const distanceToTarget = botState.targetDistance;
    const now = Date.now();
    
    // Verificar se já soltou marcador neste alvo
    const targetId = target.id || `${target.x},${target.z}`;
    const alreadyDroppedOnTarget = botState.droppedMarkers.includes(targetId);
    
    // Se já soltou marcador neste alvo, entrar em modo de espera
    if (alreadyDroppedOnTarget) {
        if (!botState.idleMode) {
            botState.idleMode = true;
            botState.targetAltitude = 250; // Altitude média para esperar
            console.log(`[BOT] ${bot.name} já soltou marcador neste alvo, aguardando próximo alvo`);
        }
        
        // Em modo de espera, apenas voar pelo centro do mapa
        const centerX = 0;
        const centerZ = 0;
        const distanceToCenter = Math.sqrt(
            Math.pow(bot.x - centerX, 2) + 
            Math.pow(bot.z - centerZ, 2)
        );
        
        if (distanceToCenter > 300) {
            // Se estiver longe do centro, tentar se aproximar
            botState.mode = 'explore';
        } else {
            // Se estiver perto do centro, apenas manter altitude
            botState.mode = 'idle';
        }
        
        return;
    } else {
        // Se é um novo alvo, sair do modo de espera
        botState.idleMode = false;
    }
    
    // Tomar decisão a cada 1 segundo
    if (now - botState.lastDecisionTime < 1000) {
        return; // Ainda não é hora de tomar uma nova decisão
    }
    botState.lastDecisionTime = now;
    
    // Se estamos forçando a soltar marcador neste alvo e estamos relativamente perto
    if (botState.forceDropOnNextTarget && distanceToTarget < 200 && bot.markers > 0) {
        if (distanceToTarget < 100) {
            botState.mode = 'position';
            console.log(`[BOT] ${bot.name} está se posicionando para soltar marcador forçado (${distanceToTarget.toFixed(0)}m)`);
        } else {
            botState.mode = 'approach';
            console.log(`[BOT] ${bot.name} está se aproximando para soltar marcador forçado (${distanceToTarget.toFixed(0)}m)`);
        }
        return;
    }
    
    // Determinar o modo com base na distância e marcadores disponíveis
    if (distanceToTarget > 500) {
        // Longe do alvo - explorar camadas para encontrar vento favorável
        botState.mode = 'explore';
        console.log(`[BOT] ${bot.name} está explorando camadas de vento (${distanceToTarget.toFixed(0)}m do alvo)`);
    } else if (distanceToTarget > 100) {
        // Média distância - aproximar-se do alvo
        botState.mode = 'approach';
        console.log(`[BOT] ${bot.name} está se aproximando do alvo (${distanceToTarget.toFixed(0)}m)`);
    } else if (distanceToTarget > 30) {
        // Perto do alvo - posicionar-se precisamente
        botState.mode = 'position';
        console.log(`[BOT] ${bot.name} está se posicionando para soltar marcador (${distanceToTarget.toFixed(0)}m)`);
    } else if (bot.markers > 0) {
        // Muito perto e tem marcadores - soltar marcador
        botState.mode = 'drop';
        console.log(`[BOT] ${bot.name} está pronto para soltar marcador! (${distanceToTarget.toFixed(0)}m)`);
    } else {
        // Sem marcadores - voltar a explorar
        botState.mode = 'explore';
        console.log(`[BOT] ${bot.name} ficou sem marcadores, explorando novamente`);
    }
    
    // Determinar vento preferido com base na posição relativa ao alvo
    const dx = target.x - bot.x;
    const dz = target.z - bot.z;
    const angle = Math.atan2(dz, dx) * (180 / Math.PI);
    
    // Escolher direção de vento que leva em direção ao alvo
    if (angle >= -45 && angle < 45) {
        botState.preferredWind = 'Leste'; // Alvo está a leste
    } else if (angle >= 45 && angle < 135) {
        botState.preferredWind = 'Sul';   // Alvo está ao sul
    } else if (angle >= 135 || angle < -135) {
        botState.preferredWind = 'Oeste'; // Alvo está a oeste
    } else {
        botState.preferredWind = 'Norte'; // Alvo está ao norte
    }
    
    // Estratégias avançadas baseadas na habilidade do piloto
    if (botState.skill > 0.8) {
        // Pilotos mais habilidosos são mais estratégicos
        
        // Verificar se o alvo está prestes a mudar (a cada 60 segundos)
        const gameTime = (Date.now() - worldState.startTime) / 1000;
        const timeUntilTargetChange = 60 - (gameTime % 60);
        
        if (timeUntilTargetChange < 10 && bot.markers > 0 && distanceToTarget < 200) {
            // Se o alvo está prestes a mudar e estamos relativamente perto, tentar soltar um marcador
            botState.mode = 'position';
            console.log(`[BOT] ${bot.name} está tentando soltar um marcador antes da mudança de alvo (${timeUntilTargetChange.toFixed(1)}s restantes)`);
        }
        
        // Verificar outros jogadores para comportamento competitivo
        let nearestCompetitor = null;
        let nearestCompetitorDistance = Infinity;
        
        for (const id in worldState.players) {
            if (id !== bot.id) {
                const competitor = worldState.players[id];
                const competitorDx = competitor.x - target.x;
                const competitorDz = competitor.z - target.z;
                const competitorDistance = Math.sqrt(competitorDx * competitorDx + competitorDz * competitorDz);
                
                if (competitorDistance < nearestCompetitorDistance) {
                    nearestCompetitor = competitor;
                    nearestCompetitorDistance = competitorDistance;
                }
            }
        }
        
        // Se um competidor está mais perto do alvo, aumentar a urgência
        if (nearestCompetitor && nearestCompetitorDistance < distanceToTarget && bot.markers > 0) {
            botState.patience = Math.max(2, botState.patience * 0.7); // Reduzir paciência para agir mais rápido
            
            if (distanceToTarget < 150) {
                // Se estamos relativamente perto, tentar soltar um marcador logo
                botState.mode = 'position';
                console.log(`[BOT] ${bot.name} está competindo com ${nearestCompetitor.name} pelo alvo!`);
            }
        } else {
            // Restaurar paciência normal
            botState.patience = 5 + Math.random() * 10;
        }
    }
    
    // Estratégia de economia de marcadores
    if (bot.markers <= 2 && worldState.timeLeft > 120) {
        // Se temos poucos marcadores e muito tempo de jogo, ser mais conservador
        if (distanceToTarget > 50) {
            // Não soltar marcadores a menos que estejamos muito perto
            botState.mode = 'approach';
            console.log(`[BOT] ${bot.name} está economizando marcadores (${bot.markers} restantes)`);
        }
    }
}

// Função para explorar diferentes camadas de vento
function exploreLayers(bot, target) {
    const botState = bot.botState;
    const now = Date.now();
    
    // Verificar se a distância está diminuindo ou aumentando mais frequentemente
    if (now - botState.lastWindCheck > botState.windCheckInterval) {
        if (botState.lastTargetDistance !== null) {
            const isApproaching = botState.targetDistance < botState.lastTargetDistance;
            
            // Registrar a eficiência do vento atual
            if (!botState.windEfficiency[bot.windDirection]) {
                botState.windEfficiency[bot.windDirection] = { approaches: 0, retreats: 0 };
            }
            
            if (isApproaching) {
                botState.windEfficiency[bot.windDirection].approaches++;
                botState.consecutiveApproaches++;
                
                // Se estamos nos aproximando consistentemente, registrar esta como uma boa altitude
                if (botState.consecutiveApproaches >= 3) {
                    botState.bestAltitude = bot.y;
                    
                    // Yasuo é mais persistente em manter um bom vento
                    if (bot.name.includes('Yasuo') && botState.consecutiveApproaches >= 5) {
                        botState.mode = 'approach';
                        console.log(`[BOT] ${bot.name} encontrou um vento excelente e está se aproximando do alvo!`);
                    }
                }
            } else {
                botState.windEfficiency[bot.windDirection].retreats++;
                botState.consecutiveApproaches = 0;
                
                // Se o vento atual não está ajudando, mudar de altitude mais rapidamente
                if (now - botState.lastAltitudeChange > 1500) {
                    // Escolher uma nova altitude, evitando a atual
                    const currentLayer = getCurrentWindLayer(bot.y);
                    let newLayer;
                    
                    // Yasuo é mais inteligente na escolha da próxima camada
                    if (bot.name.includes('Yasuo')) {
                        // Analisar qual vento tem sido mais eficiente
                        let bestWind = null;
                        let bestRatio = 0;
                        
                        for (const wind in botState.windEfficiency) {
                            const stats = botState.windEfficiency[wind];
                            if (stats.approaches > 0) {
                                const ratio = stats.approaches / (stats.approaches + stats.retreats);
                                if (ratio > bestRatio) {
                                    bestRatio = ratio;
                                    bestWind = wind;
                                }
                            }
                        }
                        
                        // Encontrar a camada com o melhor vento
                        if (bestWind) {
                            for (let i = 0; i < windLayers.length; i++) {
                                if (windLayers[i].name === bestWind) {
                                    newLayer = i;
                                    break;
                                }
                            }
                        }
                    }
                    
                    // Se não encontrou um melhor vento ou não é Yasuo, escolher aleatoriamente
                    if (newLayer === undefined) {
                        do {
                            newLayer = Math.floor(Math.random() * 4) + 1; // Camadas 1-4 (excluindo "Nenhum")
                        } while (newLayer === currentLayer);
                    }
                    
                    // Definir a altitude alvo como o meio da camada
                    botState.targetAltitude = (windLayers[newLayer].minAlt + windLayers[newLayer].maxAlt) / 2;
                    botState.lastAltitudeChange = now;
                    console.log(`[BOT] ${bot.name} está mudando para altitude ${botState.targetAltitude}m para buscar vento melhor`);
                }
            }
        }
        botState.lastWindCheck = now;
    }
    
    // Mover-se para a altitude alvo
    if (botState.targetAltitude !== null) {
        // Yasuo se move mais rapidamente entre camadas
        const speedMultiplier = bot.name.includes('Yasuo') ? 1.5 : 1.0;
        
        if (bot.y < botState.targetAltitude - 5) {
            bot.y += 2 * speedMultiplier; // Subir
        } else if (bot.y > botState.targetAltitude + 5) {
            bot.y -= 2 * speedMultiplier; // Descer
        }
    }
    
    // Garantir que o bot permaneça dentro dos limites
    ensureBotWithinBounds(bot);
    
    // Se estiver se aproximando do alvo com o vento atual, mudar para modo de aproximação
    if (botState.approachingTarget && botState.targetDistance < 500) {
        botState.mode = 'approach';
    }
}

// Função para aproximar-se do alvo
function approachTarget(bot, target) {
    const botState = bot.botState;
    const now = Date.now();
    
    // Verificar se ainda estamos nos aproximando do alvo
    if (now - botState.lastWindCheck > botState.windCheckInterval) {
        if (botState.lastTargetDistance !== null) {
            const isApproaching = botState.targetDistance < botState.lastTargetDistance;
            
            if (!isApproaching && now - botState.lastDirectionChange > 2000) {
                // Se não estamos nos aproximando, voltar a explorar
                botState.mode = 'explore';
                botState.lastDirectionChange = now;
                console.log(`[BOT] ${bot.name} não está mais se aproximando, voltando a explorar`);
                return;
            }
        }
        botState.lastWindCheck = now;
    }
    
    // Manter a altitude atual se estiver se aproximando do alvo
    if (botState.approachingTarget) {
        // Pequenos ajustes para otimizar a aproximação
        if (now - botState.lastAltitudeChange > 2000) {
            // Yasuo faz ajustes mais precisos
            if (bot.name.includes('Yasuo')) {
                // Testar pequenos ajustes para otimizar ainda mais
                const testAltitude = bot.y + (Math.random() < 0.5 ? 5 : -5);
                if (testAltitude >= 110 && testAltitude <= 490) {
                    botState.targetAltitude = testAltitude;
                    botState.lastAltitudeChange = now;
                }
            } else {
                // Outros bots fazem ajustes maiores e menos frequentes
                if (Math.random() < 0.3) {
                    const adjustment = (Math.random() < 0.5) ? 10 : -10;
                    botState.targetAltitude = Math.max(110, Math.min(490, bot.y + adjustment));
                    botState.lastAltitudeChange = now;
                }
            }
        }
    }
    
    // Mover-se para a altitude alvo
    if (botState.targetAltitude !== null) {
        // Yasuo se move mais precisamente
        const precision = bot.name.includes('Yasuo') ? 2 : 5;
        const speed = bot.name.includes('Yasuo') ? 1.5 : 1.0;
        
        if (bot.y < botState.targetAltitude - precision) {
            bot.y += 2 * speed; // Subir
        } else if (bot.y > botState.targetAltitude + precision) {
            bot.y -= 2 * speed; // Descer
        }
    }
    
    // Garantir que o bot permaneça dentro dos limites
    ensureBotWithinBounds(bot);
    
    // Se estiver muito perto do alvo, mudar para modo de posicionamento
    if (botState.targetDistance < 100) {
        botState.mode = 'position';
    }
}

// Função para posicionar-se precisamente sobre o alvo
function positionForDrop(bot, target) {
    const botState = bot.botState;
    const now = Date.now();
    
    // Ajustes mais frequentes e precisos de altitude
    if (now - botState.lastAltitudeChange > (bot.name.includes('Yasuo') ? 500 : 1000)) {
        // Testar diferentes altitudes para encontrar a melhor direção
        const currentLayer = getCurrentWindLayer(bot.y);
        const currentWind = windLayers[currentLayer];
        
        // Calcular se o vento atual está levando em direção ao alvo
        const dx = target.x - bot.x;
        const dz = target.z - bot.z;
        
        // Yasuo calcula com mais precisão a eficiência do vento
        if (bot.name.includes('Yasuo')) {
            // Calcular o ângulo entre a direção do vento e a direção para o alvo
            const windAngle = Math.atan2(currentWind.direction.z, currentWind.direction.x);
            const targetAngle = Math.atan2(dz, dx);
            
            // Diferença de ângulo (em radianos)
            let angleDiff = Math.abs(windAngle - targetAngle);
            if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
            
            // Se o ângulo for menor que 90 graus, o vento está ajudando
            const windHelpful = angleDiff < Math.PI / 2;
            
            if (windHelpful) {
                // Calcular a altitude ideal dentro da camada atual para maximizar a aproximação
                const layerRange = currentWind.maxAlt - currentWind.minAlt;
                const optimalPosition = currentWind.minAlt + (layerRange * 0.5); // Meio da camada
                botState.targetAltitude = optimalPosition;
                console.log(`[BOT] ${bot.name} está otimizando a posição na camada de vento ${currentWind.name}`);
            } else {
                // Procurar uma camada melhor com base na direção para o alvo
                let bestLayer = 0;
                let bestScore = -1;
                
                for (let i = 1; i < windLayers.length; i++) { // Começar de 1 para pular "Nenhum"
                    const layerWind = windLayers[i];
                    const layerWindAngle = Math.atan2(layerWind.direction.z, layerWind.direction.x);
                    let layerAngleDiff = Math.abs(layerWindAngle - targetAngle);
                    if (layerAngleDiff > Math.PI) layerAngleDiff = 2 * Math.PI - layerAngleDiff;
                    
                    // Pontuação baseada no ângulo e velocidade
                    const angleScore = (Math.PI - layerAngleDiff) / Math.PI; // 0-1, maior é melhor
                    const score = angleScore * layerWind.speed;
                    
                    if (score > bestScore) {
                        bestScore = score;
                        bestLayer = i;
                    }
                }
                
                // Ir para a melhor camada encontrada
                botState.targetAltitude = (windLayers[bestLayer].minAlt + windLayers[bestLayer].maxAlt) / 2;
                console.log(`[BOT] ${bot.name} está mudando para a camada de vento ${windLayers[bestLayer].name} para melhor aproximação`);
            }
        } else {
            // Outros bots usam uma lógica mais simples
            const windHelpful = (dx * currentWind.direction.x > 0 || dz * currentWind.direction.z > 0);
            
            if (windHelpful) {
                // Manter a altitude atual
                botState.targetAltitude = bot.y;
            } else {
                // Tentar outra camada
                const newLayer = (currentLayer + 1) % windLayers.length;
                botState.targetAltitude = (windLayers[newLayer].minAlt + windLayers[newLayer].maxAlt) / 2;
            }
        }
        
        botState.lastAltitudeChange = now;
    }
    
    // Mover-se para a altitude alvo
    if (botState.targetAltitude !== null) {
        // Yasuo se move com mais precisão
        const precision = bot.name.includes('Yasuo') ? 1 : 2;
        const speed = bot.name.includes('Yasuo') ? 1.2 : 1.0;
        
        if (bot.y < botState.targetAltitude - precision) {
            bot.y += 1 * speed; // Subir lentamente
        } else if (bot.y > botState.targetAltitude + precision) {
            bot.y -= 1 * speed; // Descer lentamente
        }
    }
    
    // Garantir que o bot permaneça dentro dos limites
    ensureBotWithinBounds(bot);
    
    // Usar o threshold personalizado para cada bot
    const dropThreshold = botState.dropThreshold || (bot.name.includes('Yasuo') ? 20 : 30);
    
    // Se estiver muito perto do alvo e se aproximando, mudar para modo de soltar marcador
    if (botState.targetDistance < dropThreshold && botState.approachingTarget) {
        botState.mode = 'drop';
    } else if (botState.targetDistance > 150) {
        // Se afastou muito, voltar para modo de aproximação
        botState.mode = 'approach';
    }
}

// Função para soltar marcador
function dropMarker(bot, target) {
    const botState = bot.botState;
    const now = Date.now();
    const targetId = target.id;
    
    // Verificar se o bot ainda tem marcadores
    if (bot.markers <= 0) {
        console.log(`[BOT] ${bot.name} não tem mais marcadores disponíveis`);
        botState.mode = 'idle';
        return;
    }
    
    // Verificar se o bot já soltou marcador para este alvo
    if (botState.droppedMarkers.includes(targetId) && !botState.forceDropOnNextTarget) {
        console.log(`[BOT] ${bot.name} já soltou marcador para este alvo`);
        botState.mode = 'idle';
        return;
    }
    
    // Verificar se o bot está próximo o suficiente do alvo
    const dx = bot.x - target.x;
    const dz = bot.z - target.z;
    botState.targetDistance = Math.sqrt(dx * dx + dz * dz);
    
    // Verificar se o bot está em uma posição boa para soltar o marcador
    if (botState.targetDistance < 30 || botState.forceDropOnNextTarget) {
        // Calcular posição do marcador com base na habilidade do piloto
        const accuracy = botState.dropAccuracy;
        
        // Yasuo tem precisão quase perfeita
        const randomOffset = bot.name.includes('Yasuo') ? 
            (1 - accuracy) * 10 : // Máximo de 10 unidades de erro para Yasuo
            (1 - accuracy) * 20;  // Máximo de 20 unidades de erro para outros
        
        // Calcular posição do marcador
        const mapSize = 2600;
        let markerX = bot.x + (Math.random() * randomOffset * 2 - randomOffset);
        let markerZ = bot.z + (Math.random() * randomOffset * 2 - randomOffset);
        
        // Garantir que o marcador esteja dentro dos limites do mapa
        markerX = Math.max(-mapSize / 2, Math.min(mapSize / 2, markerX));
        markerZ = Math.max(-mapSize / 2, Math.min(mapSize / 2, markerZ));
        
        const markerId = `${bot.id}-marker-${Date.now()}`;
        const markerData = {
            playerId: bot.id,
            x: markerX,
            y: bot.y - 10,
            z: markerZ,
            markerId
        };
        
        bot.markers--;
        worldState.markers[markerId] = markerData;
        
        // Calcular a pontuação para o marcador
        const target = worldState.targets[0];
        if (target) {
            const dx = markerData.x - target.x;
            const dz = markerData.z - target.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            const points = calculateScore(distance);
            
            io.to('world').emit('markerDropped', { 
                ...markerData, 
                markers: bot.markers, 
                score: bot.score, 
                markerId,
                distance,
                score: points
            });
            
            if (points > 0) {
                bot.score += points;
                io.to('world').emit('scoreUpdate', { playerId: bot.id, score: bot.score, points });
                console.log(`[BOT] ${bot.name} marcou ${points} pontos! Distância: ${distance.toFixed(1)}m, Score total: ${bot.score}`);
            }
        } else {
            io.to('world').emit('markerDropped', { 
                ...markerData, 
                markers: bot.markers, 
                score: bot.score, 
                markerId 
            });
        }
        
        console.log(`[BOT] ${bot.name} soltou marcador: ${markerId}, restantes: ${bot.markers}, distância: ${botState.targetDistance.toFixed(1)}m`);
        
        botState.lastMarkerTime = now;
        botState.lastTargetId = targetId;
        botState.droppedMarkers.push(targetId);
        botState.forceDropOnNextTarget = false; // Resetar o forçar soltar marcador
        
        // Após soltar marcador, entrar em modo de espera
        botState.mode = 'idle';
        botState.idleMode = true;
        
        // Yasuo é mais estratégico após soltar um marcador
        if (bot.name.includes('Yasuo') && botState.bestAltitude !== null) {
            // Voltar para a melhor altitude encontrada anteriormente
            botState.targetAltitude = botState.bestAltitude;
            console.log(`[BOT] ${bot.name} está voltando para sua altitude ideal de ${botState.bestAltitude.toFixed(1)}m`);
        }
    } else if (botState.targetDistance > 40 || !botState.approachingTarget) {
        // Se afastou muito ou não está se aproximando, voltar para posicionamento
        botState.mode = 'position';
    }
    
    // Garantir que o bot permaneça dentro dos limites
    ensureBotWithinBounds(bot);
}

// Função para o modo de espera (idle)
function handleIdleMode(bot) {
    const botState = bot.botState;
    const now = Date.now();
    
    // Manter uma altitude média
    if (botState.targetAltitude === null) {
        botState.targetAltitude = 250;
    }
    
    // Mover-se para a altitude alvo
    if (bot.y < botState.targetAltitude - 5) {
        bot.y += 1; // Subir lentamente
    } else if (bot.y > botState.targetAltitude + 5) {
        bot.y -= 1; // Descer lentamente
    }
    
    // Verificar se o alvo mudou a cada 1 segundo
    if (now - botState.lastDecisionTime > 1000) {
        const target = worldState.targets[0];
        if (target) {
            const targetId = target.id || `${target.x},${target.z}`;
            
            // Se o alvo atual é diferente do último onde soltou marcador
            if (targetId !== botState.lastTargetId) {
                // Verificar se já soltou marcador neste alvo
                if (!botState.droppedMarkers.includes(targetId)) {
                    // Novo alvo onde ainda não soltou marcador, voltar a explorar
                    botState.idleMode = false;
                    botState.mode = 'explore';
                    botState.forceDropOnNextTarget = true; // Forçar a soltar marcador neste novo alvo
                    console.log(`[BOT] ${bot.name} detectou novo alvo, voltando a explorar`);
                }
            }
        }
        botState.lastDecisionTime = now;
    }
    
    // Garantir que o bot permaneça dentro dos limites
    ensureBotWithinBounds(bot);
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
        
        // Obter a posição do alvo atual para spawnar próximo
        const target = worldState.targets[0] || { x: 0, z: 0 };
        const spawnRadius = 300; // Raio de spawn ao redor do alvo
        
        // Gerar posição aleatória próxima ao alvo
        const angle = Math.random() * 2 * Math.PI;
        const distance = Math.random() * spawnRadius;
        const spawnX = target.x + Math.cos(angle) * distance;
        const spawnZ = target.z + Math.sin(angle) * distance;
        
        worldState.players[socket.id] = {
            id: playerId, // Usa o _id do MongoDB ou socket.id
            name: playerData.name,
            color: playerData.color,
            x: spawnX,
            y: 200,
            z: spawnZ,
            markers: 5,
            score: 0,
            currentWindLayer: 0,
            windDirection: "Nenhum",
            windSpeed: 0
        };
        
        console.log(`Jogador ${playerData.name} entrou no mundo em x=${spawnX.toFixed(2)}, z=${spawnZ.toFixed(2)}`);
        
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
            lastTargetMoveTime: Date.now(),
            windLayers: windLayers // Adicionar as camadas de vento à sala
        };
        rooms[roomName].players[socket.id] = {
            id: socket.id,
            name: roomData.playerName,
            color: null,
            x: 0,
            z: 0,
            y: 100,
            markers: 5,
            score: 0,
            isBot: false,
            currentWindLayer: 0,
            windDirection: "Nenhum",
            windSpeed: 0
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
                isBot: false,
                currentWindLayer: 0,
                windDirection: "Nenhum",
                windSpeed: 0
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

    socket.on('updatePosition', ({ y, mode, roomName, keys }) => {
        const state = mode === 'world' ? worldState : rooms[roomName];
        const player = mode === 'world' ? worldState.players[socket.id] : rooms[roomName]?.players[socket.id];
        
        if (player) {
            // Atualizar apenas a altitude com base nos comandos recebidos
            player.y = y;
            
            // Armazenar os comandos de teclas para uso futuro, se necessário
            if (keys) {
                player.keys = keys;
            }
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
                
                // Calcular pontuação com base na distância
                const score = calculateScore(distance);
                
                // Enviar informações de marcador com distância e pontuação
                io.to('world').emit('markerLanded', { 
                    x, 
                    y, 
                    z, 
                    playerId: worldState.markers[markerId].playerId, 
                    markerId,
                    distance,
                    score
                });
                
                if (distance < 40) {
                    player.score = (player.score || 0) + score;
                    io.to('world').emit('targetHitUpdate', { targetIndex: worldState.currentTargetIndex, playerId: player.id, score: player.score });
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
                // Remover marcador após processar para evitar repetição
                delete worldState.markers[markerId];
            } else {
                console.warn(`Marcador ${markerId} não encontrado em worldState.markers`);
            }
            return;
        }
        if (state.markers[markerId]) {
            state.markers[markerId].x = x;
            state.markers[markerId].y = y;
            state.markers[markerId].z = z;
            
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
            
            // Calcular pontuação com base na distância
            const score = calculateScore(distance);
            
            // Enviar informações de marcador com distância e pontuação
            io.to(roomName || 'world').emit('markerLanded', { 
                x, 
                y, 
                z, 
                playerId: state.markers[markerId].playerId, 
                markerId,
                distance,
                score
            });
            
            if (distance < 40) {
                player.score = (player.score || 0) + score;
                io.to(roomName || 'world').emit('targetHitUpdate', { targetIndex: state.currentTargetIndex, playerId: player.id, score: player.score });
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
            // Remover marcador após processar para evitar repetição
            delete state.markers[markerId];
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
    
    // Atualizar o tempo restante no worldState para os bots
    worldState.timeLeft = timeLeft;

    const secondsElapsed = elapsedWorld % 60;
    if (secondsElapsed < 0.1 && elapsedWorld < 290 && Date.now() - worldState.lastTargetMoveTime >= 59 * 1000) {
        moveTarget(worldState);
    }

    updateMarkersGravity(worldState);
    updateBots();
    // Aplicar o efeito do vento aos jogadores (incluindo bots)
    applyWindToPlayers(worldState);
    
    // Enviar atualizações para todos os clientes
    io.to('world').emit('gameUpdate', { state: worldState, timeLeft });

    if (elapsedWorld >= 300 && elapsedWorld < 315) {
        io.to('world').emit('showLeaderboard', { players: worldState.players });
    } else if (elapsedWorld >= 315) {
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
            // Aplicar o efeito do vento aos jogadores da sala
            applyWindToPlayers(room);
            io.to(roomName).emit('gameUpdate', { state: room, timeLeft: roomTimeLeft });

            if (elapsed >= 300 && elapsed < 315) {
                io.to(roomName).emit('showLeaderboard', { players: room.players });
            } else if (elapsed >= 315) {
                io.to(roomName).emit('gameReset', { state: resetRoomState(roomName) });
                console.log(`Novo jogo iniciado na sala ${roomName}`);
            }
        }
    }
}, 1000 / 30); // 30 FPS

function resetWorldState() {
    const mapSize = 2600;
    worldState = {
        players: Object.keys(worldState.players).reduce((acc, id) => {
            // Gerar posição aleatória próxima ao centro da arena (entre 115m e 490m)
            const randomOffset = () => 115 + Math.random() * 375; // Entre 115 e 490
            const randomSign = () => Math.random() > 0.5 ? 1 : -1;
            
            acc[id] = { 
                ...worldState.players[id], 
                x: randomOffset() * randomSign(), 
                y: 100 + Math.random() * 400, 
                z: randomOffset() * randomSign(), 
                markers: 5, 
                score: 0,
                currentWindLayer: 0,
                windDirection: "Nenhum",
                windSpeed: 0
            };
            return acc;
        }, {}),
        targets: [generateTarget()],
        startTime: Date.now(),
        currentTargetIndex: 0,
        markers: {},
        lastTargetMoveTime: Date.now(),
        windLayers: windLayers // Manter as camadas de vento no reset
    };
    addBots();
    return worldState;
}

function resetRoomState(roomName) {
    const mapSize = 2600;
    const room = rooms[roomName];
    room.players = Object.keys(room.players).reduce((acc, id) => {
        // Gerar posição aleatória próxima ao centro da arena (entre 115m e 490m)
        const randomOffset = () => 115 + Math.random() * 375; // Entre 115 e 490
        const randomSign = () => Math.random() > 0.5 ? 1 : -1;
        
        acc[id] = { 
            ...room.players[id], 
            x: randomOffset() * randomSign(), 
            y: 100 + Math.random() * 400, 
            z: randomOffset() * randomSign(), 
            markers: 5, 
            score: 0,
            currentWindLayer: 0,
            windDirection: "Nenhum",
            windSpeed: 0
        };
        return acc;
    }, {});
    room.targets = [generateTarget()];
    room.startTime = Date.now();
    room.currentTargetIndex = 0;
    room.markers = {};
    room.lastTargetMoveTime = Date.now();
    room.windLayers = windLayers; // Adicionar as camadas de vento à sala
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