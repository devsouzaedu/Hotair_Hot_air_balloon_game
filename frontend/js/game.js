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
    let targetPosition = { x: 0, y: 100, z: 0 }; // Posição alvo para interpolação

    const windLayers = [
        { minAlt: 0, maxAlt: 100, direction: { x: 0, z: 0 }, speed: 0, name: "Nenhum" },
        { minAlt: 100, maxAlt: 200, direction: { x: 1, z: 0 }, speed: 0.3, name: "Leste" },
        { minAlt: 200, maxAlt: 300, direction: { x: 0, z: 1 }, speed: 0.4, name: "Sul" },
        { minAlt: 300, maxAlt: 400, direction: { x: -1, z: 0 }, speed: 0.4, name: "Oeste" },
        { minAlt: 400, maxAlt: 500, direction: { x: 0, z: -1 }, speed: 0.6, name: "Norte" }
    ];

    const keys = { W: false, S: false, A: false, D: false, U: false, SHIFT_RIGHT: false };

    const bestScoreElement = document.getElementById('bestScore');
    if (bestScoreElement) bestScoreElement.textContent = bestScore;
    else console.error('Elemento bestScore não encontrado');

    const markersLeftElement = document.getElementById('markersLeft');
    if (markersLeftElement) markersLeftElement.textContent = window.markersLeft;
    else console.error('Elemento markersLeft não encontrado');

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
        window.camera.position.set(0, 300, 300);
        window.camera.lookAt(0, 100, 0);
    
        window.renderer = new THREE.WebGLRenderer({ antialias: true });
        window.renderer.setSize(window.innerWidth, window.innerHeight);
        document.getElementById('gameScreen').appendChild(window.renderer.domElement);
    
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        window.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(100, 300, 50);
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
    
        for (let i = 0; i < 6; i++) {
            const stepWidth = mapSize - (i * 20);
            const stepGeometry = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
            const step = new THREE.Mesh(stepGeometry, standMaterial);
            step.position.set(0, i * stepHeight + stepHeight / 2, mapSize / 2 + stepDepth / 2 + i * stepDepth);
            window.scene.add(step);
        }
    
        for (let i = 0; i < 6; i++) {
            const stepWidth = mapSize - (i * 20);
            const stepGeometry = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
            const step = new THREE.Mesh(stepGeometry, standMaterial);
            step.position.set(0, i * stepHeight + stepHeight / 2, -mapSize / 2 - stepDepth / 2 - i * stepDepth);
            window.scene.add(step);
        }
    
        for (let i = 0; i < 6; i++) {
            const stepLength = mapSize - (i * 20);
            const stepGeometry = new THREE.BoxGeometry(stepDepth, stepHeight, stepLength);
            const step = new THREE.Mesh(stepGeometry, standMaterial);
            step.position.set(mapSize / 2 + stepDepth / 2 + i * stepDepth, i * stepHeight + stepHeight / 2, 0);
            window.scene.add(step);
        }
    
        for (let i = 0; i < 6; i++) {
            const stepLength = mapSize - (i * 20);
            const stepGeometry = new THREE.BoxGeometry(stepDepth, stepHeight, stepLength);
            const step = new THREE.Mesh(stepGeometry, standMaterial);
            step.position.set(-mapSize / 2 - stepDepth / 2 - i * stepDepth, i * stepHeight + stepHeight / 2, 0);
            window.scene.add(step);
        }
    
        const npcGeometry = new THREE.SphereGeometry(4, 16, 16);
        const npcMaterial = new THREE.MeshLambertMaterial({ color: 0xFF0000 });
        window.spectators = [];
        let npcCount = 0;
    
        for (let i = 0; i < 6; i++) {
            const yPos = i * stepHeight + stepHeight;
    
            for (let x = -mapSize / 2 + 10; x < mapSize / 2 - 10; x += 10) {
                const npc = new THREE.Mesh(npcGeometry, npcMaterial);
                npc.scale.y = 1.5;
                npc.position.set(x, yPos + 2, mapSize / 2 + stepDepth / 2 + i * stepDepth);
                window.spectators.push({ mesh: npc, baseY: yPos + 2, phase: Math.random() * Math.PI * 2 });
                window.scene.add(npc);
                npcCount++;
            }
    
            for (let x = -mapSize / 2 + 10; x < mapSize / 2 - 10; x += 10) {
                const npc = new THREE.Mesh(npcGeometry, npcMaterial);
                npc.scale.y = 1.5;
                npc.position.set(x, yPos + 2, -mapSize / 2 - stepDepth / 2 - i * stepDepth);
                window.spectators.push({ mesh: npc, baseY: yPos + 2, phase: Math.random() * Math.PI * 2 });
                window.scene.add(npc);
                npcCount++;
            }
    
            for (let z = -mapSize / 2 + 10; z < mapSize / 2 - 10; z += 10) {
                const npc = new THREE.Mesh(npcGeometry, npcMaterial);
                npc.scale.y = 1.5;
                npc.position.set(mapSize / 2 + stepDepth / 2 + i * stepDepth, yPos + 2, z);
                window.spectators.push({ mesh: npc, baseY: yPos + 2, phase: Math.random() * Math.PI * 2 });
                window.scene.add(npc);
                npcCount++;
            }
    
            for (let z = -mapSize / 2 + 10; z < mapSize / 2 - 10; z += 10) {
                const npc = new THREE.Mesh(npcGeometry, npcMaterial);
                npc.scale.y = 1.5;
                npc.position.set(-mapSize / 2 - stepDepth / 2 - i * stepDepth, yPos + 2, z);
                window.spectators.push({ mesh: npc, baseY: yPos + 2, phase: Math.random() * Math.PI * 2 });
                window.scene.add(npc);
                npcCount++;
            }
        }
    
        console.log(`Total de NPCs criados: ${npcCount}`);
    
        for (let i = 0; i < 30; i++) {
            const houseGeometry = new THREE.BoxGeometry(15, 15, 15);
            const houseMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
            const house = new THREE.Mesh(houseGeometry, houseMaterial);
            house.position.set(Math.random() * (mapSize - 100) - (mapSize - 100) / 2, 7.5, Math.random() * (mapSize - 100) - (mapSize - 100) / 2);
            window.scene.add(house);
        }
    
        for (let i = 0; i < 45; i++) {
            const cowGeometry = new THREE.SphereGeometry(4.5, 16, 16);
            const cowMaterial = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
            const cow = new THREE.Mesh(cowGeometry, cowMaterial);
            cow.position.set(Math.random() * (mapSize - 100) - (mapSize - 100) / 2, 2.25, Math.random() * (mapSize - 100) - (mapSize - 100) / 2);
            window.scene.add(cow);
        }
    
        const roadMaterial = new THREE.LineBasicMaterial({ color: 0x808080 });
        for (let i = 0; i < 15; i++) {
            const roadGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(Math.random() * (mapSize - 100) - (mapSize - 100) / 2, 0.2, Math.random() * (mapSize - 100) - (mapSize - 100) / 2),
                new THREE.Vector3(Math.random() * (mapSize - 100) - (mapSize - 100) / 2, 0.2, Math.random() * (mapSize - 100) - (mapSize - 100) / 2)
            ]);
            const road = new THREE.Line(roadGeometry, roadMaterial);
            road.scale.set(1.5, 1, 1.5);
            window.scene.add(road);
        }
    
        for (let i = 0; i < 10; i++) {
            const lakeGeometry = new THREE.CircleGeometry(30, 32);
            const lakeMaterial = new THREE.MeshLambertMaterial({ color: 0x00BFFF, side: THREE.DoubleSide });
            const lake = new THREE.Mesh(lakeGeometry, lakeMaterial);
            lake.rotation.x = -Math.PI / 2;
            lake.position.set(Math.random() * (mapSize - 100) - (mapSize - 100) / 2, 0.1, Math.random() * (mapSize - 100) - (mapSize - 100) / 2);
            window.scene.add(lake);
        }
    
        const loader = new THREE.FontLoader();
        loader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', function(font) {
            const textGeometry = new THREE.TextGeometry("ESPAÇOS PARA DIVULGAÇÃO", {
                font: font,
                size: 50,
                height: 1,
            });
            const textMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
            const textMesh = new THREE.Mesh(textGeometry, textMaterial);
            textMesh.rotation.x = -Math.PI / 2;
            textMesh.position.set(-400, 0.2, 0);
            window.scene.add(textMesh);
        }, undefined, function(error) {
            console.error('Erro ao carregar fonte para texto de divulgação:', error);
        });
    }

    window.createBalloon = function(color, name) {
        console.log('Criando balão com cor:', color, 'e nome:', name);
        color = color || '#FF4500';
        const group = new THREE.Group();
        const basketGeometry = new THREE.BoxGeometry(15, 12, 15);
        const basketMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
        const basket = new THREE.Mesh(basketGeometry, basketMaterial);
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

        const ropeMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
        for (let i = 0; i < 4; i++) {
            const x = (i % 2 === 0) ? -7.5 : 7.5;
            const z = (i < 2) ? -7.5 : 7.5;
            const ropeGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(x, -10, z),
                new THREE.Vector3(x, 30, z)
            ]);
            const rope = new THREE.Line(ropeGeometry, ropeMaterial);
            group.add(rope);
        }

        const loader = new THREE.FontLoader();
        loader.load('https://threejs.org/examples/fonts/optimer_regular.typeface.json', function(font) {
            const textGeometry = new THREE.TextGeometry(name || 'Jogador', {
                font: font,
                size: 7,
                height: 1,
            });
            const textMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
            const textMesh = new THREE.Mesh(textGeometry, textMaterial);
            textMesh.position.set(-15, 80, 0);
            group.add(textMesh);
            console.log('Nome do jogador adicionado:', name);
        }, undefined, function(error) {
            console.error('Erro ao carregar fonte para nome do jogador:', error);
            const fallbackGeometry = new THREE.BoxGeometry(5, 5, 5);
            const fallbackMaterial = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
            const fallbackMesh = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
            fallbackMesh.position.set(-15, 80, 0);
            group.add(fallbackMesh);
            console.log('Fallback adicionado para nome do jogador');
        });

        group.position.set(0, altitude, 0);
        console.log('Balão criado:', group);
        return group;
    };

    window.createTarget = function(x, z) {
        const targetMesh = new THREE.Group();
        const material = new THREE.LineBasicMaterial({ color: 0xFF0000, linewidth: 10 });
        const line1Geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-45, 0, -45),
            new THREE.Vector3(45, 0, 45)
        ]);
        const line1 = new THREE.Line(line1Geometry, material);
        targetMesh.add(line1);

        const line2Geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(45, 0, -45),
            new THREE.Vector3(-45, 0, 45)
        ]);
        const line2 = new THREE.Line(line2Geometry, material);
        targetMesh.add(line2);

        targetMesh.position.set(x, 0.1, z);
        return targetMesh;
    };

    function handleKeyDown(event) {
        if (!gameStarted || gameOver) return;
        console.log('Tecla pressionada:', event.code, 'markerDropped:', window.markerDropped, 'markersLeft:', window.markersLeft);
        switch(event.code) {
            case 'KeyW': keys.W = true; break;
            case 'KeyS': keys.S = true; break;
            case 'KeyA': keys.A = true; break;
            case 'KeyD': keys.D = true; break;
            case 'KeyU': keys.U = true; break;
            case 'ShiftRight': 
                if (!window.markerDropped && window.markersLeft > 0) {
                    console.log('ShiftRight detectado, soltando marcador');
                    dropMarker();
                }
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
        if (!window.balloon) {
            console.error('Balão não existe ao tentar soltar marcador');
            return;
        }
        console.log('Soltando marcador na posição:', window.balloon.position);
        const markerStartPos = { 
            x: window.balloon.position.x, 
            y: window.balloon.position.y - 10, 
            z: window.balloon.position.z 
        };
        const markerId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        const markerMesh = new THREE.Mesh(
            new THREE.SphereGeometry(4.5, 16, 16),
            new THREE.MeshLambertMaterial({ color: 0x0000FF })
        );
        const tailMesh = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -45, 0)]),
            new THREE.LineBasicMaterial({ color: 0xFFFFFF })
        );
        markerMesh.userData = { playerId: window.socket.id, type: 'marker', markerId };
        tailMesh.userData = { playerId: window.socket.id, type: 'tail', markerId };
        markerMesh.position.set(markerStartPos.x, markerStartPos.y, markerStartPos.z);
        tailMesh.position.set(markerStartPos.x, markerStartPos.y, markerStartPos.z);
        
        window.scene.add(markerMesh);
        window.scene.add(tailMesh);
        window.markers.push({ marker: markerMesh, tail: tailMesh, playerId: window.socket.id });
    
        window.socket.emit('dropMarker', { 
            x: markerStartPos.x, 
            y: markerStartPos.y, 
            z: markerStartPos.z, 
            mode: window.mode || 'world',
            roomName: window.roomName || null,
            markerId
        });
        window.markerDropped = true;
        marker.position.set(markerStartPos.x, markerStartPos.y, markerStartPos.z);
        marker.visible = true;
        tail.position.set(markerStartPos.x, markerStartPos.y, markerStartPos.z);
        tail.visible = true;
        setTimeout(() => {
            marker.visible = false;
            tail.visible = false;
        }, 100);
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
        message.style.background = 'rgba(0, 0, 0, 0.7)';
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
            if (altitude >= windLayers[i].minAlt && altitude < windLayers[i].maxAlt) {
                return i;
            }
        }
        return 0;
    }

    function getWindDirectionText(layerIndex) {
        return windLayers[layerIndex].name;
    }

    function updateLayerIndicator(currentLayer) {
        for (let i = 1; i <= 5; i++) {
            const element = document.getElementById(`layer${i}`);
            if (i === currentLayer + 1) element.classList.add('active');
            else element.classList.remove('active');
        }
    }

    function onWindowResize() {
        window.camera.aspect = window.innerWidth / window.innerHeight;
        window.camera.updateProjectionMatrix();
        window.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function getDirectionToTarget(balloonX, balloonZ, targetX, targetZ) {
        const dx = targetX - balloonX;
        const dz = targetZ - balloonZ;
        const angle = Math.atan2(dx, dz) * (180 / Math.PI);
        if (angle >= -45 && angle < 45) return "N";
        if (angle >= 45 && angle < 135) return "L";
        if (angle >= 135 || angle < -135) return "S";
        if (angle >= -135 && angle < -45) return "O";
        return "-";
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
        window.balloon = window.createBalloon(window.balloonColor, document.getElementById('playerName').value);
        window.balloon.position.set(0, altitude, 0);
        window.scene.add(window.balloon);
        document.getElementById('markersLeft').textContent = window.markersLeft;
        window.socket.emit('updatePosition', { x: window.balloon.position.x, y: window.balloon.position.y, z: window.balloon.position.z, mode: window.mode || 'world', roomName: window.roomName || null });
    };

    function handleGamepad() {
        const gamepads = navigator.getGamepads();
        const gamepad = gamepads[0];
        if (gamepad) {
            const buttons = gamepad.buttons;
            if (buttons[0].pressed) keys.S = true; else if (!buttons[0].pressed && keys.S) keys.S = false; // X
            if (buttons[1].pressed && !window.markerDropped && window.markersLeft > 0) {
                if (!keys.SHIFT_RIGHT) { dropMarker(); keys.SHIFT_RIGHT = true; }
            } else if (!buttons[1].pressed) keys.SHIFT_RIGHT = false; // Círculo
            if (buttons[2].pressed) keys.U = true; else if (!buttons[2].pressed && keys.U) keys.U = false; // Quadrado
            if (buttons[3].pressed) keys.W = true; else if (!buttons[3].pressed && keys.W) keys.W = false; // Triângulo
        }
    }

    function animate() {
        requestAnimationFrame(animate);
        if (!gameStarted) {
            console.log('Animação pausada: gameStarted é false');
            return;
        }
    
        if (!window.scene || !window.camera || !window.renderer || !balloon) {
            console.error('Animação abortada: elementos essenciais da cena não estão prontos', { 
                scene: window.scene, 
                camera: window.camera, 
                renderer: window.renderer, 
                balloon 
            });
            return;
        }
    
        const currentTime = performance.now();
        frameCount++;
        if (currentTime - lastTime >= 1000) {
            fps = frameCount;
            frameCount = 0;
            lastTime = currentTime;
            document.getElementById('fpsCount').textContent = fps;
        }
    
        // Processar controles locais (apenas altitude)
        // Processar controles locais (apenas altitude)
        if (keys.W) { altitude += 1; hasLiftedOff = true; }
        if (keys.U) { altitude += 5; hasLiftedOff = true; }
        if (keys.S) altitude = Math.max(20, altitude - 1);
        altitude = Math.min(altitude, 500);
        
        window.socket.emit('updatePosition', { 
            x: balloon.position.x, 
            y: altitude, 
            z: balloon.position.z, 
            mode: window.mode || 'world', 
            roomName: window.roomName || null 
        });
        
        const lerpFactor = 0.2;
        balloon.position.x = THREE.MathUtils.lerp(balloon.position.x, targetPosition.x, lerpFactor);
        balloon.position.y = THREE.MathUtils.lerp(balloon.position.y, altitude, lerpFactor);
        balloon.position.z = THREE.MathUtils.lerp(balloon.position.z, targetPosition.z, lerpFactor);
        
        console.log(`[Position Debug] Local: x=${balloon.position.x.toFixed(2)}, y=${balloon.position.y.toFixed(2)}, z=${balloon.position.z.toFixed(2)}, Target: x=${targetPosition.x.toFixed(2)}, y=${targetPosition.y.toFixed(2)}, z=${targetPosition.z.toFixed(2)}`);
    
        // Atualizar câmera
        window.camera.position.x = balloon.position.x;
        window.camera.position.z = balloon.position.z + 200;
        window.camera.position.y = balloon.position.y + 200;
        window.camera.lookAt(balloon.position.x, balloon.position.y, balloon.position.z);
    
        // Atualizar espectadores
        if (window.spectators && window.spectators.length > 0) {
            const time = performance.now() * 0.001;
            window.spectators.forEach(spectator => {
                const yOffset = Math.sin(time + spectator.phase) * 3;
                spectator.mesh.position.y = spectator.baseY + yOffset;
            });
        }
    
        // Atualizar UI com base na altitude local
        const currentLayerIndex = getCurrentWindLayer();
        document.getElementById('altitude').textContent = `${Math.floor(altitude)}m`;
        document.getElementById('windDirection').textContent = getWindDirectionText(currentLayerIndex);
        document.getElementById('windSpeed').textContent = windLayers[currentLayerIndex].speed.toFixed(1);
        document.getElementById('windIndicator').textContent = `Vento: ${windLayers[currentLayerIndex].name.charAt(0)}`;
        updateLayerIndicator(currentLayerIndex);
    
        // Atualizar GPS
        const dx = balloon.position.x - (window.targets[0]?.x || 0);
        const dz = balloon.position.z - (window.targets[0]?.z || 0);
        const distance = Math.sqrt(dx * dx + dz * dz);
        document.getElementById('distanceToTarget').textContent = `${Math.floor(distance)}m`;
    
        const gpsCanvas = document.getElementById('gpsCanvas');
        const gpsContext = gpsCanvas.getContext('2d');
        gpsContext.clearRect(0, 0, gpsCanvas.width, gpsCanvas.height);
        gpsContext.fillStyle = 'rgba(255, 255, 255, 0.2)';
        gpsContext.fillRect(0, 0, gpsCanvas.width, gpsCanvas.height);
    
        const mapSize = 2600;
        const gpsScale = gpsCanvas.width / mapSize;
        const centerX = gpsCanvas.width / 2;
        const centerZ = gpsCanvas.height / 2;
    
        const balloonX = centerX + (balloon.position.x * gpsScale);
        const balloonZ = centerZ - (balloon.position.z * gpsScale);
    
        gpsContext.fillStyle = window.balloonColor === 'rainbow' ? '#FFFFFF' : window.balloonColor;
        gpsContext.beginPath();
        gpsContext.arc(balloonX, balloonZ, 5, 0, Math.PI * 2);
        gpsContext.fill();
    
        window.targets.forEach(target => {
            const targetX = centerX + (target.x * gpsScale);
            const targetZ = centerZ - (target.z * gpsScale);
            gpsContext.fillStyle = '#FF0000';
            gpsContext.fillRect(targetX - 5, targetZ - 5, 10, 10);
        });
    
        const direction = getDirectionToTarget(balloonX, balloonZ, 
            centerX + (window.targets[0]?.x * gpsScale) || centerX, 
            centerZ - (window.targets[0]?.z * gpsScale) || centerZ);
        document.getElementById('gpsDirection').textContent = `Direção: ${direction}`;
    
        window.renderer.render(window.scene, window.camera);
        console.log('Renderizando cena: FPS', fps, 'Altitude:', altitude);
    }

    window.initGameScene = function(state) {
        console.log('Inicializando cena com estado:', state);
        if (!window.scene) {
            console.log('Cena não existe, chamando initThreeJS');
            initThreeJS();
        } else {
            console.log('Cena já existe, reutilizando');
        }
    
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
            console.log('Dados do jogador recebidos:', player);
            
            const markersLeftElement = document.getElementById('markersLeft');
            if (markersLeftElement) markersLeftElement.textContent = window.markersLeft;
            else console.error('Elemento markersLeft não encontrado');
            
            const pointsElement = document.getElementById('points');
            if (pointsElement) pointsElement.textContent = points;
            else console.error('Elemento points não encontrado');
            
            const playerNameDisplay = document.getElementById('playerNameDisplay');
            if (playerNameDisplay) playerNameDisplay.textContent = player.name;
            
            if (!balloon || !window.scene.children.includes(balloon)) {
                console.log('Criando novo balão com cor do servidor:', player.color);
                window.setBalloon(window.createBalloon(player.color || window.balloonColor || '#FF4500', player.name));
                balloon.position.set(player.x, player.y, player.z);
                targetPosition = { x: player.x, y: player.y, z: player.z }; // Inicializa com valores do servidor
                window.scene.add(balloon);
                console.log('Balão adicionado à cena:', balloon);
            } else {
                console.log('Atualizando posição do balão existente:', balloon.position);
                balloon.position.set(player.x, player.y, player.z);
                targetPosition = { x: player.x, y: player.y, z: player.z }; // Atualiza com valores do servidor
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
            markerMesh.userData = { playerId: markerData.playerId, type: 'marker', markerId };
            tailMesh.userData = { playerId: markerData.playerId, type: 'tail', markerId };
            markerMesh.position.set(markerData.x, markerData.y, markerData.z);
            tailMesh.position.set(markerData.x, markerData.y, markerData.z);
            window.scene.add(markerMesh);
            window.scene.add(tailMesh);
            window.markers.push({ marker: markerMesh, tail: tailMesh, playerId: markerData.playerId });
        }
    
        window.lastTargetMoveTime = state.lastTargetMoveTime || Date.now();
        gameStarted = true;
        console.log('Cena inicializada, iniciando animação');
        animate();
    };

    window.addEventListener('gamepadconnected', (e) => console.log('Controle conectado:', e.gamepad));
    window.addEventListener('gamepaddisconnected', (e) => console.log('Controle desconectado:', e.gamepad));

    window.gameStarted = () => gameStarted = true;
    window.gameOver = () => gameOver = true;
    window.gameEnded = gameEnded;
    window.setBalloon = (b) => {
        console.log('Definindo balão:', b);
        balloon = b;
        window.balloon = b;
        if (b && !window.scene.children.includes(b)) {
            console.log('Re-adicionando balão à cena:', b);
            window.scene.add(b);
        }
    };
    window.setTargets = (t) => window.targets = t;
    window.setOtherPlayers = (op) => window.otherPlayers = op;
    window.setMarkers = (m) => window.markers = m;
    window.showNoMarkersMessage = showNoMarkersMessage;
}