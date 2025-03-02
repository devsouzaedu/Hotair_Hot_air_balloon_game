export function initSocket() {
    window.socket = io('https://hotair-backend.onrender.com');
    const socket = window.socket;

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
        document.getElementById('lobbyScreen').style.display = 'none';
        document.getElementById('gameScreen').style.display = 'block';
        document.getElementById('countdown').textContent = '';
        window.setTargets(state.targets);
        window.lastTargetMoveTime = state.lastTargetMoveTime || Date.now();
        window.targets.forEach(target => {
            const targetMesh = window.createTarget(target.x, target.z);
            window.scene.add(targetMesh);
        });
        window.setBalloon(window.createBalloon(window.balloonColor, document.getElementById('playerName').value));
        window.scene.add(window.balloon);
        document.getElementById('playerNameDisplay').textContent = document.getElementById('playerName').value;
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

    socket.on('gameUpdate', ({ state, timeLeft }) => {
        const currentState = window.mode === 'world' ? state : state;

        if (state.targets && (state.targets[0].x !== window.targets[0]?.x || state.targets[0].z !== window.targets[0]?.z)) {
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

        const timeSinceLastMove = (Date.now() - window.lastTargetMoveTime) / 1000;
        const timeUntilNextMove = Math.max(60 - timeSinceLastMove, 0);
        document.getElementById('targetMoveTimer').textContent = `Próxima mudança de alvo: ${Math.floor(timeUntilNextMove)}s`;

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

        document.getElementById('markersLeft').textContent = currentState.players[socket.id]?.markers || 3;
        document.getElementById('points').textContent = currentState.players[socket.id]?.score || 0;
        const minutes = Math.floor(timeLeft / 60);
        const seconds = Math.floor(timeLeft % 60);
        document.getElementById('timerDisplay').textContent = `Tempo Restante: ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    });

    socket.on('markerDropped', ({ playerId, x, y, z, markers, score }) => {
        if (playerId === socket.id) {
            document.getElementById('markersLeft').textContent = markers;
            document.getElementById('points').textContent = score;
            window.markerDropped = true;
        }
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
        if (!window.gameEnded()) {
            window.gameOver();
            window.gameEnded();
            document.getElementById('gameScreen').style.display = 'none';
            document.getElementById('leaderboardScreen').style.display = 'flex';
            const leaderboardList = document.getElementById('leaderboardList');
            leaderboardList.innerHTML = '';
            const sortedPlayers = Object.values(players).sort((a, b) => b.score - a.score);
            sortedPlayers.forEach((player, index) => {
                const playerDiv = document.createElement('div');
                playerDiv.textContent = `${index + 1}. ${player.name} - ${player.score} pontos`;
                leaderboardList.appendChild(playerDiv);
            });
        }
    });

    socket.on('gameState', ({ mode: gameMode, state }) => {
        if (gameMode === 'world') {
            window.setTargets(state.targets);
            window.lastTargetMoveTime = state.lastTargetMoveTime || Date.now();
            window.targets.forEach(target => {
                const targetMesh = window.createTarget(target.x, target.z);
                window.scene.add(targetMesh);
            });
            window.setBalloon(window.createBalloon(window.balloonColor, document.getElementById('playerName').value));
            window.scene.add(window.balloon);
            document.getElementById('playerNameDisplay').textContent = document.getElementById('playerName').value;
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

    socket.on('gameReset', ({ state }) => {
        document.getElementById('leaderboardScreen').style.display = 'none';
        document.getElementById('gameScreen').style.display = 'block';

        window.gameOver = false;
        window.gameEnded = false;
        window.setTargets(state.targets);
        window.lastTargetMoveTime = state.lastTargetMoveTime || Date.now();
        window.scene.remove(window.balloon);
        window.setBalloon(window.createBalloon(window.balloonColor, document.getElementById('playerName').value));
        window.balloon.position.set(0, 100, 0);
        window.scene.add(window.balloon);
        document.getElementById('points').textContent = '0';
        document.getElementById('markersLeft').textContent = '3';

        window.scene.children.filter(obj => obj instanceof THREE.Group && obj.position.y === 0.1).forEach(obj => window.scene.remove(obj));
        window.targets.forEach(target => {
            const targetMesh = window.createTarget(target.x, target.z);
            window.scene.add(targetMesh);
        });

        window.markers.forEach(({ marker, tail }) => {
            window.scene.remove(marker);
            window.scene.remove(tail);
        });
        window.setMarkers([]);
    });

    function resetGameState() {
        window.gameStarted = false;
        window.markerDropped = false;
        if (window.balloon) {
            window.scene.remove(window.balloon);
            window.setBalloon(null);
        }
        window.setTargets([]);
        window.setMarkers([]);
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