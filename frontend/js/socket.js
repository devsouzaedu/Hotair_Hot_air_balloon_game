export function initSocket() {
    console.log('Iniciando socket...');
    
    // Verifica se o Socket.IO está carregado
    if (typeof io === 'undefined') {
        console.error('Socket.IO não foi carregado corretamente. Tentando carregar novamente...');
        
        // Tenta carregar o Socket.IO novamente
        const script = document.createElement('script');
        script.src = 'https://hotair-backend.onrender.com/socket.io/socket.io.js';
        script.onload = function() {
            console.log('Socket.IO carregado com sucesso após nova tentativa.');
            // Chama a função novamente após o carregamento
            setTimeout(initSocket, 500);
        };
        script.onerror = function() {
            console.error('Falha ao carregar o Socket.IO mesmo após nova tentativa.');
            alert('Erro ao carregar o Socket.IO. Por favor, recarregue a página.');
        };
        document.head.appendChild(script);
        return;
    }

    // Pega o token do localStorage
    const token = localStorage.getItem('jwtToken');
    if (!token) {
        console.warn('Nenhum token JWT encontrado no localStorage. A conexão socket pode não funcionar corretamente.');
    }

    try {
        // Define a URL do backend para produção
        const backendUrl = 'https://hotair-backend.onrender.com';
        console.log('Conectando ao backend:', backendUrl);

        // Inicializa o socket com o token
        window.socket = io(backendUrl, {
            auth: {
                token: token // Envia o token no handshake
            },
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 10000 // Aumenta o timeout para 10 segundos
        });
        
        const socket = window.socket;

        // Verifica se o socket foi inicializado
        if (!socket) {
            throw new Error('Falha ao inicializar o socket.');
        }

        console.log('Socket inicializado com sucesso!');

        // Adiciona listeners para eventos de conexão
        socket.on('connect', () => {
            console.log('Conectado ao servidor socket com sucesso!');
        });

        socket.on('connect_error', (error) => {
            console.error('Erro ao conectar ao servidor socket:', error);
            // Tenta reconectar após 3 segundos
            setTimeout(() => {
                console.log('Tentando reconectar ao servidor...');
                socket.connect();
            }, 3000);
        });

        socket.on('disconnect', (reason) => {
            console.warn('Desconectado do servidor socket. Razão:', reason);
            if (reason === 'io server disconnect') {
                // O servidor forçou a desconexão
                console.log('Tentando reconectar ao servidor...');
                socket.connect();
            }
        });

        // Declaração global dentro da função initSocket para banner e bannerText
        const banner = document.getElementById('banner');
        const bannerText = document.getElementById('bannerText');

        // Verifica se os elementos do banner existem no DOM
        if (!banner || !bannerText) {
            console.warn('Elementos banner ou bannerText não encontrados no DOM! Verifique o index.html.');
        } else {
            // Confirma que os elementos foram inicializados
            console.log('Banner e bannerText inicializados com sucesso.');
        }

        // Inicializa variáveis globais
        window.markers = window.markers || [];
        window.targets = window.targets || [];
        window.otherPlayers = window.otherPlayers || {};
        window.balloonColor = window.balloonColor || '#FF4500';
        window.markersLeft = 5;
        
        // Armazenar o estado do jogo recebido do backend
        window.worldState = null;
        window.roomState = null;

        // Evento de sala criada
        socket.on('roomCreated', ({ roomName, creator }) => {
            window.roomName = roomName;
            window.isCreator = (creator === socket.id);
            document.getElementById('roomScreen').style.display = 'none';
            document.getElementById('colorScreen').style.display = 'flex';
            socket.emit('setColor', { roomName, color: null });
        });

        // Evento de erro de sala
        socket.on('roomError', (msg) => {
            alert(msg);
            document.getElementById('colorScreen').style.display = 'none';
            document.getElementById('roomScreen').style.display = 'flex';
        });

        // Evento de jogador entrando
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

        // Evento de jogador saindo
        socket.on('playerLeft', (id) => {
            if (window.otherPlayers[id]) {
                window.scene.remove(window.otherPlayers[id]);
                delete window.otherPlayers[id];
            }
        });

        // Evento de sala fechada
        socket.on('roomClosed', () => {
            alert('O criador da sala saiu. A sala foi fechada.');
            document.getElementById('lobbyScreen').style.display = 'none';
            document.getElementById('nameScreen').style.display = 'flex';
            resetGameState();
        });

        // Evento de contagem regressiva
        socket.on('countdown', (count) => {
            document.getElementById('countdown').textContent = count > 0 ? count : 'GO!';
        });

        // Evento de início do jogo
        socket.on('startGame', ({ state }) => {
            console.log('startGame recebido:', state);
            // Armazenar o estado da sala
            window.roomState = state;
            
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
            const playerName = localStorage.getItem('playerName') || 'Jogador';
            window.setBalloon(window.createBalloon(window.balloonColor, playerName));
            if (window.balloon) {
                console.log('Adicionando balão à cena:', window.balloon);
                window.balloon.position.set(0, 100, 0);
                window.scene.add(window.balloon);
                
                // Garantir que o nome do jogador seja adicionado
                if (typeof window.createPlayerNameBillboard === 'function') {
                    window.createPlayerNameBillboard(playerName, window.balloon, { x: 0, y: 40, z: 0 });
                }
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
            
            // Inicializar o estado do jogo
            if (typeof window.initGameState === 'function') {
                window.initGameState(state);
            }
        });

        // Evento de estado do jogo
        socket.on('gameState', ({ mode: gameMode, state }) => {
            console.log('gameState recebido:', state);
            // Armazenar o estado do mundo
            window.worldState = state;
            
            if (gameMode === 'world') {
                console.log('Modo world detectado, exibindo banner');
                document.getElementById('colorScreen').style.display = 'none';
                document.getElementById('gameScreen').style.display = 'block';
                banner.style.display = 'block';
                bannerText.textContent = '🏆 Campeões do dia! Hajime 1º com 83,3k pontos 🥇, Gladson 2º com 22,5k pontos 🥈, Murilo Souza 3º com 22,4k pontos 🥉 - Divulgue aqui!';
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
                const playerName = localStorage.getItem('playerName') || 'Jogador';
                window.setBalloon(window.createBalloon(window.balloonColor, playerName));
                if (window.balloon) {
                    console.log('Adicionando balão à cena via gameState:', window.balloon);
                    window.balloon.position.set(0, 100, 0);
                    window.scene.add(window.balloon);
                    
                    // Garantir que o nome do jogador seja adicionado
                    if (typeof window.createPlayerNameBillboard === 'function') {
                        window.createPlayerNameBillboard(playerName, window.balloon, { x: 0, y: 40, z: 0 });
                    }
                } else {
                    console.error('Falha ao criar balão do jogador em gameState');
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
                
                // Inicializar o estado do jogo
                if (typeof window.initGameState === 'function') {
                    window.initGameState(state);
                }
            }
        });

        // Evento de atualização do jogo
        socket.on('gameUpdate', ({ state, timeLeft }) => {
            // Armazenar o estado do jogo
            if (window.mode === 'world') {
                window.worldState = state;
            } else {
                window.roomState = state;
            }
            
            // Inicializar o estado do jogo
            if (typeof window.initGameState === 'function') {
                window.initGameState(state);
            }
            
            const currentState = window.mode === 'world' ? state : state;
            if (state.targets && Array.isArray(state.targets) && 
                (!window.targets.length || state.targets[0].x !== window.targets[0]?.x || state.targets[0].z !== window.targets[0]?.z)) {
                window.lastTargetMoveTime = Date.now();
                if (window.scene && window.scene.children) {
                    window.scene.children.filter(obj => 
                        obj instanceof THREE.Group && 
                        obj.position.x === window.targets[0]?.x && 
                        obj.position.z === window.targets[0]?.z
                    ).forEach(obj => window.scene.remove(obj));
                }
                window.setTargets(state.targets);
                const newTargetMesh = window.createTarget(window.targets[0].x, window.targets[0].z);
                if (window.scene) window.scene.add(newTargetMesh);
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

        // Evento de marcador solto
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
            } else {
                const markerEntry = window.markers.find(m => m.marker.userData.markerId === markerId);
                if (!markerEntry) {
                    const marker = new THREE.Mesh(new THREE.SphereGeometry(4.5, 16, 16), new THREE.MeshLambertMaterial({ color: 0x0000FF }));
                    const tail = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -45, 0)]), new THREE.LineBasicMaterial({ color: 0xFFFFFF }));
                    marker.userData = { playerId, type: 'marker', markerId };
                    tail.userData = { playerId, type: 'tail', markerId };
                    marker.position.set(x, y, z);
                    tail.position.set(x, y, z);
                    window.scene.add(marker);
                    window.scene.add(tail);
                    window.markers.push({ marker, tail, playerId, markerId });
                }
            }
        });

        // Evento de marcador no chão
        socket.on('markerLanded', ({ x, y, z, playerId, markerId }) => {
            console.log('Marcador pousou em:', { x, y, z }, 'por:', playerId);
            let markerEntry = window.markers.find(m => m.marker.userData.markerId === markerId);
            
            if (!markerEntry) {
                const marker = new THREE.Mesh(new THREE.SphereGeometry(4.5, 16, 16), new THREE.MeshLambertMaterial({ color: 0x0000FF }));
                const tail = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -45, 0)]), new THREE.LineBasicMaterial({ color: 0xFFFFFF }));
                marker.userData = { playerId, type: 'marker', markerId };
                tail.userData = { playerId, type: 'tail', markerId };
                if (window.scene) {
                    window.scene.add(marker);
                    window.scene.add(tail);
                } else {
                    console.error('window.scene não está definido ao adicionar marcador');
                }
                markerEntry = { marker, tail, playerId };
                window.markers.push(markerEntry);
            }
        
            if (markerEntry.marker && markerEntry.tail) {
                markerEntry.marker.position.set(x, y, z);
                markerEntry.tail.position.set(x, y, z);
            } else {
                console.error(`Marcador ou cauda não encontrados para markerId: ${markerId}`);
            }
        });

        // Evento de alvo atingido
        socket.on('targetHitUpdate', ({ targetIndex, playerId, score }) => {
            if (playerId === socket.id) {
                window.updatePoints(score); // Atualiza os pontos na UI
            }
            if (targetIndex < 1) {
                const targetToRemove = window.scene.children.find(obj => 
                    obj instanceof THREE.Group && 
                    obj.position.x === window.targets[0]?.x && 
                    obj.position.z === window.targets[0]?.z
                );
                if (targetToRemove) {
                    window.scene.remove(targetToRemove);
                }
                window.targets.shift();
            }
        });

        // Evento de fim de jogo (perdeu)
        socket.on('gameOver', (winner) => {
            if (!window.gameEnded) {
                window.gameOver();
                window.gameEnded = true;
                document.getElementById('gameScreen').style.display = 'none';
                document.getElementById('nameScreen').style.display = 'flex';
                banner.style.display = 'none'; // Esconde o banner
                resetGameState();
                if (window.mode === 'world') socket.emit('leaveWorld');
                else if (window.mode === 'room' && window.roomName) socket.emit('leaveRoom', { roomName: window.roomName });
            }
        });

        // Evento de fim de jogo (tempo esgotado)
        socket.on('gameEnd', ({ players }) => {
            if (!window.gameEnded) {
                window.gameOver();
                window.gameEnded = true;
                document.getElementById('gameScreen').style.display = 'none';
                document.getElementById('nameScreen').style.display = 'flex';
                banner.style.display = 'none'; // Esconde o banner
                resetGameState();
                if (window.mode === 'world') socket.emit('leaveWorld');
                else if (window.mode === 'room' && window.roomName) socket.emit('leaveRoom', { roomName: window.roomName });
            }
        });

        // Evento de exibir leaderboard
        socket.on('showLeaderboard', ({ players }) => {
            console.log('showLeaderboard recebido:', players);
            window.gameOver();
            window.gameEnded = true;
            document.getElementById('gameScreen').style.display = 'none';
            document.getElementById('loseScreen').style.display = 'none';
            document.getElementById('leaderboardScreen').style.display = 'block';
            banner.style.display = 'none'; // Esconde o banner
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

        // Evento de reset do jogo
        socket.on('gameReset', ({ state }) => {
            console.log('gameReset recebido:', state);
            
            // Atualizar o estado armazenado
            if (window.mode === 'world') {
                window.worldState = state;
            } else {
                window.roomState = state;
            }
            
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

            const playerName = localStorage.getItem('playerName') || 'Jogador';
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
            document.getElementById('markersLeft').textContent = window.markersLeft;
            document.getElementById('points').textContent = '0';
            
            // Inicializar o estado do jogo
            if (typeof window.initGameState === 'function') {
                window.initGameState(state);
            }
        });

        // Função para resetar o estado do jogo
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
    } catch (error) {
        console.error('Erro ao inicializar o socket:', error);
        // Tenta inicializar novamente após 3 segundos
        setTimeout(initSocket, 3000);
    }
}