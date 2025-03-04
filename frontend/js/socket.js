// socket.js
const lerpFactor = 0.1; // Fator de interpolação para movimentos suaves
console.log('socket.js carregado');

export function initSocket() {
    if (typeof io === 'undefined') {
        console.error('Socket.IO não foi carregado corretamente.');
        return;
    }

    const token = localStorage.getItem('jwtToken');
    if (!token) {
        console.error('Nenhum token JWT encontrado no localStorage');
        return;
    }

    window.socket = io('https://hotair-backend.onrender.com', {
        auth: { token },
        transports: ['websocket', 'polling']
    });
    const socket = window.socket;

    if (!socket) {
        console.error('Falha ao inicializar o socket.');
        return;
    }

    window.markers = window.markers || [];
    window.targets = window.targets || [];
    window.otherPlayers = window.otherPlayers || {};
    window.balloonColor = window.balloonColor || '#FF4500';
    window.markersLeft = 5;

    socket.on('connect', () => {
        console.log('Conectado ao backend via Socket.IO');
    });

    socket.on('connect_error', (err) => {
        console.error('Erro de conexão com o backend:', err.message);
    });

    socket.on('roomCreated', ({ roomName, creator }) => {
        window.roomName = roomName;
        window.isCreator = (creator === socket.id);
        document.getElementById('roomScreen').style.display = 'none';
        document.getElementById('colorScreen').style.display = 'flex';
        socket.emit('setColor', { roomName, color: null });
    });

    socket.on('roomError', (msg) => {
        alert(msg);
        document.getElementById('colorScreen').style.display = 'none';
        document.getElementById('roomScreen').style.display = 'flex';
    });

    socket.on('playerJoined', ({ players, creator }) => {
        const playersList = document.getElementById('playersList');
        playersList.innerHTML = '';
        let playerCount = 0;
        for (const id in players) {
            const playerDiv = document.createElement('div');
            playerDiv.textContent = `${players[id].name} - ${players[id].color || 'Escolhendo cor'}`;
            playersList.appendChild(playerDiv);
            playerCount++;
        }
        if (creator === socket.id) {
            window.isCreator = true;
            document.getElementById('startRoomButton').style.display = playerCount >= 2 ? 'block' : 'none';
        } else {
            document.getElementById('startRoomButton').style.display = 'none';
        }
    });

    socket.on('playerLeft', (id) => {
        if (window.otherPlayers[id]) {
            window.scene.remove(window.otherPlayers[id]);
            delete window.otherPlayers[id];
        }
    });

    socket.on('roomClosed', () => {
        alert('O criador da sala saiu. A sala foi fechada.');
        document.getElementById('lobbyScreen').style.display = 'none';
        document.getElementById('nameScreen').style.display = 'flex';
        resetGameState();
    });

    socket.on('countdown', (count) => {
        document.getElementById('countdown').textContent = count > 0 ? count : 'GO!';
    });

    socket.on('startGame', ({ state }) => {
        console.log('startGame recebido:', state);
        document.getElementById('lobbyScreen').style.display = 'none';
        document.getElementById('gameScreen').style.display = 'block';
        document.getElementById('countdown').textContent = '';
        if (typeof window.setTargets === 'function') {
            window.setTargets(state.targets || []);
        } else {
            console.error('window.setTargets não está definido ainda');
            window.targets = state.targets || [];
        }
        window.lastTargetMoveTime = state.lastTargetMoveTime || Date.now();
        if (Array.isArray(window.targets)) {
            window.targets.forEach(target => {
                const targetMesh = window.createTarget(target.x, target.z);
                window.scene.add(targetMesh);
            });
        }
        const playerName = document.getElementById('playerNameDisplay')?.textContent || 'Jogador';
        window.setBalloon(window.createBalloon(window.balloonColor, playerName));
        if (window.balloon) {
            console.log('Adicionando balão à cena:', window.balloon);
            window.balloon.position.set(0, 100, 0);
            window.scene.add(window.balloon);
        } else {
            console.error('Falha ao criar balão do jogador');
        }
        document.getElementById('playerNameDisplay').textContent = playerName;
        document.getElementById('markersLeft').textContent = window.markersLeft;
        for (const id in state.players) {
            if (id !== socket.id && state.players[id].color) {
                const otherBalloon = window.createBalloon(state.players[id].color, state.players[id].name);
                otherBalloon.position.set(state.players[id].x, state.players[id].y, state.players[id].z);
                window.otherPlayers[id] = otherBalloon;
                window.scene.add(otherBalloon);
            }
        }
        if (typeof window.gameStarted === 'function') {
            window.gameStarted();
        } else {
            console.error('window.gameStarted não está definido');
            gameStarted = true; // Fallback local
        }
    });

    socket.on('gameState', ({ mode: gameMode, state }) => {
        console.log('gameState recebido:', { mode: gameMode, state });
        if (gameMode === 'world') {
            window.mode = 'world';
            if (typeof window.initGameScene !== 'function') {
                const waitForGameScene = setInterval(() => {
                    if (typeof window.initGameScene === 'function') {
                        window.initGameScene(state);
                        clearInterval(waitForGameScene);
                    }
                }, 100);
            } else {
                window.initGameScene(state);
            }
            document.getElementById('colorScreen').style.display = 'none';
            document.getElementById('gameScreen').style.display = 'block';
        }
    });

    socket.on('gameUpdate', ({ state, timeLeft, targetTimeLeft }) => {
        const currentState = window.mode === 'world' ? state : state;
        const player = currentState.players[socket.id];
        
        // Atualizar posição do jogador com interpolação suave
        if (player && window.balloon) {
            window.targetPosition = {
                x: window.targetPosition ? window.targetPosition.x + (player.x - window.targetPosition.x) * lerpFactor : player.x,
                y: player.y,
                z: window.targetPosition ? window.targetPosition.z + (player.z - window.targetPosition.z) * lerpFactor : player.z
            };
        }
        
        // Atualizar outros jogadores com interpolação
        for (const id in currentState.players) {
            if (id !== socket.id) {
                if (!window.otherPlayers[id] && currentState.players[id].color) {
                    const otherBalloon = window.createBalloon(currentState.players[id].color, currentState.players[id].name);
                    otherBalloon.position.set(currentState.players[id].x, currentState.players[id].y, currentState.players[id].z);
                    window.otherPlayers[id] = otherBalloon;
                    window.scene.add(otherBalloon);
                } else if (window.otherPlayers[id]) {
                    const other = currentState.players[id];
                    const balloon = window.otherPlayers[id];
                    balloon.position.x += (other.x - balloon.position.x) * lerpFactor;
                    balloon.position.y = other.y;
                    balloon.position.z += (other.z - balloon.position.z) * lerpFactor;
                }
            }
        }
        
        // Atualizar UI com throttling para evitar atualizações muito frequentes
        const now = Date.now();
        if (!window.lastUIUpdate || now - window.lastUIUpdate >= 100) {
            const timerDisplay = document.getElementById('timerDisplay');
            if (timerDisplay) {
                const minutes = Math.floor(timeLeft / 60);
                const seconds = Math.floor(timeLeft % 60);
                timerDisplay.textContent = `Tempo: ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
            }

            const targetTimer = document.getElementById('targetMoveTimer');
            if (targetTimer) {
                targetTimer.textContent = `Próxima mudança: ${Math.floor(targetTimeLeft)}s`;
            }

            const markersLeftElement = document.getElementById('markersLeft');
            if (markersLeftElement) markersLeftElement.textContent = player?.markers || window.markersLeft;

            const pointsElement = document.getElementById('points');
            if (pointsElement) pointsElement.textContent = player?.score || 0;

            window.lastUIUpdate = now;
        }
    });
    
    socket.on('markerDropped', ({ playerId, x, y, z, markers, score, markerId }) => {
        if (playerId === socket.id) {
            window.markersLeft = markers;
            const markersLeftElement = document.getElementById('markersLeft');
            if (markersLeftElement) markersLeftElement.textContent = markers;
            const pointsElement = document.getElementById('points');
            if (pointsElement) pointsElement.textContent = score;
            window.markerDropped = false;
            if (markers === 0) {
                window.showNoMarkersMessage();
            }
        }
        // Criar marcador apenas se for de outro jogador
        if (playerId !== socket.id) {
            const markerMesh = new THREE.Mesh(
                new THREE.SphereGeometry(4.5, 16, 16),
                new THREE.MeshLambertMaterial({ color: 0x0000FF })
            );
            const tailMesh = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -45, 0)]),
                new THREE.LineBasicMaterial({ color: 0xFFFFFF })
            );
            markerMesh.userData = { playerId, type: 'marker', markerId, falling: true };
            tailMesh.userData = { playerId, type: 'tail', markerId };
            markerMesh.position.set(x, y, z);
            tailMesh.position.set(x, y, z);
            window.scene.add(markerMesh);
            window.scene.add(tailMesh);
            window.markers.push({ marker: markerMesh, tail: tailMesh, playerId });
        }
    });
    
    socket.on('markerUpdate', ({ markerId, x, y, z }) => {
        const markerObj = window.markers.find(m => m.marker.userData.markerId === markerId);
        if (markerObj) {
            markerObj.marker.position.set(x, y, z);
            markerObj.tail.position.set(x, y, z);
            if (y <= 0 && markerObj.marker.userData.falling) {
                markerObj.marker.userData.falling = false;
            }
        }
    });
    
    socket.on('markerLanded', ({ x, y, z, playerId, markerId }) => {
        const markerObj = window.markers.find(m => m.marker.userData.markerId === markerId);
        if (markerObj) {
            markerObj.marker.position.set(x, y, z);
            markerObj.tail.position.set(x, y, z);
            markerObj.marker.userData.falling = false;
        }
    });
    
    socket.on('targetHitUpdate', ({ targetIndex, score }) => {
        const pointsElement = document.getElementById('points');
        if (pointsElement && score !== undefined) {
            pointsElement.textContent = score;
            window.points = score;
        }
    });

    socket.on('gameOver', (winner) => {
        if (!window.gameEnded) {
            window.gameOver();
            window.gameEnded = true;
            document.getElementById('gameScreen').style.display = 'none';
            document.getElementById('nameScreen').style.display = 'flex';
            resetGameState();
            if (window.mode === 'world') socket.emit('leaveWorld');
            else if (window.mode === 'room' && window.roomName) socket.emit('leaveRoom', { roomName: window.roomName });
        }
    });

    socket.on('gameEnd', ({ players }) => {
        if (!window.gameEnded) {
            window.gameOver();
            window.gameEnded = true;
            document.getElementById('gameScreen').style.display = 'none';
            document.getElementById('leaderboardScreen').style.display = 'block';
            showLeaderboard(players);
        }
    });

    socket.on('showLeaderboard', ({ players }) => {
        console.log('showLeaderboard recebido:', players);
        if (!window.gameEnded) {
            window.gameOver();
            window.gameEnded = true;
            document.getElementById('gameScreen').style.display = 'none';
            document.getElementById('loseScreen').style.display = 'none';
            document.getElementById('leaderboardScreen').style.display = 'block';
            showLeaderboard(players);
        }
    });

    function showLeaderboard(players) {
        const leaderboardList = document.getElementById('leaderboardList');
        leaderboardList.innerHTML = '';
        const sortedPlayers = Object.values(players).sort((a, b) => b.score - a.score);
        sortedPlayers.forEach((player, index) => {
            const playerDiv = document.createElement('div');
            if (index === 0) {
                playerDiv.textContent = `🏆 Campeão: ${player.name} - ${player.score} pontos`;
                playerDiv.style.color = '#FFD700';
                playerDiv.style.fontWeight = 'bold';
            } else {
                playerDiv.textContent = `${index + 1}. ${player.name} - ${player.score} pontos`;
            }
            leaderboardList.appendChild(playerDiv);
        });

        const countdownDiv = document.createElement('div');
        countdownDiv.id = 'restartCountdown';
        countdownDiv.style.textAlign = 'center';
        countdownDiv.style.marginTop = '20px';
        countdownDiv.style.fontSize = '1.5em';
        leaderboardList.appendChild(countdownDiv);

        let countdown = 7;
        countdownDiv.textContent = `Novo jogo em ${countdown} segundos`;
        const countdownInterval = setInterval(() => {
            countdown--;
            countdownDiv.textContent = `Novo jogo em ${countdown} segundos`;
            if (countdown <= 0) {
                clearInterval(countdownInterval);
                socket.emit('gameResetRequest');
            }
        }, 1000);
    }

    socket.on('gameReset', ({ state }) => {
        console.log('gameReset recebido:', state);
        document.getElementById('leaderboardScreen').style.display = 'none';
        document.getElementById('loseScreen').style.display = 'none';
        document.getElementById('gameScreen').style.display = 'block';

        window.gameOver = false;
        window.gameEnded = false;
        window.hasLiftedOff = false;
        window.altitude = state.players[socket.id].y;
        window.setTargets(state.targets || []);
        window.lastTargetMoveTime = state.lastTargetMoveTime || Date.now();

        window.scene.children.filter(obj => obj instanceof THREE.Group || obj.userData.type === 'marker' || obj.userData.type === 'tail').forEach(obj => window.scene.remove(obj));
        window.setMarkers([]);
        window.setOtherPlayers({});

        const playerName = document.getElementById('playerNameDisplay')?.textContent || 'Jogador';
        window.setBalloon(window.createBalloon(window.balloonColor, playerName));
        if (window.balloon) {
            window.balloon.position.set(state.players[socket.id].x, state.players[socket.id].y, state.players[socket.id].z);
            window.scene.add(window.balloon);
        }

        for (const id in state.players) {
            if (id !== socket.id && state.players[id].color) {
                const otherBalloon = window.createBalloon(state.players[id].color, state.players[id].name);
                otherBalloon.position.set(state.players[id].x, state.players[id].y, state.players[id].z);
                window.otherPlayers[id] = otherBalloon;
                window.scene.add(otherBalloon);
            }
        }

        if (Array.isArray(window.targets)) {
            window.targets.forEach(target => {
                const targetMesh = window.createTarget(target.x, target.z);
                window.scene.add(targetMesh);
            });
        }

        window.markersLeft = 5;
        document.getElementById('points').textContent = '0';
        document.getElementById('markersLeft').textContent = window.markersLeft;
        if (typeof window.gameStarted === 'function') {
            window.gameStarted();
        } else {
            gameStarted = true;
        }
    });

    function resetGameState() {
        window.gameStarted = false;
        window.markerDropped = false;
        window.markersLeft = 5;
        if (window.balloon) {
            window.scene.remove(window.balloon);
            window.setBalloon(null);
        }
        window.setTargets([]);
        window.markers = [];
        for (const id in window.otherPlayers) {
            window.scene.remove(window.otherPlayers[id]);
        }
        window.setOtherPlayers({});
        window.altitude = 100;
        window.hasLiftedOff = false;
        window.gameOver = false;
        window.points = 0;
        window.lastTargetMoveTime = Date.now();
        window.mode = null;
        window.roomName = null;
        window.isBot = false;
    }
}