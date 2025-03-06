// game.js
export function initGame() {
    let scene, camera, renderer;
    let balloon;
    let altitude = 100;
    window.markerDropped = false;
    window.markersLeft = 5;
    let points = 0; // Variável global para pontos
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
    window.markers = []; // Array para rastrear todos os marcadores
    let lastTargetMoveTime = Date.now();
    let gameEnded = false;

    const windLayers = [
        { minAlt: 0, maxAlt: 100, direction: { x: 0, z: 0 }, speed: 0, name: "Nenhum" },
        { minAlt: 100, maxAlt: 200, direction: { x: 1, z: 0 }, speed: 0.3, name: "Leste" },
        { minAlt: 200, maxAlt: 300, direction: { x: 0, z: 1 }, speed: 0.3, name: "Sul" },
        { minAlt: 300, maxAlt: 400, direction: { x: -1, z: 0 }, speed: 0.4, name: "Oeste" },
        { minAlt: 400, maxAlt: 500, direction: { x: 0, z: -1 }, speed: 0.5, name: "Norte" }
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

    initThreeJS();

    function detectMobile() {
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        return /android|iPhone|iPad|iPod|windows phone/i.test(userAgent);
    }

    function initThreeJS() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87CEEB);

        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
        camera.position.set(0, 300, 300);
        camera.lookAt(0, 100, 0);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.getElementById('gameScreen').appendChild(renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(100, 300, 50);
        scene.add(directionalLight);

        createGround();

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
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

            // Prevenir zoom por double-tap
            [upButton, turboButton, downButton, dropButton].forEach(button => {
                button.addEventListener('dblclick', (e) => e.preventDefault());
            });
        }

        animate();
    }

    function createGround() {
        const mapSize = 2600;
        const groundGeometry = new THREE.PlaneGeometry(mapSize, mapSize, 50, 50);
        const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x7CFC00 });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        scene.add(ground);

        const gridHelper = new THREE.GridHelper(mapSize, 26, 0x000000, 0x000000);
        gridHelper.position.y = 0.1;
        gridHelper.material.opacity = 0.2;
        gridHelper.material.transparent = true;
        scene.add(gridHelper);

        for (let i = 0; i < 30; i++) {
            const houseGeometry = new THREE.BoxGeometry(15, 15, 15);
            const houseMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
            const house = new THREE.Mesh(houseGeometry, houseMaterial);
            house.position.set(Math.random() * mapSize - mapSize / 2, 7.5, Math.random() * mapSize - mapSize / 2);
            scene.add(house);
        }

        for (let i = 0; i < 45; i++) {
            const cowGeometry = new THREE.SphereGeometry(4.5, 16, 16);
            const cowMaterial = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
            const cow = new THREE.Mesh(cowGeometry, cowMaterial);
            cow.position.set(Math.random() * mapSize - mapSize / 2, 2.25, Math.random() * mapSize - mapSize / 2);
            scene.add(cow);
        }

        const roadMaterial = new THREE.LineBasicMaterial({ color: 0x808080 });
        for (let i = 0; i < 15; i++) {
            const roadGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(Math.random() * mapSize - mapSize / 2, 0.2, Math.random() * mapSize - mapSize / 2),
                new THREE.Vector3(Math.random() * mapSize - mapSize / 2, 0.2, Math.random() * mapSize - mapSize / 2)
            ]);
            const road = new THREE.Line(roadGeometry, roadMaterial);
            road.scale.set(1.5, 1, 1.5);
            scene.add(road);
        }

        for (let i = 0; i < 10; i++) {
            const lakeGeometry = new THREE.CircleGeometry(30, 32);
            const lakeMaterial = new THREE.MeshLambertMaterial({ color: 0x00BFFF, side: THREE.DoubleSide });
            const lake = new THREE.Mesh(lakeGeometry, lakeMaterial);
            lake.rotation.x = -Math.PI / 2;
            lake.position.set(Math.random() * mapSize - mapSize / 2, 0.1, Math.random() * mapSize - mapSize / 2);
            scene.add(lake);
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
            scene.add(textMesh);
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
        } else {
            balloonMaterial = new THREE.MeshLambertMaterial({ color });
        }
        const balloonMesh = new THREE.Mesh(balloonGeometry, balloonMaterial);
        balloonMesh.scale.y = 1.2;
        balloonMesh.position.y = 30;
        if (color === 'rainbow') {
            const colors = new Float32Array(balloonGeometry.attributes.position.count * 3);
            for (let i = 0; i < balloonGeometry.attributes.position.count; i++) {
                colors[i * 3] = Math.random();
                colors[i * 3 + 1] = Math.random();
                colors[i * 3 + 2] = Math.random();
            }
            balloonGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }
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
        loader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', function(font) {
            const textGeometry = new THREE.TextGeometry(name || 'Jogador', {
                font: font,
                size: 7,
                height: 1,
            });
            const textMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
            const textMesh = new THREE.Mesh(textGeometry, textMaterial);
            textMesh.position.set(-15, 80, 0);
            group.add(textMesh);
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
        const markerId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Criar novo marcador e cauda
        const markerGeometry = new THREE.SphereGeometry(4.5, 16, 16);
        const markerMaterial = new THREE.MeshLambertMaterial({ color: 0x0000FF });
        const newMarker = new THREE.Mesh(markerGeometry, markerMaterial);
        newMarker.position.set(markerStartPos.x, markerStartPos.y, markerStartPos.z);
        newMarker.userData = { markerId: markerId };
        scene.add(newMarker);

        const tailGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, -45, 0)
        ]);
        const tailMaterial = new THREE.LineBasicMaterial({ color: 0xFFFFFF });
        const newTail = new THREE.Line(tailGeometry, tailMaterial);
        newTail.position.set(markerStartPos.x, markerStartPos.y, markerStartPos.z);
        scene.add(newTail);

        // Adicionar ao array de marcadores
        window.markers.push({ marker: newMarker, tail: newTail, markerId: markerId });

        // Emitir evento para o backend
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

    function updateMarkers() {
        window.markers.forEach((m, index) => {
            const marker = m.marker;
            const tail = m.tail;
            if (marker.position.y > 0) {
                // Aplicar gravidade de forma consistente e suave
                marker.position.y = Math.max(0, marker.position.y - 5.0); // Garante que não passe de y=0
                tail.position.y = marker.position.y;
                if (marker.position.y === 0) { // Só processa quando atinge exatamente y=0
                    console.log(`Marcador atingiu o chão: ${m.markerId}, Posição: x=${marker.position.x}, y=${marker.position.y}, z=${marker.position.z}`);
                    window.socket.emit('markerLanded', {
                        x: marker.position.x,
                        y: marker.position.y,
                        z: marker.position.z,
                        mode: window.mode || 'world',
                        roomName: window.roomName || null,
                        markerId: m.markerId
                    });
                    // Remover marcador após atingir o chão para evitar repetição
                    scene.remove(marker);
                    scene.remove(tail);
                    window.markers.splice(index, 1);
                }
            }
        });
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
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
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
        if (window.balloon) scene.remove(window.balloon);
        window.balloon = window.createBalloon(window.balloonColor, document.getElementById('playerName').value);
        window.balloon.position.set(0, altitude, 0);
        scene.add(window.balloon);
        document.getElementById('markersLeft').textContent = window.markersLeft;
        document.getElementById('points').textContent = points;
        window.socket.emit('updatePosition', { x: window.balloon.position.x, y: window.balloon.position.y, z: window.balloon.position.z, mode: window.mode || 'world', roomName: window.roomName || null });
    };

    // Suporte ao gamepad
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

        const currentTime = performance.now();
        frameCount++;
        if (currentTime - lastTime >= 1000) {
            fps = frameCount;
            frameCount = 0;
            lastTime = currentTime;
            document.getElementById('fpsCount').textContent = fps;
        }

        handleGamepad(); // Verifica o estado do controle a cada frame

        if (window.balloon && !balloon) {
            balloon = window.balloon;
            console.log('Sincronizando balloon local com window.balloon:', balloon);
        }

        if (!gameStarted || gameOver || !balloon) {
            if (gameOver && !gameEnded) {
                document.getElementById('gameScreen').style.display = 'none';
                document.getElementById('loseScreen').style.display = 'flex';
            }
            renderer.render(scene, camera);
            return;
        }

        if (keys.W) { altitude += 1; hasLiftedOff = true; }
        if (keys.U) { altitude += 5; hasLiftedOff = true; }
        if (keys.S) altitude = Math.max(20, altitude - 1);

        if (altitude <= 20 && hasLiftedOff) gameOver = true;

        altitude = Math.min(altitude, 500);
        balloon.position.y = altitude;

        const currentLayerIndex = getCurrentWindLayer();
        const currentLayer = windLayers[currentLayerIndex];

        balloon.position.x += currentLayer.direction.x * currentLayer.speed;
        balloon.position.z += currentLayer.direction.z * currentLayer.speed;

        if (keys.A) balloon.position.x -= 0.5;
        if (keys.D) balloon.position.x += 0.5;

        balloon.rotation.y += 0.001;

        window.socket.emit('updatePosition', { x: balloon.position.x, y: balloon.position.y, z: balloon.position.z, mode: window.mode || 'world', roomName: window.roomName || null });

        document.getElementById('altitude').textContent = `${Math.floor(altitude)}m`;
        const dx = balloon.position.x - (window.targets[0]?.x || 0);
        const dz = balloon.position.z - (window.targets[0]?.z || 0);
        const distance = Math.sqrt(dx * dx + dz * dz);
        document.getElementById('distanceToTarget').textContent = `${Math.floor(distance)}m`;
        document.getElementById('windDirection').textContent = getWindDirectionText(currentLayerIndex);
        document.getElementById('windSpeed').textContent = currentLayer.speed.toFixed(1);
        document.getElementById('windIndicator').textContent = `Vento: ${currentLayer.name.charAt(0)}`;

        updateLayerIndicator(currentLayerIndex);

        // Atualizar marcadores
        updateMarkers();

        camera.position.x = balloon.position.x;
        camera.position.z = balloon.position.z + 200;
        camera.position.y = balloon.position.y + 200;
        camera.lookAt(balloon.position.x, balloon.position.y, balloon.position.z);

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

        renderer.render(scene, camera);
    }

    // Função para atualizar pontos na UI
    window.updatePoints = function(newPoints) {
        points = newPoints;
        document.getElementById('points').textContent = points;
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
        if (b && !scene.children.includes(b)) {
            console.log('Re-adicionando balão à cena:', b);
            scene.add(b);
        }
    };
    window.setTargets = (t) => window.targets = t;
    window.setOtherPlayers = (op) => window.otherPlayers = op;
    window.setMarkers = (m) => window.markers = m;
    window.showNoMarkersMessage = showNoMarkersMessage;
    window.scene = scene;
}