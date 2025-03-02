export function initSocket() {
    if (typeof io === 'undefined') {
        console.error('Socket.IO não foi carregado corretamente.');
        return;
    }

    window.socket = io('https://hotair-backend.onrender.com');
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
        window.setTargets(state.targets || []);
        window.lastTargetMoveTime = state.lastTargetMoveTime || Date.now();
        if (Array.isArray(window.targets)) {
            window.targets.forEach(target => {
                const targetMesh = window.createTarget(target.x, target.z);
                window.scene.add(targetMesh);
            });
        }
        const playerName = document.getElementById('playerName').value || 'Jogador';
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
        window.gameStarted();
    });

    socket.on('gameState', ({ mode: gameMode, state }) => {
        console.log('gameState recebido:', state);
        if (gameMode === 'world') {
            window.setTargets(state.targets || []);
            window.lastTargetMoveTime = state.lastTargetMoveTime || Date.now();
            if (Array.isArray(window.targets)) {
                window.targets.forEach(target => {
                    const targetMesh = window.createTarget(target.x, target.z);
                    window.scene.add(targetMesh);
                });
            }
            const playerName = document.getElementById('playerName').value || 'Jogador';
            window.setBalloon(window.createBalloon(window.balloonColor, playerName));
            if (window.balloon) {
                console.log('Adicionando balão à cena via gameState:', window.balloon);
                window.balloon.position.set(0, 100, 0);
                window.scene.add(window.balloon);
            } else {
                console.error('Falha ao criar balão do jogador em gameState');
            }
            document.getElementById('playerNameDisplay').textContent = playerName;
            document.getElementById('markersLeft').textContent = window.markersLeft;
            document.getElementById('colorScreen').style.display = 'none';
            document.getElementById('gameScreen').style.display = 'block';
            for (const id in state.players) {
                if (id !== socket.id && state.players[id].color) {
                    const otherBalloon = window.createBalloon(state.players[id].color, state.players[id].name);
                    otherBalloon.position.set(state.players[id].x, state.players[id].y, state.players[id].z);
                    window.otherPlayers[id] = otherBalloon;
                    window.scene.add(otherBalloon);
                }
            }
            window.gameStarted();
        }
    });

    socket.on('gameUpdate', ({ state, timeLeft }) => {
        const currentState = window.mode === 'world' ? state : state;

        if (state.targets && Array.isArray(state.targets) && 
            (!window.targets.length || state.targets[0].x !== window.targets[0]?.x || state.targets[0].z !== window.targets[0]?.z)) {
            window.lastTargetMoveTime = Date.now();
            window.scene.children.filter(obj => 
                obj instanceof THREE.Group && 
                obj.position.x === window.targets[0]?.x && 
                obj.position.z === window.targets[0]?.z
            ).forEach(obj => window.scene.remove(obj));
            window.setTargets(state.targets);
            const newTargetMesh = window.createTarget(window.targets[0].x, window.targets[0].z);
            window.scene.add(newTargetMesh);
        }

        const secondsLeftInMinute = Math.ceil(60 - (timeLeft % 60));
        document.getElementById('targetMoveTimer').textContent = `Próxima mudança de alvo: ${secondsLeftInMinute}s`;

        for (const id in currentState.players) {
            if (id !== socket.id) {
                if (!window.otherPlayers[id] && currentState.players[id].color) {
                    const otherBalloon = window.createBalloon(currentState.players[id].color, currentState.players[id].name);
                    otherBalloon.position.set(currentState.players[id].x, currentState.players[id].y, currentState.players[id].z);
                    window.otherPlayers[id] = otherBalloon;
                    window.scene.add(otherBalloon);
                } else if (window.otherPlayers[id]) {
                    window.otherPlayers[id].position.set(currentState.players[id].x, currentState.players[id].y, currentState.players[id].z);
                }
            }
        }

        for (const id in window.otherPlayers) {
            if (!currentState.players[id]) {
                window.scene.remove(window.otherPlayers[id]);
                delete window.otherPlayers[id];
            }
        }

        for (const markerId in currentState.markers) {
            const markerData = currentState.markers[markerId];
            let existingMarker = window.markers.find(m => m.marker.userData.markerId === markerId)?.marker;
            let existingTail = window.markers.find(m => m.tail.userData.markerId === markerId)?.tail;

            if (!existingMarker) {
                existingMarker = new THREE.Mesh(new THREE.SphereGeometry(4.5, 16, 16), new THREE.MeshLambertMaterial({ color: 0x0000FF }));
                existingTail = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -45, 0)]), new THREE.LineBasicMaterial({ color: 0xFFFFFF }));
                existingMarker.userData = { playerId: markerData.playerId, type: 'marker', markerId };
                existingTail.userData = { playerId: markerData.playerId, type: 'tail', markerId };
                window.scene.add(existingMarker);
                window.scene.add(existingTail);
                window.markers.push({ marker: existingMarker, tail: existingTail, playerId: markerData.playerId });
            }

            existingMarker.position.set(markerData.x, markerData.y, markerData.z);
            existingTail.position.set(markerData.x, markerData.y, markerData.z);
        }

        document.getElementById('markersLeft').textContent = currentState.players[socket.id]?.markers || window.markersLeft;
        document.getElementById('points').textContent = currentState.players[socket.id]?.score || 0;
        const minutes = Math.floor(timeLeft / 60);
        const seconds = Math.floor(timeLeft % 60);
        document.getElementById('timerDisplay').textContent = `Tempo Restante: ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    });

    socket.on('markerDropped', ({ playerId, x, y, z, markers, score, markerId }) => {
        console.log('Marcador solto por:', playerId, 'Restantes:', markers);
        if (playerId === socket.id) {
            window.markersLeft = markers;
            document.getElementById('markersLeft').textContent = markers;
            document.getElementById('points').textContent = score;
            window.markerDropped = false;
            if (markers === 0) {
                window.showNoMarkersMessage();
            }
        }
    });

    socket.on('markerLanded', ({ x, y, z, playerId, markerId }) => {
        console.log('Marcador pousou em:', { x, y, z }, 'por:', playerId);
        let existingMarker = window.markers.find(m => m.marker.userData.markerId === markerId)?.marker;
        let existingTail = window.markers.find(m => m.tail.userData.markerId === markerId)?.tail;

        if (!existingMarker) {
            existingMarker = new THREE.Mesh(new THREE.SphereGeometry(4.5, 16, 16), new THREE.MeshLambertMaterial({ color: 0x0000FF }));
            existingTail = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -45, 0)]), new THREE.LineBasicMaterial({ color: 0xFFFFFF }));
            existingMarker.userData = { playerId, type: 'marker', markerId };
            existingTail.userData = { playerId, type: 'tail', markerId };
            window.scene.add(existingMarker);
            window.scene.add(existingTail);
            window.markers.push({ marker: existingMarker, tail: existingTail, playerId });
        }

        existingMarker.position.set(x, y, z);
        existingTail.position.set(x, y, z);
    });

    socket.on('targetHitUpdate', ({ targetIndex }) => {
        if (targetIndex < 1) {
            window.scene.remove(window.scene.children.find(obj => 
                obj instanceof THREE.Group && 
                obj.position.x === window.targets[0].x && 
                obj.position.z === window.targets[0].z
            ));
            window.targets.shift();
        }
    });

    socket.on('gameOver', (winner) => {
        if (!window.gameEnded()) {
            window.gameOver();
            window.gameEnded();
            document.getElementById('gameScreen').style.display = 'none';
            document.getElementById('nameScreen').style.display = 'flex';
            resetGameState();
            if (window.mode === 'world') socket.emit('leaveWorld');
            else if (window.mode === 'room' && window.roomName) socket.emit('leaveRoom', { roomName: window.roomName });
        }
    });

    socket.on('gameEnd', ({ players }) => {
        if (!window.gameEnded()) {
            window.gameOver();
            window.gameEnded();
            document.getElementById('gameScreen').style.display = 'none';
            document.getElementById('nameScreen').style.display = 'flex';
            resetGameState();
            if (window.mode === 'world') socket.emit('leaveWorld');
            else if (window.mode === 'room' && window.roomName) socket.emit('leaveRoom', { roomName: window.roomName });
        }
    });

    socket.on('showLeaderboard', ({ players }) => {
        console.log('showLeaderboard recebido:', players);
        window.gameOver();
        window.gameEnded = () => true; // Forçar gameEnded como true
        document.getElementById('gameScreen').style.display = 'none';
        document.getElementById('leaderboardScreen').style.display = 'block';
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
            }
        }, 1000);
    });

    socket.on('gameReset', ({ state }) => {
        console.log('gameReset recebido:', state);
        document.getElementById('leaderboardScreen').style.display = 'none';
        document.getElementById('gameScreen').style.display = 'block';

        window.gameOver = false;
        window.gameEnded = () => false; // Resetar gameEnded
        window.setTargets(state.targets || []);
        window.lastTargetMoveTime = state.lastTargetMoveTime || Date.now();

        // Remover todos os balões e marcas existentes
        window.scene.children.filter(obj => obj instanceof THREE.Group || obj.userData.type === 'marker' || obj.userData.type === 'tail').forEach(obj => window.scene.remove(obj));
        window.setMarkers([]);
        window.setOtherPlayers({});

        // Recriar balão do jogador
        const playerName = document.getElementById('playerName').value || 'Jogador';
        window.setBalloon(window.createBalloon(window.balloonColor, playerName));
        if (window.balloon) {
            window.balloon.position.set(state.players[socket.id].x, state.players[socket.id].y, state.players[socket.id].z);
            window.scene.add(window.balloon);
        }

        // Recriar balões dos outros jogadores/bots com posições randomizadas
        for (const id in state.players) {
            if (id !== socket.id && state.players[id].color) {
                const otherBalloon = window.createBalloon(state.players[id].color, state.players[id].name);
                otherBalloon.position.set(state.players[id].x, state.players[id].y, state.players[id].z);
                window.otherPlayers[id] = otherBalloon;
                window.scene.add(otherBalloon);
            }
        }

        // Recriar alvos
        if (Array.isArray(window.targets)) {
            window.targets.forEach(target => {
                const targetMesh = window.createTarget(target.x, target.z);
                window.scene.add(targetMesh);
            });
        }

        window.markersLeft = 5;
        document.getElementById('points').textContent = '0';
        document.getElementById('markersLeft').textContent = window.markersLeft;
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
        window.isCreator = false;
    }
}