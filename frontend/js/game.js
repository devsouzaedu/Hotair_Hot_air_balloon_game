console.log('game.js carregado');
export function initGame() {
    let balloon;
    let marker, tail;
    let altitude = 100;
    window.markerDropped = false;
    window.markersLeft = 5;
    let points = 0;
    let bestScore = localStorage.getItem('bestScore') || 0;
    let gameStarted = false;
    let hasLiftedOff = false;
    let gameOver = false;
    let lastTime = performance.now();
    let frameCount = 0;
    let fps = 0;
    let isMobile = detectMobile();
    window.targets = [];
    window.otherPlayers = {};
    window.markers = window.markers || [];
    let lastTargetMoveTime = Date.now();
    let gameEnded = false;
    let targetPosition = { x: 0, y: 100, z: 0 };

    const windLayers = [
        { minAlt: 0, maxAlt: 100, direction: { x: 0, z: 0 }, speed: 0, name: "Nenhum" },
        { minAlt: 100, maxAlt: 200, direction: { x: 1, z: 0 }, speed: 4.0, name: "Leste" },
        { minAlt: 200, maxAlt: 350, direction: { x: -1, z: 0 }, speed: 5.0, name: "Oeste" },
        { minAlt: 350, maxAlt: 500, direction: { x: 0, z: -1 }, speed: 6.0, name: "Norte" }
    ];

    const keys = { W: false, S: false, A: false, D: false, U: false, SHIFT_RIGHT: false };

    const bestScoreElement = document.getElementById('bestScore');
    if (bestScoreElement) bestScoreElement.textContent = bestScore;

    const markersLeftElement = document.getElementById('markersLeft');
    if (markersLeftElement) markersLeftElement.textContent = window.markersLeft;

    const mobileControls = document.getElementById('mobileControls');
    const controlsInfo = document.getElementById('controlsInfo');
    if (isMobile) {
        if (mobileControls) mobileControls.style.display = 'flex';
        if (controlsInfo) controlsInfo.textContent = 'Use os botões para jogar';
    }

    function detectMobile() {
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        return /android|iPhone|iPad|iPod|windows phone/i.test(userAgent);
    }

    function initThreeJS() {
        console.log('Inicializando Three.js');
        window.scene = new THREE.Scene();
        window.scene.background = new THREE.Color(0x87CEEB);
    
        // Configurações baseadas no dispositivo
        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        window.qualitySettings = {
            drawDistance: isMobileDevice ? 1000 : 2000,
            shadowsEnabled: false,
            maxSpectators: isMobileDevice ? 50 : 100,
            geometryDetail: isMobileDevice ? 6 : 12,
            updateRate: isMobileDevice ? 1000/30 : 1000/60
        };
    
        // Configuração da câmera
        window.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, window.qualitySettings.drawDistance);
        window.camera.position.set(0, 100, 100);
        window.camera.lookAt(0, 0, 0);
    
        // Configurações do renderer
        window.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            powerPreference: "high-performance"
        });
        window.renderer.setSize(window.innerWidth, window.innerHeight);
        window.renderer.setPixelRatio(window.devicePixelRatio);
        window.renderer.shadowMap.enabled = true;
        document.getElementById('gameScreen').appendChild(window.renderer.domElement);
    
        // Luzes
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        window.scene.add(ambientLight);
    
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(100, 150, 50);
        window.scene.add(directionalLight);
    
        // Criar chão e arquibancada
        const { ground, gridHelper } = createGround();
        window.scene.add(ground);
        window.scene.add(gridHelper);
    
        // Geometrias compartilhadas
        window.sharedGeometries = {
            sphere: new THREE.SphereGeometry(4.5, 16, 16),
            box: new THREE.BoxGeometry(15, 12, 15),
            balloon: new THREE.SphereGeometry(30, 16, 16)
        };
    
        // Materiais compartilhados
        window.sharedMaterials = {
            blue: new THREE.MeshLambertMaterial({ color: 0x0000FF }),
            brown: new THREE.MeshLambertMaterial({ color: 0x8B4513 }),
            white: new THREE.MeshLambertMaterial({ color: 0xFFFFFF })
        };
    
        // Sistema de oclusão
        window.frustum = new THREE.Frustum();
        window.cameraViewProjectionMatrix = new THREE.Matrix4();
    
        // Event listeners
        window.addEventListener('resize', onWindowResize);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
    
        // Inicializar sistema de pooling
        window.objectPool = {
            markers: [],
            tails: []
        };
    
        // Pre-alocar pool de objetos
        for (let i = 0; i < 10; i++) {
            const markerMesh = new THREE.Mesh(window.sharedGeometries.sphere, window.sharedMaterials.blue);
            markerMesh.visible = false;
            window.scene.add(markerMesh);
            window.objectPool.markers.push(markerMesh);
    
            const tailGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, -45, 0)
            ]);
            const tailMesh = new THREE.Line(tailGeometry, new THREE.LineBasicMaterial({ color: 0xFFFFFF }));
            tailMesh.visible = false;
            window.scene.add(tailMesh);
            window.objectPool.tails.push(tailMesh);
        }
    
        window.domElements = {
            altitude: document.getElementById('altitude'),
            windDirection: document.getElementById('windDirection'),
            windSpeed: document.getElementById('windSpeed'),
            fpsCount: document.getElementById('fpsCount'),
            distanceToTarget: document.getElementById('distanceToTarget'),
            gameScreen: document.getElementById('gameScreen')
        };
    
        window.lastUIUpdate = 0;
        window.lastServerSync = 0;
        window.frameTime = 0;
        window.performanceMetrics = {
            fps: 0,
            frameTime: 0,
            objectsRendered: 0
        };
    }

    function createGround() {
        // Criar o chão
        const groundGeometry = new THREE.PlaneGeometry(2600, 2600, 50, 50);
        const groundMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x2ecc71,
            side: THREE.DoubleSide
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = Math.PI / 2;
        ground.position.y = 0;
        ground.receiveShadow = true;

        // Grid helper para melhor visualização
        const gridHelper = new THREE.GridHelper(2600, 52, 0x3498db, 0x2980b9);
        gridHelper.position.y = 0.1;

        // Criar arquibancada
        const bleacherGeometry = new THREE.BoxGeometry(100, 10, 500);
        const bleacherMaterial = new THREE.MeshLambertMaterial({ color: 0xe74c3c });
        const bleacher = new THREE.Mesh(bleacherGeometry, bleacherMaterial);
        bleacher.position.set(-1200, 25, 0);
        window.scene.add(bleacher);

        // Criar espectadores
        const spectatorGeometry = new THREE.SphereGeometry(5, 8, 8);
        const spectatorMaterial = new THREE.MeshLambertMaterial({ color: 0xf1c40f });
        for (let i = 0; i < 100; i++) {
            const spectator = new THREE.Mesh(spectatorGeometry, spectatorMaterial);
            const x = -1200 + (Math.random() * 80 - 40);
            const y = 35 + (Math.random() * 20);
            const z = Math.random() * 480 - 240;
            spectator.position.set(x, y, z);
            window.scene.add(spectator);
        }

        // Criar decorações
        createDecorations();

        return { ground, gridHelper };
    }

    function createDecorations() {
        const decorationGroup = new THREE.Group();

        // Quiosque
        const kioskGeometry = new THREE.BoxGeometry(20, 30, 20);
        const kioskMaterial = new THREE.MeshPhongMaterial({ color: 0x9b59b6 }); // Roxo vivo
        const kiosk = new THREE.Mesh(kioskGeometry, kioskMaterial);
        kiosk.position.set(150, 15, 150);
        decorationGroup.add(kiosk);

        // Torre
        const towerGeometry = new THREE.CylinderGeometry(5, 8, 60, 8);
        const towerMaterial = new THREE.MeshPhongMaterial({ color: 0xe67e22 }); // Laranja vivo
        const tower = new THREE.Mesh(towerGeometry, towerMaterial);
        tower.position.set(-150, 30, -150);
        decorationGroup.add(tower);

        return decorationGroup;
    }

    function createTarget(x, z) {
        const targetGeometry = new THREE.RingGeometry(35, 40, 32);
        const targetMaterial = new THREE.MeshBasicMaterial({ color: 0xFF0000, side: THREE.DoubleSide });
        const targetMesh = new THREE.Mesh(targetGeometry, targetMaterial);
        targetMesh.rotation.x = Math.PI / 2;
        targetMesh.position.set(x, 0, z);

        const centerGeometry = new THREE.CircleGeometry(5, 32);
        const centerMaterial = new THREE.MeshBasicMaterial({ color: 0xFF0000, side: THREE.DoubleSide });
        const centerMesh = new THREE.Mesh(centerGeometry, centerMaterial);
        centerMesh.rotation.x = Math.PI / 2;
        centerMesh.position.set(x, 1, z);

        const targetGroup = new THREE.Group();
        targetGroup.add(targetMesh);
        targetGroup.add(centerMesh);
        return targetGroup;
    }

    function handleKeyDown(event) {
        if (!gameStarted || gameOver) return;
        console.log('Tecla pressionada:', event.code); // Depuração
        switch(event.code) {
            case 'KeyW': keys.W = true; break;
            case 'KeyS': keys.S = true; break;
            case 'KeyA': keys.A = true; break;
            case 'KeyD': keys.D = true; break;
            case 'KeyU': keys.U = true; break;
            case 'ShiftRight': 
                if (!window.markerDropped && window.markersLeft > 0) dropMarker();
                break;
        }
    }

    function handleKeyUp(event) {
        console.log('Tecla solta:', event.code); // Depuração
        switch(event.code) {
            case 'KeyW': keys.W = false; break;
            case 'KeyS': keys.S = false; break;
            case 'KeyA': keys.A = false; break;
            case 'KeyD': keys.D = false; break;
            case 'KeyU': keys.U = false; break;
        }
    }

    // Sistema de pooling de objetos
    const ObjectPool = {
        getMarker: function() {
            return window.objectPool.markers.find(marker => !marker.visible) || this.createMarker();
        },
        getTail: function() {
            return window.objectPool.tails.find(tail => !tail.visible) || this.createTail();
        },
        createMarker: function() {
            const marker = new THREE.Mesh(window.sharedGeometries.sphere, window.sharedMaterials.blue);
            marker.visible = false;
            window.scene.add(marker);
            window.objectPool.markers.push(marker);
            return marker;
        },
        createTail: function() {
            const tailGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, -45, 0)
            ]);
            const tail = new THREE.Line(tailGeometry, new THREE.LineBasicMaterial({ color: 0xFFFFFF }));
            tail.visible = false;
            window.scene.add(tail);
            window.objectPool.tails.push(tail);
            return tail;
        },
        reset: function() {
            window.objectPool.markers.forEach(marker => {
                marker.visible = false;
                marker.position.set(0, 0, 0);
            });
            window.objectPool.tails.forEach(tail => {
                tail.visible = false;
                tail.position.set(0, 0, 0);
            });
        }
    };

    function dropMarker() {
        if (!window.balloon || !window.socket) return;
        
        const markerStartPos = { 
            x: window.balloon.position.x, 
            y: window.balloon.position.y - 10, 
            z: window.balloon.position.z 
        };
        const markerId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        // Obter marker e tail do pool
        const markerMesh = ObjectPool.getMarker();
        const tailMesh = ObjectPool.getTail();
        
        markerMesh.userData = { 
            playerId: window.socket.id, 
            type: 'marker', 
            markerId, 
            falling: true 
        };
        tailMesh.userData = { 
            playerId: window.socket.id, 
            type: 'tail', 
            markerId 
        };
        
        markerMesh.position.set(markerStartPos.x, markerStartPos.y, markerStartPos.z);
        tailMesh.position.set(markerStartPos.x, markerStartPos.y, markerStartPos.z);
        markerMesh.visible = true;
        tailMesh.visible = true;
        
        window.markers.push({ 
            marker: markerMesh, 
            tail: tailMesh, 
            playerId: window.socket.id, 
            startY: markerStartPos.y 
        });

        window.socket.emit('dropMarker', { 
            x: markerStartPos.x, 
            y: markerStartPos.y, 
            z: markerStartPos.z, 
            mode: window.mode || 'world',
            roomName: window.roomName || null,
            markerId
        });
        window.markerDropped = true;
    }

    function showNoMarkersMessage() {
        const message = document.createElement('div');
        message.textContent = "Suas marcas acabaram";
        message.style.position = 'absolute';
        message.style.top = '50%';
        message.style.left = '50%';
        message.style.transform = 'translate(-50%, -50%)';
        message.style.color = 'white';
        message.style.fontSize = '2em';
        message.style.background = 'rgba(0,0,0,0.7)';
        message.style.padding = '10px 20px';
        message.style.borderRadius = '5px';
        message.style.zIndex = '1001';
        message.style.animation = 'fadeOut 3s forwards';
        document.getElementById('gameScreen').appendChild(message);

        const styleSheet = document.styleSheets[0];
        styleSheet.insertRule(`
            @keyframes fadeOut {
                0% { opacity: 1; }
                80% { opacity: 1; }
                100% { opacity: 0; }
            }
        `, styleSheet.cssRules.length);

        setTimeout(() => message.remove(), 3000);
    }

    function getCurrentWindLayer() {
        for (let i = 0; i < windLayers.length; i++) {
            if (altitude >= windLayers[i].minAlt && altitude < windLayers[i].maxAlt) return i;
        }
        return 0;
    }

    function getWindDirectionText(layerIndex) {
        return windLayers[layerIndex].name;
    }

    function updateLayerIndicator(currentLayer) {
        for (let i = 1; i <= 4; i++) {
            const element = document.getElementById(`layer${i}`);
            if (element && i === currentLayer + 1) element.classList.add('active');
            else if (element) element.classList.remove('active');
        }
    }

    function onWindowResize() {
        if (window.camera) {
            window.camera.aspect = window.innerWidth / window.innerHeight;
            window.camera.updateProjectionMatrix();
        }
        if (window.renderer) {
            window.renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    function calculateDistanceToTarget() {
        if (window.targets.length > 0 && window.balloon) {
            const target = window.targets[0];
            const dx = window.balloon.position.x - target.x;
            const dz = window.balloon.position.z - target.z;
            return Math.sqrt(dx * dx + dz * dz).toFixed(1);
        }
        return 'N/A';
    }

    function updateGPS() {
        const gpsCanvas = document.getElementById('gpsCanvas');
        const gpsDirection = document.getElementById('gpsDirection');
        if (gpsCanvas && gpsDirection && window.balloon && window.targets.length > 0) {
            const ctx = gpsCanvas.getContext('2d');
            const target = window.targets[0];
            const mapSize = 2600;
            const canvasSize = gpsCanvas.width;
            const centerX = canvasSize / 2;
            const centerY = canvasSize / 2;

            // Normalizar posições com escala ajustada
            const scale = canvasSize / (mapSize / 2);
            const balloonX = centerX + (window.balloon.position.x / (mapSize / 2)) * (canvasSize / 4);
            const balloonZ = centerY + (window.balloon.position.z / (mapSize / 2)) * (canvasSize / 4);
            const targetX = centerX + (target.x / (mapSize / 2)) * (canvasSize / 4);
            const targetZ = centerY + (target.z / (mapSize / 2)) * (canvasSize / 4);

            // Clamping com margem
            const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
            const clampedBalloonX = clamp(balloonX, 5, canvasSize - 5);
            const clampedBalloonZ = clamp(balloonZ, 5, canvasSize - 5);
            const clampedTargetX = clamp(targetX, 5, canvasSize - 5);
            const clampedTargetZ = clamp(targetZ, 5, canvasSize - 5);

            // Limpar e desenhar
            ctx.clearRect(0, 0, gpsCanvas.width, gpsCanvas.height);
            ctx.beginPath();
            ctx.arc(clampedBalloonX, clampedBalloonZ, 3, 0, Math.PI * 2); // Raio 3
            ctx.fillStyle = 'blue';
            ctx.fill();
            ctx.closePath();
            ctx.beginPath();
            ctx.arc(clampedTargetX, clampedTargetZ, 3, 0, Math.PI * 2); // Raio 3
            ctx.fillStyle = 'red';
            ctx.fill();
            ctx.closePath();

            // Direção e distância
            const dx = target.x - window.balloon.position.x;
            const dz = target.z - window.balloon.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz).toFixed(1);
            const angle = Math.atan2(dz, dx) * (180 / Math.PI);
            const direction = getDirectionFromAngle(angle);
            gpsDirection.textContent = `Dir: ${direction} (${distance}m)`;
        }
    }

    function getDirectionFromAngle(angle) {
        angle = (angle + 360) % 360;
        if (angle >= 337.5 || angle < 22.5) return 'N';
        if (angle >= 22.5 && angle < 67.5) return 'NE';
        if (angle >= 67.5 && angle < 112.5) return 'E';
        if (angle >= 112.5 && angle < 157.5) return 'SE';
        if (angle >= 157.5 && angle < 202.5) return 'S';
        if (angle >= 202.5 && angle < 247.5) return 'SW';
        if (angle >= 247.5 && angle < 292.5) return 'W';
        if (angle >= 292.5 && angle < 337.5) return 'NW';
        return 'N';
    }

    window.restartGame = function() {
        gameOver = false;
        hasLiftedOff = false;
        altitude = 100;
        window.markerDropped = false;
        window.markersLeft = 5;
        points = 0;
        
        // Reset do pool de objetos
        ObjectPool.reset();
        
        document.getElementById('loseScreen').style.display = 'none';
        document.getElementById('gameScreen').style.display = 'block';
        
        if (window.balloon) window.scene.remove(window.balloon);
        window.balloon = window.createBalloon(
            window.balloonColor, 
            document.getElementById('playerNameDisplay').textContent || 'Jogador'
        );
        window.balloon.position.set(0, altitude, 0);
        window.scene.add(window.balloon);
        
        if (window.socket && window.socket.emit) {
            window.socket.emit('updatePosition', { 
                x: 0, 
                y: altitude, 
                z: 0, 
                mode: window.mode || 'world', 
                roomName: window.roomName || null 
            });
        }
        
        document.getElementById('markersLeft').textContent = window.markersLeft;
        
        // Limpar memória não utilizada
        if (window.renderer) {
            window.renderer.dispose();
            window.renderer.forceContextLoss();
            window.renderer.context = null;
            window.renderer.domElement = null;
        }
        
        // Garbage collection hint
        if (window.gc) window.gc();
    };

    function handleGamepad() {
        const gamepads = navigator.getGamepads();
        const gamepad = gamepads[0];
        if (gamepad) {
            const buttons = gamepad.buttons;
            if (buttons[0].pressed) keys.S = true; else if (!buttons[0].pressed && keys.S) keys.S = false;
            if (buttons[1].pressed && !window.markerDropped && window.markersLeft > 0) {
                if (!keys.SHIFT_RIGHT) { dropMarker(); keys.SHIFT_RIGHT = true; }
            } else if (!buttons[1].pressed) keys.SHIFT_RIGHT = false;
            if (buttons[2].pressed) keys.U = true; else if (!buttons[2].pressed && keys.U) keys.U = false;
            if (buttons[3].pressed) keys.W = true; else if (!buttons[3].pressed && keys.W) keys.W = false;
        }
    }

    function animate(time) {
        requestAnimationFrame(animate);
        if (!gameStarted || gameOver) return;

        if (!window.scene || !window.camera || !window.renderer || !balloon) {
            console.error('Erro na renderização: cena, câmera, renderer ou balão não inicializados');
            return;
        }

        // Calcular delta time para animações suaves
        const deltaTime = time - window.frameTime;
        window.frameTime = time;

        // Processar controles com delta time para movimento suave
        if (keys.W) altitude += 0.5 * (deltaTime / 16.67); hasLiftedOff = true;
        if (keys.U) altitude += 2.5 * (deltaTime / 16.67); hasLiftedOff = true;
        if (keys.S) altitude = Math.max(20, altitude - 0.5 * (deltaTime / 16.67));
        altitude = Math.min(altitude, 500);

        // Limitar renderização baseado nas configurações de qualidade
        if (time - lastTime >= window.qualitySettings.updateRate) {
            frameCount++;
            window.performanceMetrics.objectsRendered = 0;
            
            // Atualizar FPS e métricas a cada segundo
            if (time - lastTime >= 1000) {
                window.performanceMetrics.fps = frameCount;
                window.performanceMetrics.frameTime = deltaTime;
                frameCount = 0;
                lastTime = time;
            }

            // Atualizar posição do balão
            if (window.balloon) {
                window.balloon.position.y = altitude;
                
                if (window.socket && window.socket.emit && time - window.lastServerSync >= 100) {
                    window.socket.emit('updatePosition', {
                        x: window.balloon.position.x,
                        y: altitude,
                        z: window.balloon.position.z,
                        mode: window.mode || 'world',
                        roomName: window.roomName || null
                    });
                    window.lastServerSync = time;
                }

                if (window.targetPosition) {
                    window.balloon.position.x = window.targetPosition.x;
                    window.balloon.position.z = window.targetPosition.z;
                }
            }

            // Câmera seguindo o balão
            if (window.balloon) {
                window.camera.position.set(
                    window.balloon.position.x,
                    window.balloon.position.y + 200,
                    window.balloon.position.z + 200
                );
                window.camera.lookAt(window.balloon.position);
            }

            // Otimizar renderização com frustum culling
            window.camera.updateMatrixWorld();
            window.cameraViewProjectionMatrix.multiplyMatrices(
                window.camera.projectionMatrix,
                window.camera.matrixWorldInverse
            );
            window.frustum.setFromProjectionMatrix(window.cameraViewProjectionMatrix);

            // Atualizar UI com throttling
            if (time - window.lastUIUpdate >= 500) {
                const currentLayerIndex = getCurrentWindLayer();
                if (window.domElements.altitude) window.domElements.altitude.textContent = `${Math.floor(altitude)}m`;
                if (window.domElements.windDirection) window.domElements.windDirection.textContent = getWindDirectionText(currentLayerIndex);
                if (window.domElements.windSpeed) window.domElements.windSpeed.textContent = windLayers[currentLayerIndex].speed.toFixed(1);
                if (window.domElements.distanceToTarget) window.domElements.distanceToTarget.textContent = `Dist: ${calculateDistanceToTarget()}m`;
                if (window.domElements.fpsCount) window.domElements.fpsCount.textContent = `FPS: ${window.performanceMetrics.fps}`;
                
                updateLayerIndicator(currentLayerIndex);
                updateGPS();
                window.lastUIUpdate = time;
            }

            // Renderizar cena
            window.renderer.render(window.scene, window.camera);
        }
    }

    window.initGameScene = function(state) {
        console.log('Inicializando cena com state:', state);
        if (!window.scene) initThreeJS();

        window.scene.children.filter(obj => obj instanceof THREE.Group && obj.userData?.type === 'target').forEach(obj => window.scene.remove(obj));
        window.setTargets(state.targets || []);
        window.targets.forEach(target => {
            const targetMesh = window.createTarget(target.x, target.z);
            targetMesh.userData = { type: 'target' };
            window.scene.add(targetMesh);
        });

        const player = state.players[window.socket.id];
        if (player) {
            altitude = player.y;
            window.markersLeft = player.markers;
            points = player.score;
        
            const markersLeftElement = document.getElementById('markersLeft');
            if (markersLeftElement) markersLeftElement.textContent = window.markersLeft;

            const pointsElement = document.getElementById('points');
            if (pointsElement) pointsElement.textContent = points;

            const playerNameDisplay = document.getElementById('playerNameDisplay');
            if (playerNameDisplay) playerNameDisplay.textContent = player.name;

            if (!balloon || !window.scene.children.includes(balloon)) {
                balloon = window.createBalloon(player.color || window.balloonColor || '#FF4500', player.name);
                window.balloon = balloon;
                balloon.position.set(player.x, player.y, player.z);
                targetPosition = { x: player.x, y: player.y, z: player.z };
                window.scene.add(balloon);
            } else {
                balloon.position.set(player.x, player.y, player.z);
                targetPosition = { x: player.x, y: player.y, z: player.z };
            }
        }
        
        window.setOtherPlayers({});
        for (const id in state.players) {
            if (id !== window.socket.id && state.players[id].color) {
                const otherBalloon = window.createBalloon(state.players[id].color, state.players[id].name);
                otherBalloon.position.set(state.players[id].x, state.players[id].y, state.players[id].z);
                window.otherPlayers[id] = otherBalloon;
                window.scene.add(otherBalloon);
            }
        }

        window.setMarkers([]);
        for (const markerId in state.markers) {
            const markerData = state.markers[markerId];
            const markerMesh = new THREE.Mesh(
                new THREE.SphereGeometry(4.5, 16, 16),
                new THREE.MeshLambertMaterial({ color: 0x0000FF })
            );
            const tailMesh = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -45, 0)]),
                new THREE.LineBasicMaterial({ color: 0xFFFFFF })
            );
            markerMesh.userData = { playerId: markerData.playerId, type: 'marker', markerId, falling: markerData.falling || false };
            tailMesh.userData = { playerId: markerData.playerId, type: 'tail', markerId };
            markerMesh.position.set(markerData.x, markerData.y, markerData.z);
            tailMesh.position.set(markerData.x, markerData.y, markerData.z);
            window.scene.add(markerMesh);
            window.scene.add(tailMesh);
            window.markers.push({ marker: markerMesh, tail: tailMesh, playerId: markerData.playerId });
        }

        window.lastTargetMoveTime = state.lastTargetMoveTime || Date.now();
        gameStarted = true;
        animate(performance.now());
    };

    // Expor funções necessárias globalmente
    window.createTarget = createTarget;
    window.createBalloon = createBalloon;
    window.setTargets = (targets) => { window.targets = targets; };
    window.setMarkers = (markers) => { window.markers = markers; };
    window.setOtherPlayers = (players) => { window.otherPlayers = players; };
    window.setBalloon = (newBalloon) => { balloon = newBalloon; window.balloon = newBalloon; };
    window.showNoMarkersMessage = showNoMarkersMessage;
    window.gameStarted = () => { gameStarted = true; };
    window.gameOver = () => { gameOver = true; };
    window.initGameScene = initGameScene;

    window.addEventListener('gamepadconnected', (e) => {});
    window.addEventListener('gamepaddisconnected', (e) => {});

    window.gameEnded = gameEnded;
}

// Função de throttle para otimizar event listeners
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

// Função para verificar se um objeto está visível na câmera
function isInViewFrustum(object) {
    window.camera.updateMatrixWorld();
    window.cameraViewProjectionMatrix.multiplyMatrices(
        window.camera.projectionMatrix,
        window.camera.matrixWorldInverse
    );
    window.frustum.setFromProjectionMatrix(window.cameraViewProjectionMatrix);
    return window.frustum.containsPoint(object.position);
}