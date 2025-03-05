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
        { minAlt: 100, maxAlt: 200, direction: { x: 1, z: 0 }, speed: 1.5, name: "Leste" },
        { minAlt: 200, maxAlt: 300, direction: { x: 0, z: 1 }, speed: 2.0, name: "Sul" },
        { minAlt: 300, maxAlt: 400, direction: { x: -1, z: 0 }, speed: 2.0, name: "Oeste" },
        { minAlt: 400, maxAlt: 500, direction: { x: 0, z: -1 }, speed: 3.0, name: "Norte" }
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
    
        window.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        window.camera.position.set(0, 150, 150); // Câmera mais perto
        window.camera.lookAt(0, 100, 0);
    
        window.renderer = new THREE.WebGLRenderer({ antialias: false }); // Desativar antialias para melhorar FPS
        window.renderer.setSize(window.innerWidth, window.innerHeight);
        document.getElementById('gameScreen').appendChild(window.renderer.domElement);
    
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        window.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(100, 150, 50); // Ajustado para câmera mais perto
        window.scene.add(directionalLight);
    
        createGround();
    
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        const markerGeometry = new THREE.SphereGeometry(4.5, 16, 16);
        const markerMaterial = new THREE.MeshLambertMaterial({ color: 0x0000FF });
        marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.visible = false;
        window.scene.add(marker);

        const tailGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, -45, 0)
        ]);
        const tailMaterial = new THREE.LineBasicMaterial({ color: 0xFFFFFF });
        tail = new THREE.Line(tailGeometry, tailMaterial);
        tail.visible = false;
        window.scene.add(tail);

        window.addEventListener('resize', onWindowResize);

        if (isMobile) {
            const upButton = document.getElementById('upButton');
            const turboButton = document.getElementById('turboButton');
            const downButton = document.getElementById('downButton');
            const dropButton = document.getElementById('dropButton');

            upButton.addEventListener('touchstart', (e) => { e.preventDefault(); keys.W = true; });
            upButton.addEventListener('touchend', () => keys.W = false);
            turboButton.addEventListener('touchstart', (e) => { e.preventDefault(); keys.U = true; });
            turboButton.addEventListener('touchend', () => keys.U = false);
            downButton.addEventListener('touchstart', (e) => { e.preventDefault(); keys.S = true; });
            downButton.addEventListener('touchend', () => keys.S = false);
            dropButton.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (!window.markerDropped && window.markersLeft > 0) dropMarker();
            });

            [upButton, turboButton, downButton, dropButton].forEach(button => {
                button.addEventListener('dblclick', (e) => e.preventDefault());
            });
        }
    }

    function createGround() {
        const mapSize = 2600;
        const groundGeometry = new THREE.PlaneGeometry(mapSize, mapSize, 50, 50);
        const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x7CFC00 });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        window.scene.add(ground);
    
        const gridHelper = new THREE.GridHelper(mapSize, 26, 0x000000, 0x000000);
        gridHelper.position.y = 0.1;
        gridHelper.material.opacity = 0.2;
        gridHelper.material.transparent = true;
        window.scene.add(gridHelper);
    
        const stepHeight = 10;
        const stepDepth = 20;
        const standMaterial = new THREE.MeshLambertMaterial({ color: 0x808080 });
    
        for (let i = 0; i < 6; i++) { // 6 fileiras
            const stepWidth = mapSize - (i * 20);
            const stepGeometry = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
            const step = new THREE.Mesh(stepGeometry, standMaterial);
            step.position.set(0, i * stepHeight + stepHeight / 2, mapSize / 2 + stepDepth / 2 + i * stepDepth);
            window.scene.add(step);
        }
    
        for (let i = 0; i < 6; i++) { // 6 fileiras
            const stepWidth = mapSize - (i * 20);
            const stepGeometry = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
            const step = new THREE.Mesh(stepGeometry, standMaterial);
            step.position.set(0, i * stepHeight + stepHeight / 2, -mapSize / 2 - stepDepth / 2 - i * stepDepth);
            window.scene.add(step);
        }
    
        for (let i = 0; i < 6; i++) { // 6 fileiras
            const stepLength = mapSize - (i * 20);
            const stepGeometry = new THREE.BoxGeometry(stepDepth, stepHeight, stepLength);
            const step = new THREE.Mesh(stepGeometry, standMaterial);
            step.position.set(mapSize / 2 + stepDepth / 2 + i * stepDepth, i * stepHeight + stepHeight / 2, 0);
            window.scene.add(step);
        }
    
        for (let i = 0; i < 6; i++) { // 6 fileiras
            const stepLength = mapSize - (i * 20);
            const stepGeometry = new THREE.BoxGeometry(stepDepth, stepHeight, stepLength);
            const step = new THREE.Mesh(stepGeometry, standMaterial);
            step.position.set(-mapSize / 2 - stepDepth / 2 - i * stepDepth, i * stepHeight + stepHeight / 2, 0);
            window.scene.add(step);
        }
    
        window.spectators = [];
        for (let i = 0; i < 6; i++) { // 6 fileiras
            const yPos = i * stepHeight + stepHeight;
            for (let x = -mapSize / 2 + 10; x < mapSize / 2 - 10; x += 10) { // Espaçamento de 10
                const npc = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 16), new THREE.MeshLambertMaterial({ color: 0xFF0000 }));
                npc.scale.y = 1.5;
                npc.position.set(x, yPos + 2, mapSize / 2 + stepDepth / 2 + i * stepDepth);
                window.spectators.push({ mesh: npc, baseY: yPos + 2, phase: Math.random() * Math.PI * 2 });
                window.scene.add(npc);
            }
            for (let x = -mapSize / 2 + 10; x < mapSize / 2 - 10; x += 10) {
                const npc = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 16), new THREE.MeshLambertMaterial({ color: 0xFF0000 }));
                npc.scale.y = 1.5;
                npc.position.set(x, yPos + 2, -mapSize / 2 - stepDepth / 2 - i * stepDepth);
                window.spectators.push({ mesh: npc, baseY: yPos + 2, phase: Math.random() * Math.PI * 2 });
                window.scene.add(npc);
            }
            for (let z = -mapSize / 2 + 10; z < mapSize / 2 - 10; z += 10) {
                const npc = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 16), new THREE.MeshLambertMaterial({ color: 0xFF0000 }));
                npc.scale.y = 1.5;
                npc.position.set(mapSize / 2 + stepDepth / 2 + i * stepDepth, yPos + 2, z);
                window.spectators.push({ mesh: npc, baseY: yPos + 2, phase: Math.random() * Math.PI * 2 });
                window.scene.add(npc);
            }
            for (let z = -mapSize / 2 + 10; z < mapSize / 2 - 10; z += 10) {
                const npc = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 16), new THREE.MeshLambertMaterial({ color: 0xFF0000 }));
                npc.scale.y = 1.5;
                npc.position.set(-mapSize / 2 - stepDepth / 2 - i * stepDepth, yPos + 2, z);
                window.spectators.push({ mesh: npc, baseY: yPos + 2, phase: Math.random() * Math.PI * 2 });
                window.scene.add(npc);
            }
        }

        for (let i = 0; i < 3; i++) {
            const house = new THREE.Mesh(new THREE.BoxGeometry(15, 15, 15), new THREE.MeshLambertMaterial({ color: 0x8B4513 }));
            house.position.set(Math.random() * (mapSize - 100) - (mapSize - 100) / 2, 7.5, Math.random() * (mapSize - 100) - (mapSize - 100) / 2);
            window.scene.add(house);
        }

        for (let i = 0; i < 5; i++) {
            const cow = new THREE.Mesh(new THREE.SphereGeometry(4.5, 16, 16), new THREE.MeshLambertMaterial({ color: 0xFFFFFF }));
            cow.position.set(Math.random() * (mapSize - 100) - (mapSize - 100) / 2, 2.25, Math.random() * (mapSize - 100) - (mapSize - 100) / 2);
            window.scene.add(cow);
        }

        for (let i = 0; i < 2; i++) {
            const road = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(Math.random() * (mapSize - 100) - (mapSize - 100) / 2, 0.2, Math.random() * (mapSize - 100) - (mapSize - 100) / 2),
                new THREE.Vector3(Math.random() * (mapSize - 100) - (mapSize - 100) / 2, 0.2, Math.random() * (mapSize - 100) - (mapSize - 100) / 2)
            ]), new THREE.LineBasicMaterial({ color: 0x808080 }));
            road.scale.set(1.5, 1, 1.5);
            window.scene.add(road);
        }
    }

    window.createBalloon = function(color, name) {
        color = color || '#FF4500';
        const group = new THREE.Group();
        const basket = new THREE.Mesh(new THREE.BoxGeometry(15, 12, 15), new THREE.MeshLambertMaterial({ color: 0x8B4513 }));
        basket.position.y = -15;
        group.add(basket);

        const balloonGeometry = new THREE.SphereGeometry(30, 32, 32);
        let balloonMaterial;
        if (color === 'rainbow') {
            balloonMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
            const colors = new Float32Array(balloonGeometry.attributes.position.count * 3);
            for (let i = 0; i < balloonGeometry.attributes.position.count; i++) {
                colors[i * 3] = Math.random();
                colors[i * 3 + 1] = Math.random();
                colors[i * 3 + 2] = Math.random();
            }
            balloonGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        } else {
            balloonMaterial = new THREE.MeshLambertMaterial({ color: parseInt(color.replace('#', '0x'), 16) });
        }
        const balloonMesh = new THREE.Mesh(balloonGeometry, balloonMaterial);
        balloonMesh.scale.y = 1.2;
        balloonMesh.position.y = 30;
        group.add(balloonMesh);

        for (let i = 0; i < 4; i++) {
            const x = (i % 2 === 0) ? -7.5 : 7.5;
            const z = (i < 2) ? -7.5 : 7.5;
            const rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(x, -10, z),
                new THREE.Vector3(x, 30, z)
            ]), new THREE.LineBasicMaterial({ color: 0x000000 }));
            group.add(rope);
        }

        new THREE.FontLoader().load('https://threejs.org/examples/fonts/optimer_regular.typeface.json', function(font) {
            const textMesh = new THREE.Mesh(new THREE.TextGeometry(name || 'Jogador', {
                font: font,
                size: 7,
                height: 1,
            }), new THREE.MeshBasicMaterial({ color: 0x000000 }));
            textMesh.position.set(-15, 80, 0);
            group.add(textMesh);
        }, undefined, function(error) {
            const fallbackMesh = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), new THREE.MeshBasicMaterial({ color: 0xFF0000 }));
            fallbackMesh.position.set(-15, 80, 0);
            group.add(fallbackMesh);
        });

        group.position.set(0, altitude, 0);
        return group;
    };

    window.createTarget = function(x, z) {
        const targetMesh = new THREE.Group();
        const material = new THREE.LineBasicMaterial({ color: 0xFF0000 });
        const line1 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-45, 0, -45),
            new THREE.Vector3(45, 0, 45)
        ]), material);
        targetMesh.add(line1);

        const line2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(45, 0, -45),
            new THREE.Vector3(-45, 0, 45)
        ]), material);
        targetMesh.add(line2);

        targetMesh.position.set(x, 0.1, z);
        return targetMesh;
    };

    function handleKeyDown(event) {
        if (!gameStarted || gameOver) return;
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
        switch(event.code) {
            case 'KeyW': keys.W = false; break;
            case 'KeyS': keys.S = false; break;
            case 'KeyA': keys.A = false; break;
            case 'KeyD': keys.D = false; break;
            case 'KeyU': keys.U = false; break;
        }
    }

    function dropMarker() {
        if (!window.balloon || !window.socket) return;
        const markerStartPos = { x: window.balloon.position.x, y: window.balloon.position.y - 10, z: window.balloon.position.z };
        const markerId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        const markerMesh = new THREE.Mesh(
            new THREE.SphereGeometry(4.5, 16, 16),
            new THREE.MeshLambertMaterial({ color: 0x0000FF })
        );
        const tailMesh = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -45, 0)]),
            new THREE.LineBasicMaterial({ color: 0xFFFFFF })
        );
        markerMesh.userData = { playerId: window.socket.id, type: 'marker', markerId, falling: true };
        tailMesh.userData = { playerId: window.socket.id, type: 'tail', markerId };
        markerMesh.position.set(markerStartPos.x, markerStartPos.y, markerStartPos.z);
        tailMesh.position.set(markerStartPos.x, markerStartPos.y, markerStartPos.z);
        
        window.scene.add(markerMesh);
        window.scene.add(tailMesh);
        window.markers.push({ marker: markerMesh, tail: tailMesh, playerId: window.socket.id, startY: markerStartPos.y });
    
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
        for (let i = 1; i <= 5; i++) {
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
        document.getElementById('loseScreen').style.display = 'none';
        document.getElementById('gameScreen').style.display = 'block';
        if (window.balloon) window.scene.remove(window.balloon);
        window.balloon = window.createBalloon(window.balloonColor, document.getElementById('playerNameDisplay').textContent || 'Jogador');
        window.balloon.position.set(0, altitude, 0);
        window.scene.add(window.balloon);
        if (window.socket && window.socket.emit) {
            window.socket.emit('updatePosition', { y: altitude, mode: window.mode || 'world', roomName: window.roomName || null });
        }
        document.getElementById('markersLeft').textContent = window.markersLeft;
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
        // Limitar a 30 FPS para testar fluidez
        if (time - lastTime >= 1000 / 30) {
            requestAnimationFrame(animate);
            if (!gameStarted) return;

            if (!window.scene || !window.camera || !window.renderer || !balloon) {
                console.error('Erro na renderização: cena, câmera, renderer ou balão não inicializados');
                return;
            }

            frameCount++;
            if (time - lastTime >= 1000) {
                fps = frameCount;
                frameCount = 0;
                lastTime = time;
                document.getElementById('fpsCount').textContent = fps;
            }

            // Controles locais apenas para altitude
            if (keys.W) { altitude += 0.5; hasLiftedOff = true; }
            if (keys.U) { altitude += 2.5; hasLiftedOff = true; }
            if (keys.S) altitude = Math.max(20, altitude - 0.5);
            altitude = Math.min(altitude, 500);

            // Enviar apenas a altitude ao servidor
            if (window.socket && window.socket.emit) {
                window.socket.emit('updatePosition', { y: altitude, mode: window.mode || 'world', roomName: window.roomName || null });
            }

            // Sincronizar posição com dados do servidor
            if (window.targetPosition) {
                balloon.position.x = window.targetPosition.x;
                balloon.position.y = window.targetPosition.y;
                balloon.position.z = window.targetPosition.z;
            }

            // Ajustar câmera
            window.camera.position.x = balloon.position.x;
            window.camera.position.z = balloon.position.z + 150;
            window.camera.position.y = balloon.position.y + 150;
            window.camera.lookAt(balloon.position.x, balloon.position.y, balloon.position.z);

            const currentLayerIndex = getCurrentWindLayer();
            const altitudeElement = document.getElementById('altitude');
            if (altitudeElement) altitudeElement.textContent = `${Math.floor(altitude)}m`;
            const windDirectionElement = document.getElementById('windDirection');
            if (windDirectionElement) windDirectionElement.textContent = getWindDirectionText(currentLayerIndex);
            const windSpeedElement = document.getElementById('windSpeed');
            if (windSpeedElement) windSpeedElement.textContent = windLayers[currentLayerIndex].speed.toFixed(1);
            updateLayerIndicator(currentLayerIndex);

            // Atualizar GPS
            updateGPS();
            const distanceElement = document.getElementById('distanceToTarget');
            if (distanceElement) distanceElement.textContent = `Dist: ${calculateDistanceToTarget()}m`;

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

    // Exportar funções globais
    window.setTargets = function(t) { window.targets = t; };
    window.setOtherPlayers = function(op) { window.otherPlayers = op; };
    window.setMarkers = function(m) { window.markers = m; };
    window.gameStarted = () => { gameStarted = true; };
    window.gameOver = () => { gameOver = true; };

    window.addEventListener('gamepadconnected', (e) => {});
    window.addEventListener('gamepaddisconnected', (e) => {});

    window.gameEnded = gameEnded;
    window.setBalloon = (b) => { if (b) { balloon = b; window.balloon = b; if (!window.scene.children.includes(b)) window.scene.add(b); } };
    window.showNoMarkersMessage = showNoMarkersMessage;
}