export function initGame() {
    let scene, camera, renderer;
    let balloon;
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
    window.markers = [];
    let lastTargetMoveTime = Date.now();
    let gameEnded = false;
    let lastLogTime = Date.now(); // Para controlar os logs a cada 10 segundos
    let prevBalloonX = 0; // Para calcular o deslocamento
    let prevBalloonZ = 0; // Para calcular o deslocamento

    const keys = { W: false, S: false, U: false, E: false }; // Alterado para E em vez de SHIFT_RIGHT

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

    // Definir o caminho base para recursos estáticos
    const BASE_PATH = '/Hotair_Hot_air_balloon_game';

    // Inicializar o número de alvos acertados do localStorage
    const profileTargets = localStorage.getItem('profileTargets');
    if (!profileTargets) {
        // Se não existir, inicializar com o valor da tela de perfil
        const profileTargetsElement = document.getElementById('profileTargets');
        if (profileTargetsElement) {
            localStorage.setItem('profileTargets', profileTargetsElement.textContent || '0');
        } else {
            localStorage.setItem('profileTargets', '0');
        }
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

        // Expor a câmera globalmente
        window.camera = camera;
        console.log('Câmera exposta globalmente:', window.camera);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.getElementById('gameScreen').appendChild(renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(100, 300, 50);
        scene.add(directionalLight);

        createGround();

        // Carregar o balão inicial apenas se não houver window.balloon
        if (!window.balloon) {
            const loader = new THREE.GLTFLoader();
            loader.load(
                `${BASE_PATH}/js/balloon_new.glb`,
                (gltf) => {
                    const group = new THREE.Group();
                    const model = gltf.scene;
                    model.scale.set(4, 4, 4);
                    model.position.y = 0;

                    model.traverse((child) => {
                        if (child.isMesh) {
                            if (child.name === 'Balloon') {
                                let balloonMaterial;
                                if (window.balloonColor === 'rainbow') {
                                    console.log('Aplicando textura rainbow ao balão inicial');
                                    const textureLoader = new THREE.TextureLoader();
                                    
                                    // Caminho direto para a textura
                                    const texturePath = `${BASE_PATH}/rainbow_flag_texture.jpg`;
                                    console.log(`Tentando carregar textura rainbow de: ${texturePath}`);
                                    
                                    textureLoader.load(
                                        texturePath,
                                        // Callback de sucesso
                                        function(texture) {
                                            console.log(`Textura rainbow carregada com sucesso de: ${texturePath}`);
                                            // Aplicar a textura diretamente ao material
                                            balloonMaterial = new THREE.MeshLambertMaterial({ 
                                                map: texture,
                                                side: THREE.DoubleSide
                                            });
                                            child.material = balloonMaterial;
                                            
                                            // Forçar atualização do material
                                            child.material.needsUpdate = true;
                                            texture.needsUpdate = true;
                                            
                                            console.log('Material do balão inicial atualizado com a textura rainbow!');
                                        },
                                        // Callback de progresso
                                        function(xhr) {
                                            console.log(`Progresso de carregamento da textura rainbow: ${(xhr.loaded / xhr.total * 100)}%`);
                                        },
                                        // Callback de erro
                                        function(error) {
                                            console.error(`Erro ao carregar textura rainbow ${texturePath}:`, error);
                                            console.log('Tentando caminho alternativo...');
                                            
                                            // Tentar caminho alternativo
                                            const altPath = `/rainbow_flag_texture.jpg`;
                                            console.log(`Tentando caminho alternativo: ${altPath}`);
                                            
                                            textureLoader.load(
                                                altPath,
                                                function(texture) {
                                                    console.log(`Textura rainbow carregada com sucesso (caminho alternativo): ${altPath}`);
                                                    balloonMaterial = new THREE.MeshLambertMaterial({ 
                                                        map: texture,
                                                        side: THREE.DoubleSide
                                                    });
                                                    child.material = balloonMaterial;
                                                    
                                                    // Forçar atualização do material
                                                    child.material.needsUpdate = true;
                                                    texture.needsUpdate = true;
                                                    
                                                    console.log('Material do balão inicial atualizado com a textura rainbow (caminho alternativo)!');
                                                },
                                                undefined,
                                                function(error) {
                                                    console.error(`Erro ao carregar textura rainbow (caminho alternativo) ${altPath}:`, error);
                                                    // Fallback para o método antigo de cores aleatórias
                                                    console.log('Usando fallback de cores aleatórias para o balão');
                                    balloonMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
                                    const geometry = child.geometry;
                                    const colors = new Float32Array(geometry.attributes.position.count * 3);
                                    for (let i = 0; i < geometry.attributes.position.count; i++) {
                                        colors[i * 3] = Math.random();
                                        colors[i * 3 + 1] = Math.random();
                                        colors[i * 3 + 2] = Math.random();
                                    }
                                    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                                                    child.material = balloonMaterial;
                                                }
                                            );
                                        }
                                    );
                                    // Criar um material temporário enquanto a textura carrega
                                    balloonMaterial = new THREE.MeshLambertMaterial({ color: 0xFF00FF });
                                } else {
                                    balloonMaterial = new THREE.MeshLambertMaterial({ color: window.balloonColor || '#FF4500' });
                                }
                                child.material = balloonMaterial;
                            } else if (child.name === 'Basket') {
                                child.material = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
                            }
                        }
                    });

                    group.add(model);

                    // Remover o carregamento do nome com TextGeometry e usar nossa função otimizada
                    // Adicionar o nome do jogador usando nossa função otimizada
                    const playerName = localStorage.getItem('playerName') || 'Jogador';
                    createPlayerNameTag(playerName, group, { x: 0, y: 110, z: 0 });

                    group.position.set(0, altitude, 0);
                    console.log('Balão inicial criado com modelo GLB:', group);
                    window.balloon = group;
                    balloon = group;
                    scene.add(group);
                },
                undefined,
                (error) => {
                    console.error('Erro ao carregar o modelo GLB inicial:', error);
                }
            );
        }

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('resize', onWindowResize);

        if (isMobile) {
            const upButton = document.getElementById('upButton');
            const downButton = document.getElementById('downButton');
            const turboButton = document.getElementById('turboButton');
            const dropButton = document.getElementById('dropButton');

            if (upButton) {
                upButton.addEventListener('touchstart', (e) => { e.preventDefault(); keys.W = true; });
                upButton.addEventListener('touchend', () => keys.W = false);
            }

            if (downButton) {
                downButton.addEventListener('touchstart', (e) => { e.preventDefault(); keys.S = true; });
                downButton.addEventListener('touchend', () => keys.S = false);
            }

            if (turboButton) {
                turboButton.addEventListener('touchstart', (e) => { e.preventDefault(); keys.U = true; });
                turboButton.addEventListener('touchend', () => keys.U = false);
            }

            if (dropButton) {
                dropButton.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    if (!window.markerDropped && window.markersLeft > 0) {
                        dropMarker();
                    }
                });
            }

            [upButton, turboButton, downButton, dropButton].forEach(button => {
                button.addEventListener('dblclick', (e) => e.preventDefault());
            });
        }

        animate();
    }

    function createGround() {
        const mapSize = 2600;
        const groundGeometry = new THREE.PlaneGeometry(mapSize, mapSize, 1, 1);
        const groundMaterial = new THREE.MeshLambertMaterial({ 
            color: 0x7CFC00,
            wireframe: false // Garante que não haja linhas na geometria do chão
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0;
        scene.add(ground);
    
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
            const textGeometry = new THREE.TextGeometry("DIVULGUE AQUI", {
                font: font,
                size: 50,
                height: 1,
            });
            const textMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
            const textMesh = new THREE.Mesh(textGeometry, textMaterial);
            textMesh.rotation.x = -Math.PI / 2;
            textMesh.position.set(-400, 0.2, 0);
            scene.add(textMesh);
    
            // Adicionar billboards retangulares de madeira nos 4 cantos superiores das arquibancadas
            const billboardTextGeometry1 = new THREE.TextGeometry("Divulgue", {
                font: font,
                size: 20, // Tamanho ajustado para duas linhas
                height: 1,
            });
            const billboardTextGeometry2 = new THREE.TextGeometry("Aqui", {
                font: font,
                size: 20,
                height: 1,
            });
            const billboardTextMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 }); // Texto preto
            const billboardBaseGeometry = new THREE.PlaneGeometry(150, 80, 1, 1); // Maior e mais grosso (150x80)
            const billboardBaseMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513, side: THREE.DoubleSide }); // Madeira (marrom escuro)
            const poleGeometry = new THREE.CylinderGeometry(2, 2, 50, 8); // Poste mais alto
            const poleMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // Poste de madeira
    
            // Cantos superiores das arquibancadas (noroeste, nordeste, sudeste, sudoeste)
            const corners = [
                { x: -mapSize / 2 - 100, z: mapSize / 2 + 100 }, // Noroeste
                { x: mapSize / 2 + 100, z: mapSize / 2 + 100 }, // Nordeste
                { x: mapSize / 2 + 100, z: -mapSize / 2 - 100 }, // Sudeste
                { x: -mapSize / 2 - 100, z: -mapSize / 2 - 100 } // Sudoeste
            ];
    
            corners.forEach((corner, index) => {
                // Base do billboard
                const billboardBase = new THREE.Mesh(billboardBaseGeometry, billboardBaseMaterial);
                billboardBase.position.set(corner.x, 60, corner.z); // Altura ajustada para ficar acima
                billboardBase.lookAt(new THREE.Vector3(0, 60, 0)); // Virado para o centro do campo
                scene.add(billboardBase);
    
                // Texto "Divulgue" (linha superior)
                const billboardText1 = new THREE.Mesh(billboardTextGeometry1, billboardTextMaterial);
                billboardText1.position.set(corner.x, 65, corner.z); // Centralizado verticalmente
                billboardText1.lookAt(new THREE.Vector3(0, 65, 0));
                scene.add(billboardText1);
    
                // Texto "Aqui" (linha inferior)
                const billboardText2 = new THREE.Mesh(billboardTextGeometry2, billboardTextMaterial);
                billboardText2.position.set(corner.x, 55, corner.z); // Ajustado para ficar abaixo de "Divulgue"
                billboardText2.lookAt(new THREE.Vector3(0, 55, 0));
                scene.add(billboardText2);
    
                // Postes de suporte
                const pole1 = new THREE.Mesh(poleGeometry, poleMaterial);
                pole1.position.set(corner.x - 60, 30, corner.z); // Poste à esquerda
                scene.add(pole1);
    
                const pole2 = new THREE.Mesh(poleGeometry, poleMaterial);
                pole2.position.set(corner.x + 60, 30, corner.z); // Poste à direita
                scene.add(pole2);
            });
        });
    
        // Adicionar arquibancadas nas quatro bordas formando um quadrado
        const standDepth = 50;
        const standHeight = 5;
        const standWidth = mapSize;
        const numTiers = 6;
        const standGroup = new THREE.Group();
    
        // Arquibancadas Norte e Sul
        for (let i = 0; i < numTiers; i++) {
            const standGeometryNorthSouth = new THREE.BoxGeometry(standWidth, standHeight, standDepth);
            const standMaterial = new THREE.MeshLambertMaterial({ color: 0xD3D3D3 });
            const standNorth = new THREE.Mesh(standGeometryNorthSouth, standMaterial);
            standNorth.position.set(0, standHeight * (i + 0.5), mapSize / 2 + standDepth * i + standDepth / 2);
            standGroup.add(standNorth);
    
            const standSouth = standNorth.clone();
            standSouth.position.set(0, standHeight * (i + 0.5), -mapSize / 2 - standDepth * i - standDepth / 2);
            standGroup.add(standSouth);
        }
    
        // Arquibancadas Leste e Oeste
        for (let i = 0; i < numTiers; i++) {
            const standGeometryEastWest = new THREE.BoxGeometry(standDepth, standHeight, standWidth);
            const standMaterial = new THREE.MeshLambertMaterial({ color: 0xD3D3D3 });
            const standEast = new THREE.Mesh(standGeometryEastWest, standMaterial);
            standEast.position.set(mapSize / 2 + standDepth * i + standDepth / 2, standHeight * (i + 0.5), 0);
            standGroup.add(standEast);
    
            const standWest = standEast.clone();
            standWest.position.set(-mapSize / 2 - standDepth * i - standDepth / 2, standHeight * (i + 0.5), 0);
            standGroup.add(standWest);
        }
        scene.add(standGroup);
    
        // Adicionar NPCs (torcedores) nas quatro bordas
        const npcCount = 8000;
        const npcGeometry = new THREE.SphereGeometry(7.5, 8, 8);
        const npcMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
        window.npcInstance = new THREE.InstancedMesh(npcGeometry, npcMaterial, npcCount);
        const dummy = new THREE.Object3D();
        window.positions = [];
        const offsets = [];
        const colors = [];
    
        // Definir cores específicas
        const predefinedColors = [
            [1, 0, 0], // Vermelho
            [0, 1, 0], // Verde
            [0, 0, 1], // Azul
            [1, 1, 0], // Amarelo
            [0, 0, 0], // Preto
            [1, 1, 1], // Branco
        ];
    
        // Distribuir NPCs igualmente entre as quatro bordas
        const npcsPerSide = npcCount / 4; // 2000 NPCs por lado
        const rowsPerSide = numTiers; // 6 fileiras por lado
        const npcsPerRow = npcsPerSide / rowsPerSide; // 333.33 NPCs por fileira
        const colsPerRow = 66;
        const spacingX = standWidth / colsPerRow;
        const spacingZ = standWidth / colsPerRow;
    
        // NPCs no Norte
        let npcIndex = 0;
        for (let i = 0; i < npcsPerSide; i++) {
            const row = Math.floor(i / npcsPerRow);
            const col = i % npcsPerRow;
            const x = (col % colsPerRow) * spacingX - standWidth / 2 + spacingX / 2;
            const z = mapSize / 2 + standDepth * row + standDepth / 2 + 2;
            const y = standHeight * (row + 1) + 3;
    
            dummy.position.set(x, y, z);
            dummy.updateMatrix();
            window.npcInstance.setMatrixAt(npcIndex, dummy.matrix);
    
            window.positions.push(x, y, z);
            offsets.push(Math.random() * Math.PI);
    
            const usePredefined = Math.random() > 0.5;
            if (usePredefined) {
                const colorIndex = Math.floor(Math.random() * predefinedColors.length);
                colors.push(...predefinedColors[colorIndex], 1);
            } else {
                colors.push(Math.random(), Math.random(), Math.random(), 1);
            }
    
            npcIndex++;
        }
    
        // NPCs no Sul
        for (let i = 0; i < npcsPerSide; i++) {
            const row = Math.floor(i / npcsPerRow);
            const col = i % npcsPerRow;
            const x = (col % colsPerRow) * spacingX - standWidth / 2 + spacingX / 2;
            const z = -mapSize / 2 - standDepth * row - standDepth / 2 - 2;
            const y = standHeight * (row + 1) + 3;
    
            dummy.position.set(x, y, z);
            dummy.updateMatrix();
            window.npcInstance.setMatrixAt(npcIndex, dummy.matrix);
    
            window.positions.push(x, y, z);
            offsets.push(Math.random() * Math.PI);
    
            const usePredefined = Math.random() > 0.5;
            if (usePredefined) {
                const colorIndex = Math.floor(Math.random() * predefinedColors.length);
                colors.push(...predefinedColors[colorIndex], 1);
            } else {
                colors.push(Math.random(), Math.random(), Math.random(), 1);
            }
    
            npcIndex++;
        }
    
        // NPCs no Leste
        for (let i = 0; i < npcsPerSide; i++) {
            const row = Math.floor(i / npcsPerRow);
            const col = i % npcsPerRow;
            const x = mapSize / 2 + standDepth * row + standDepth / 2 + 2;
            const z = (col % colsPerRow) * spacingZ - standWidth / 2 + spacingZ / 2;
            const y = standHeight * (row + 1) + 3;
    
            dummy.position.set(x, y, z);
            dummy.updateMatrix();
            window.npcInstance.setMatrixAt(npcIndex, dummy.matrix);
    
            window.positions.push(x, y, z);
            offsets.push(Math.random() * Math.PI);
    
            const usePredefined = Math.random() > 0.5;
            if (usePredefined) {
                const colorIndex = Math.floor(Math.random() * predefinedColors.length);
                colors.push(...predefinedColors[colorIndex], 1);
            } else {
                colors.push(Math.random(), Math.random(), Math.random(), 1);
            }
    
            npcIndex++;
        }
    
        // NPCs no Oeste
        for (let i = 0; i < npcsPerSide; i++) {
            const row = Math.floor(i / npcsPerRow);
            const col = i % npcsPerRow;
            const x = -mapSize / 2 - standDepth * row - standDepth / 2 - 2;
            const z = (col % colsPerRow) * spacingZ - standWidth / 2 + spacingZ / 2;
            const y = standHeight * (row + 1) + 3;
    
            dummy.position.set(x, y, z);
            dummy.updateMatrix();
            window.npcInstance.setMatrixAt(npcIndex, dummy.matrix);
    
            window.positions.push(x, y, z);
            offsets.push(Math.random() * Math.PI);
    
            const usePredefined = Math.random() > 0.5;
            if (usePredefined) {
                const colorIndex = Math.floor(Math.random() * predefinedColors.length);
                colors.push(...predefinedColors[colorIndex], 1);
            } else {
                colors.push(Math.random(), Math.random(), Math.random(), 1);
            }
    
            npcIndex++;
        }
    
        window.npcInstance.geometry.setAttribute('color', new THREE.InstancedBufferAttribute(new Float32Array(colors), 4));
        window.npcInstance.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(colors), 4);
        window.npcInstance.instanceMatrix.needsUpdate = true;
        scene.add(window.npcInstance);
    
        // Adicionar animação aos NPCs no animate
        window.npcOffsets = offsets;
    }

    // Criar indicador de vento
    function createWindIndicator() {
        const windIndicatorGroup = new THREE.Group();
        
        // Base do indicador
        const baseGeometry = new THREE.CylinderGeometry(5, 5, 2, 16);
        const baseMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        windIndicatorGroup.add(base);
        
        // Seta do indicador
        const arrowGeometry = new THREE.ConeGeometry(3, 15, 16);
        const arrowMaterial = new THREE.MeshLambertMaterial({ color: 0xFF0000 });
        const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
        arrow.position.y = 10;
        arrow.rotation.x = Math.PI / 2; // Apontar para frente inicialmente
        windIndicatorGroup.add(arrow);
        
        // Adicionar ao balão
        windIndicatorGroup.position.y = 20; // Posicionar acima do balão
        
        return { group: windIndicatorGroup, arrow: arrow };
    }
    
    // Atualizar a direção do indicador de vento
    function updateWindIndicator(windDirection, windSpeed) {
        if (!window.windIndicator || !window.windIndicator.arrow) return;
        
        // Rotacionar a seta de acordo com a direção do vento
        switch (windDirection) {
            case 'Norte':
                window.windIndicator.arrow.rotation.x = Math.PI / 2;
                window.windIndicator.arrow.rotation.z = 0;
                break;
            case 'Sul':
                window.windIndicator.arrow.rotation.x = -Math.PI / 2;
                window.windIndicator.arrow.rotation.z = 0;
                break;
            case 'Leste':
                window.windIndicator.arrow.rotation.x = 0;
                window.windIndicator.arrow.rotation.z = -Math.PI / 2;
                break;
            case 'Oeste':
                window.windIndicator.arrow.rotation.x = 0;
                window.windIndicator.arrow.rotation.z = Math.PI / 2;
                break;
            default:
                // Esconder a seta se não houver vento
                window.windIndicator.arrow.visible = windDirection !== 'Nenhum';
                break;
        }
        
        // Ajustar a cor da seta com base na velocidade do vento
        if (windSpeed !== undefined) {
            window.windIndicator.arrow.material.color.setHex(getWindColorBySpeed(windSpeed));
        }
    }
    
    // Obter cor com base na velocidade do vento
    function getWindColorBySpeed(speed) {
        if (speed >= 4.0) return 0xFF0000; // Vermelho para vento forte
        if (speed >= 3.0) return 0xFF6600; // Laranja para vento médio-forte
        if (speed >= 2.0) return 0xFFCC00; // Amarelo para vento médio
        if (speed >= 1.0) return 0x00CC00; // Verde para vento fraco
        return 0x0000FF; // Azul para vento muito fraco
    }

    window.createBalloon = function(color, name) {
        console.log('Criando balão com cor:', color, 'e nome:', name);
        color = color || '#FF4500';
        const group = new THREE.Group();
        
        // Verificar se é um bot pelo nome (contém o país entre parênteses)
        let isBot = false;
        let botCountry = '';
        if (name && name.includes('(')) {
            const countryMatch = name.match(/\(([A-Z]{3})\)/);
            if (countryMatch && countryMatch[1]) {
                isBot = true;
                botCountry = countryMatch[1];
                console.log(`Bot detectado: ${name} do país ${botCountry}`);
            }
        }

        const loader = new THREE.GLTFLoader();
        loader.load(
            `${BASE_PATH}/js/balloon_new.glb`,
            (gltf) => {
                console.log('Modelo do balão carregado com sucesso!');
                const model = gltf.scene;
                if (!model) {
                    console.error('Modelo do balão carregado, mas a cena está vazia');
                    return;
                }
                
                model.scale.set(4, 4, 4);
                model.position.y = 0;

                if (typeof model.traverse === 'function') {
                    model.traverse((child) => {
                        if (child.isMesh) {
                            if (child.name === 'Balloon') {
                                let balloonMaterial;
                                
                                // Se for um bot, aplicar a textura da bandeira correspondente
                                if (isBot) {
                                    let texturePath = '';
                                    switch (botCountry) {
                                        case 'USA':
                                            texturePath = `${BASE_PATH}/eua_flag_texture_balloon.jpg`;
                                            break;
                                        case 'BRA':
                                            texturePath = `${BASE_PATH}/brazil_flag_texture.jpg`;
                                            break;
                                        case 'GER':
                                            texturePath = `${BASE_PATH}/ger_flag_texture_balloon.jpg`;
                                            break;
                                        case 'JPN':
                                            texturePath = `${BASE_PATH}/jpn_flag_texture_balloon.jpg`;
                                            break;
                                        default:
                                            // Usar cor padrão se não houver textura para o país
                                            break;
                                    }
                                    
                                    if (texturePath) {
                                        console.log(`Aplicando textura de bandeira para ${botCountry}: ${texturePath}`);
                                        const textureLoader = new THREE.TextureLoader();
                                        const texture = textureLoader.load(texturePath, 
                                            // Callback de sucesso
                                            function(loadedTexture) {
                                                console.log(`Textura carregada com sucesso: ${texturePath}`);
                                            },
                                            // Callback de progresso
                                            undefined,
                                            // Callback de erro
                                            function(error) {
                                                console.error(`Erro ao carregar textura ${texturePath}:`, error);
                                            }
                                        );
                                        balloonMaterial = new THREE.MeshLambertMaterial({ map: texture });
                                    } else {
                                        // Fallback para cor padrão
                                        balloonMaterial = new THREE.MeshLambertMaterial({ color: color });
                                    }
                                } else if (color === 'rainbow') {
                                    console.log('Aplicando textura rainbow ao balão do jogador');
                                    const textureLoader = new THREE.TextureLoader();
                                    
                                    // Caminho direto para a textura
                                    const texturePath = `${BASE_PATH}/rainbow_flag_texture.jpg`;
                                    console.log(`Tentando carregar textura rainbow de: ${texturePath}`);
                                    
                                    const texture = textureLoader.load(
                                        texturePath,
                                        // Callback de sucesso
                                        function(texture) {
                                            console.log(`Textura rainbow carregada com sucesso de: ${texturePath}`);
                                            balloonMaterial = new THREE.MeshLambertMaterial({ 
                                                map: texture,
                                                side: THREE.DoubleSide
                                            });
                                            
                                            // Forçar atualização do material
                                            balloonMaterial.needsUpdate = true;
                                            texture.needsUpdate = true;
                                            
                                            console.log('Material do balão do jogador atualizado com a textura rainbow!');
                                            
                                            // Atualizar o material do balão
                                            if (child) {
                                                child.material = balloonMaterial;
                                                child.material.needsUpdate = true;
                                            }
                                        },
                                        // Callback de progresso
                                        undefined,
                                        // Callback de erro
                                        function(error) {
                                            console.warn(`Erro ao carregar textura rainbow de ${texturePath}:`, error);
                                            
                                            // Tentar caminho alternativo
                                            const alternativePath = `${BASE_PATH}/rainbow_flag_texture.png`;
                                            console.log(`Tentando caminho alternativo para textura rainbow: ${alternativePath}`);
                                            
                                            textureLoader.load(
                                                alternativePath,
                                                // Callback de sucesso
                                                function(texture) {
                                                    console.log(`Textura rainbow carregada com sucesso de caminho alternativo: ${alternativePath}`);
                                                    balloonMaterial = new THREE.MeshLambertMaterial({ 
                                                        map: texture,
                                                        side: THREE.DoubleSide
                                                    });
                                                    
                                                    // Forçar atualização do material
                                                    balloonMaterial.needsUpdate = true;
                                                    texture.needsUpdate = true;
                                                    
                                                    console.log('Material do balão do jogador atualizado com a textura rainbow (caminho alternativo)!');
                                                    
                                                    // Atualizar o material do balão
                                                    if (child) {
                                                        child.material = balloonMaterial;
                                                        child.material.needsUpdate = true;
                                                    }
                                                },
                                                undefined,
                                                function(error) {
                                                    console.error(`Erro ao carregar textura rainbow alternativa:`, error);
                                                    // Fallback para cor padrão
                                                    balloonMaterial = new THREE.MeshLambertMaterial({ color: 0xFF00FF });
                                                    if (child) {
                                                        child.material = balloonMaterial;
                                                    }
                                                }
                                            );
                                        }
                                    );
                                    
                                    // Material temporário enquanto a textura carrega
                                    balloonMaterial = new THREE.MeshLambertMaterial({ color: 0xFF00FF });
                                } else {
                                    balloonMaterial = new THREE.MeshLambertMaterial({ color: color });
                                }
                                child.material = balloonMaterial;
                            } else if (child.name === 'Basket') {
                                child.material = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
                            }
                        }
                    });
                } else {
                    console.error('Modelo do balão não possui método traverse');
                }

                group.add(model);
                
                // Adiciona o nome do jogador
                if (name) {
                    // Criar a tag com o nome do jogador imediatamente
                    createPlayerNameTag(name, group, { x: 0, y: 110, z: 0 });
                }
            },
            // Callback de progresso
            (xhr) => {
                if (xhr.total) {
                    const percentComplete = (xhr.loaded / xhr.total) * 100;
                    console.log(`Carregando modelo do balão: ${Math.round(percentComplete)}%`);
                }
            },
            // Callback de erro
            (error) => {
                console.error('Erro ao carregar o modelo do balão:', error);
                
                // Cria um balão simples como fallback
                const balloonGeometry = new THREE.SphereGeometry(5, 32, 32);
                
                let balloonMaterial;
                
                // Se for um bot, aplicar a textura da bandeira correspondente
                if (isBot) {
                    let texturePath = '';
                    switch (botCountry) {
                        case 'USA':
                            texturePath = `${BASE_PATH}/eua_flag_texture_balloon.jpg`;
                            break;
                        case 'BRA':
                            texturePath = `${BASE_PATH}/brazil_flag_texture.jpg`;
                            break;
                        case 'GER':
                            texturePath = `${BASE_PATH}/ger_flag_texture_balloon.jpg`;
                            break;
                        case 'JPN':
                            texturePath = `${BASE_PATH}/jpn_flag_texture_balloon.jpg`;
                            break;
                        default:
                            // Usar cor padrão se não houver textura para o país
                            break;
                    }
                    
                    if (texturePath) {
                        console.log(`Aplicando textura de bandeira para ${botCountry}: ${texturePath}`);
                        const textureLoader = new THREE.TextureLoader();
                        const texture = textureLoader.load(texturePath, 
                            // Callback de sucesso
                            function(loadedTexture) {
                                console.log(`Textura carregada com sucesso: ${texturePath}`);
                            },
                            // Callback de progresso
                            undefined,
                            // Callback de erro
                            function(error) {
                                console.error(`Erro ao carregar textura ${texturePath}:`, error);
                            }
                        );
                        balloonMaterial = new THREE.MeshLambertMaterial({ map: texture });
                    } else {
                        // Fallback para cor padrão
                        balloonMaterial = new THREE.MeshLambertMaterial({ color: color });
                    }
                } else if (color === 'rainbow') {
                    console.log('Aplicando textura rainbow ao balão simples');
                    const textureLoader = new THREE.TextureLoader();
                    
                    // Tentar vários caminhos possíveis para a textura
                    const texturePaths = [
                        `${BASE_PATH}/rainbow_flag_texture.jpg`,
                        `${BASE_PATH}/rainbow_flag_texture.png`,
                        `/rainbow_flag_texture.jpg`,
                        `/rainbow_flag_texture.png`
                    ];
                    
                    function tryLoadTexture(pathIndex) {
                        if (pathIndex >= texturePaths.length) {
                            console.error('Não foi possível carregar a textura rainbow de nenhum caminho');
                            balloonMaterial = new THREE.MeshLambertMaterial({ color: 0xFF00FF });
                            return;
                        }
                        
                        const currentPath = texturePaths[pathIndex];
                        console.log(`Tentando carregar textura rainbow de: ${currentPath} (para balão simples)`);
                        
                        textureLoader.load(
                            currentPath,
                            // Callback de sucesso
                            function(texture) {
                                console.log(`Textura rainbow carregada com sucesso de: ${currentPath} (para balão simples)`);
                                balloonMaterial = new THREE.MeshLambertMaterial({ 
                                    map: texture,
                                    side: THREE.DoubleSide
                                });
                                console.log('Material do balão simples atualizado com a textura rainbow!');
                                
                                // Forçar atualização do material
                                balloonMaterial.needsUpdate = true;
                                texture.needsUpdate = true;
                            },
                            // Callback de progresso
                            undefined,
                            // Callback de erro
                            function(error) {
                                console.warn(`Erro ao carregar textura rainbow de ${currentPath} (para balão simples):`, error);
                                // Tentar o próximo caminho
                                tryLoadTexture(pathIndex + 1);
                            }
                        );
                    }
                    
                    // Iniciar tentativas de carregamento
                    tryLoadTexture(0);
                    
                    // Material temporário enquanto a textura carrega
                    balloonMaterial = new THREE.MeshLambertMaterial({ color: 0xFF00FF });
                } else {
                    balloonMaterial = new THREE.MeshLambertMaterial({ color: color });
                }
                
                const balloon = new THREE.Mesh(balloonGeometry, balloonMaterial);
                balloon.position.y = 0;
                group.add(balloon);
                
                // Adiciona a cesta
                const basketGeometry = new THREE.BoxGeometry(3, 2, 3);
                const basketMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
                const basket = new THREE.Mesh(basketGeometry, basketMaterial);
                basket.position.y = -7;
                group.add(basket);
                
                // Adiciona cordas
                const ropeGeometry = new THREE.CylinderGeometry(0.1, 0.1, 5, 8);
                const ropeMaterial = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
                
                const rope1 = new THREE.Mesh(ropeGeometry, ropeMaterial);
                rope1.position.set(2, -4.5, 2);
                group.add(rope1);
                
                const rope2 = new THREE.Mesh(ropeGeometry, ropeMaterial);
                rope2.position.set(-2, -4.5, 2);
                group.add(rope2);
                
                const rope3 = new THREE.Mesh(ropeGeometry, ropeMaterial);
                rope3.position.set(2, -4.5, -2);
                group.add(rope3);
                
                const rope4 = new THREE.Mesh(ropeGeometry, ropeMaterial);
                rope4.position.set(-2, -4.5, -2);
                group.add(rope4);
                
                // Adiciona o nome do jogador
                if (name) {
                    // Criar a tag com o nome do jogador imediatamente
                    createPlayerNameTag(name, group, { x: 0, y: 110, z: 0 });
                }
            }
        );
        
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
        if (event.key === 'w' || event.key === 'W') keys.W = true;
        if (event.key === 's' || event.key === 'S') keys.S = true;
        if (event.key === 'u' || event.key === 'U') keys.U = true;
        if (event.key === 'e' || event.key === 'E' && !window.markerDropped && window.markersLeft > 0) {
            dropMarker();
        }
    }

    function handleKeyUp(event) {
        if (event.key === 'w' || event.key === 'W') keys.W = false;
        if (event.key === 's' || event.key === 'S') keys.S = false;
        if (event.key === 'u' || event.key === 'U') keys.U = false;
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
    
        const markerGeometry = new THREE.SphereGeometry(4.5, 16, 16);
        const markerMaterial = new THREE.MeshLambertMaterial({ color: 0x0000FF });
        const newMarker = new THREE.Mesh(markerGeometry, markerMaterial);
        newMarker.position.set(markerStartPos.x, markerStartPos.y, markerStartPos.z);
        newMarker.userData = { markerId: markerId, playerId: window.socket.id };
        scene.add(newMarker);
    
        const tailGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, -45, 0)
        ]);
        const tailMaterial = new THREE.LineBasicMaterial({ color: 0xFFFFFF });
        const newTail = new THREE.Line(tailGeometry, tailMaterial);
        newTail.position.set(markerStartPos.x, markerStartPos.y, markerStartPos.z);
        newTail.userData = { markerId: markerId, playerId: window.socket.id };
        scene.add(newTail);
    
        if (!window.markers.some(m => m.markerId === markerId)) {
            window.markers.push({ marker: newMarker, tail: newTail, markerId: markerId, playerId: window.socket.id });
        }
    
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
                marker.position.y = Math.max(0, marker.position.y - 2.0);
                tail.position.y = marker.position.y;
                if (marker.position.y === 0) {
                    console.log(`Marcador atingiu o chão: ${m.markerId}, Posição: x=${marker.position.x}, y=${marker.position.y}, z=${marker.position.z}`);
                    window.socket.emit('markerLanded', {
                        x: marker.position.x,
                        y: marker.position.y,
                        z: marker.position.z,
                        mode: window.mode || 'world',
                        roomName: window.roomName || null,
                        markerId: m.markerId
                    });
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

    window.restartGame = async function() {
        gameOver = false;
        hasLiftedOff = false;
        altitude = 100;
        window.markerDropped = false;
        window.markersLeft = 5;
        points = 0;
        document.getElementById('loseScreen').style.display = 'none';
        document.getElementById('gameScreen').style.display = 'block';
        if (window.balloon && scene.children.includes(window.balloon)) {
            scene.remove(window.balloon);
            console.log('Balão anterior removido da cena:', window.balloon);
        }
        window.balloonColor = window.balloonColor || '#FF4500';
        const playerName = localStorage.getItem('playerName') || document.getElementById('playerName').value || 'Jogador';
        window.balloon = window.createBalloon(window.balloonColor, playerName);
        window.balloon.position.set(0, altitude, 0);
        scene.add(window.balloon);
        
        // Garantir que o nome do jogador seja adicionado com a posição correta
        createPlayerNameTag(playerName, window.balloon, { x: 0, y: 110, z: 0 });
        
        // Atualizar as tags de todos os outros jogadores também
        updatePlayerTags();
        
        document.getElementById('markersLeft').textContent = window.markersLeft;
        document.getElementById('points').textContent = points;
        window.socket.emit('updatePosition', { x: window.balloon.position.x, y: window.balloon.position.y, z: window.balloon.position.z, mode: window.mode || 'world', roomName: window.roomName || null });
    };

    function handleGamepad() {
        const gamepads = navigator.getGamepads();
        if (gamepads && gamepads[0]) {
            const gamepad = gamepads[0];
            const leftStickY = gamepad.axes[1];
            
            if (leftStickY < -0.2) {
                keys.W = true;
            } else if (leftStickY > 0.2) {
                keys.S = true;
            } else {
                keys.W = false;
                keys.S = false;
            }
            
            // Botão para turbo (U)
            if (gamepad.buttons[1].pressed) {
                keys.U = true;
            } else {
                keys.U = false;
            }
            
            // Botão para soltar marcador (E)
            if (gamepad.buttons[0].pressed && !window.markerDropped && window.markersLeft > 0) {
                dropMarker();
            }
        }
    }

    // Variável para controlar quando atualizar as tags
    let lastTagUpdateTime = 0;

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

        handleGamepad();

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

        // Armazenar a posição anterior para calcular o deslocamento
        prevBalloonX = balloon.position.x;
        prevBalloonZ = balloon.position.z;

        // Movimento vertical controlado pelo frontend
        if (keys.W) { altitude += 1; hasLiftedOff = true; }
        if (keys.U) { altitude += 5; hasLiftedOff = true; }
        if (keys.S) altitude = Math.max(20, altitude - 1);

        if (altitude <= 20 && hasLiftedOff) gameOver = true;

        altitude = Math.min(altitude, 500);
        balloon.position.y = altitude;

        // Não aplicamos mais o movimento horizontal aqui, isso é feito no backend
        // Apenas atualizamos a posição do balão com base nas informações do backend
        const player = window.socket.id ? (window.mode === 'world' ? window.worldState?.players[window.socket.id] : window.roomState?.players[window.socket.id]) : null;
        if (player) {
            balloon.position.x = player.x;
            balloon.position.z = player.z;
        }

        // Calcular o deslocamento
        const deltaX = balloon.position.x - prevBalloonX;
        const deltaZ = balloon.position.z - prevBalloonZ;

        // Rotacionar apenas o balão, não os nomes
        balloon.rotation.y += 0.001;
        
        // Garantir que os nomes dos jogadores não girem com o balão
        if (balloon && typeof balloon.traverse === 'function') {
            balloon.traverse((child) => {
                if (child.userData && child.userData.isPlayerTag && child.userData.noRotate) {
                    // Resetar a rotação para manter a orientação fixa
                    // Verificar se é o jogador principal ou outro jogador
                    const isCurrentPlayer = window.socket && child.userData.name === (localStorage.getItem('playerName') || 'Jogador');
                    
                    // Manter a rotação fixa - não girar com o balão
                    if (isCurrentPlayer) {
                        // Jogador principal - virado para o sul
                        child.rotation.y = Math.PI;
                    } else {
                        // Bots e outros jogadores - virados para o norte
                        child.rotation.y = 0;
                    }
                    
                    // Manter a posição Y fixa
                    child.position.y = 110;
                }
            });
        }
        
        // Fazer o mesmo para outros jogadores
        for (const id in window.otherPlayers) {
            if (window.otherPlayers[id] && typeof window.otherPlayers[id].traverse === 'function') {
                window.otherPlayers[id].traverse((child) => {
                    if (child.userData && child.userData.isPlayerTag && child.userData.noRotate) {
                        // Resetar a rotação para manter a orientação fixa - virado para o norte
                        child.rotation.y = 0;
                        
                        // Manter a posição Y fixa
                        child.position.y = 110;
                    }
                });
            }
        }

        // Enviar apenas a altitude para o backend
        window.socket.emit('updatePosition', { 
            y: altitude, 
            mode: window.mode || 'world', 
            roomName: window.roomName || null,
            keys: {
                W: keys.W,
                S: keys.S,
                U: keys.U
            }
        });

        // Logs a cada 10 segundos para verificar o movimento horizontal
        if (Date.now() - lastLogTime > 10000) {
            console.log("\n[FRONTEND LOG] ===== POSIÇÃO DO BALÃO E INFORMAÇÕES DE VENTO =====");
            console.log(`[FRONTEND LOG] Posição do balão: x=${balloon.position.x.toFixed(2)}, y=${balloon.position.y.toFixed(2)}, z=${balloon.position.z.toFixed(2)}`);
            console.log(`[FRONTEND LOG] Vento atual: ${player?.windDirection || 'Desconhecido'} (${player?.windSpeed || 0} m/s)`);
            console.log(`[FRONTEND LOG] Deslocamento: dx=${deltaX.toFixed(2)}, dz=${deltaZ.toFixed(2)}`);
            console.log("[FRONTEND LOG] ========================================================\n");
            lastLogTime = Date.now();
        }

        document.getElementById('altitude').textContent = `${Math.floor(altitude)}m`;
        const dx = balloon.position.x - (window.targets[0]?.x || 0);
        const dz = balloon.position.z - (window.targets[0]?.z || 0);
        const distance = Math.sqrt(dx * dx + dz * dz);
        document.getElementById('distanceToTarget').textContent = `${Math.floor(distance)}m`;
        
        // Usar as informações de vento do backend
        if (player) {
            document.getElementById('windDirection').textContent = player.windDirection || "Nenhum";
            document.getElementById('windSpeed').textContent = (player.windSpeed || 0).toFixed(1);
            document.getElementById('windIndicator').textContent = `Vento: ${player.windDirection ? player.windDirection.charAt(0) : "-"}`;
            
            // Atualizar o indicador de camada
            if (player.currentWindLayer !== undefined) {
                const currentLayer = player.currentWindLayer;
                for (let i = 1; i <= 5; i++) {
                    const element = document.getElementById(`layer${i}`);
                    if (element) {
                        if (i === currentLayer + 1) element.classList.add('active');
                        else element.classList.remove('active');
                    }
                }
            }
        }

        updateMarkers();

        // Atualizar as tags dos nomes apenas a cada 5 segundos para evitar lag
        if (currentTime - lastTagUpdateTime > 5000) {
            updatePlayerTags();
            lastTagUpdateTime = currentTime;
        }

        // Atualizar o GPS
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

    // Função para criar um nome de jogador no estilo COD MW3 (versão otimizada e robusta)
    function createPlayerNameTag(name, parent, position = { x: 0, y: 110, z: 0 }) {
        // Verificar se o parent existe
        if (!parent) {
            console.error('Erro: parent não definido ao criar tag para', name);
            return null;
        }
        
        // Verificar se o nome existe
        if (!name) {
            console.warn('Nome não fornecido ao criar tag');
            name = 'Jogador';
        }
        
        try {
            // Criar um objeto 3D simples para o nome
            const nameObj = new THREE.Object3D();
            nameObj.position.set(position.x, position.y, position.z);
            
            // Remover qualquer nome existente
            if (parent && typeof parent.traverse === 'function') {
                parent.traverse((child) => {
                    if (child.userData && (child.userData.isPlayerName || child.userData.isPlayerTag)) {
                        parent.remove(child);
                    }
                });
            } else {
                console.warn('Parent não possui método traverse ao criar tag para', name);
            }
            
            // Obter dados do jogador
            const targetsHit = localStorage.getItem('profileTargets') || '0';
            
            // Determinar a posição no ranking (simplificado)
            let rankPosition = 1;
            try {
                const currentState = window.mode === 'world' ? window.worldState : window.roomState;
                if (currentState && currentState.players) {
                    const players = Object.values(currentState.players);
                    const sortedPlayers = players.sort((a, b) => b.score - a.score);
                    const socketId = window.socket ? window.socket.id : null;
                    const playerIndex = sortedPlayers.findIndex(player => player.id === socketId);
                    if (playerIndex >= 0) {
                        rankPosition = playerIndex + 1;
                    }
                }
            } catch (e) {
                console.warn('Erro ao determinar posição no ranking:', e);
                rankPosition = 1;
            }
            
            nameObj.userData = { 
                isPlayerTag: true,
                name: name,
                rank: rankPosition,
                noRotate: true // Marcar para não rotacionar
            };
            
            // Criar um retângulo preto para o fundo do nome
            const nameBackground = new THREE.Mesh(
                new THREE.PlaneGeometry(30, 8),
                new THREE.MeshBasicMaterial({ 
                    color: 0x000000, 
                    transparent: true, 
                    opacity: 0.7,
                    depthTest: false,
                    side: THREE.DoubleSide
                })
            );
            
            // Criar um quadrado colorido para o ranking
            let balloonColorValue = 0xFF4500;
            try {
                if (window.balloonColor) {
                    if (window.balloonColor === 'rainbow') {
                        balloonColorValue = 0xFF4500;
                    } else if (typeof window.balloonColor === 'string') {
                        balloonColorValue = new THREE.Color(window.balloonColor);
                    }
                }
            } catch (e) {
                console.warn('Erro ao processar cor do balão:', e);
            }
            
            const rankBackground = new THREE.Mesh(
                new THREE.PlaneGeometry(8, 8),
                new THREE.MeshBasicMaterial({ 
                    color: balloonColorValue, 
                    transparent: true, 
                    opacity: 0.9,
                    depthTest: false,
                    side: THREE.DoubleSide
                })
            );
            
            // Posicionar os elementos
            nameBackground.position.set(0, 0, 0);
            rankBackground.position.set(19, 0, 0);
            
            // Adicionar ao objeto principal
            nameObj.add(nameBackground);
            nameObj.add(rankBackground);
            
            // Criar o texto do nome usando canvas (método mais leve)
            try {
                const nameCanvas = document.createElement('canvas');
                nameCanvas.width = 256;
                nameCanvas.height = 64;
                const nameCtx = nameCanvas.getContext('2d');
                
                // Limpar o canvas com fundo transparente
                nameCtx.clearRect(0, 0, nameCanvas.width, nameCanvas.height);
                
                // Configurar o texto do nome - BRANCO BRILHANTE
                nameCtx.font = 'bold 32px Arial';
                nameCtx.fillStyle = '#FFFFFF'; // Branco puro
                
                // Adicionar contorno preto para melhorar a visibilidade
                nameCtx.strokeStyle = '#000000';
                nameCtx.lineWidth = 3;
                nameCtx.textAlign = 'center';
                nameCtx.textBaseline = 'middle';
                
                // Desenhar o contorno e depois o texto
                nameCtx.strokeText(name, 128, 24);
                nameCtx.fillText(name, 128, 24); // Ajustado para cima para dar espaço ao número de alvos
                
                // Adicionar o número de alvos acertados - BRANCO BRILHANTE
                nameCtx.font = '20px Arial';
                nameCtx.fillStyle = '#FFFFFF'; // Branco puro
                nameCtx.strokeStyle = '#000000';
                nameCtx.lineWidth = 2;
                
                // Desenhar o contorno e depois o texto
                nameCtx.strokeText(`Alvos: ${targetsHit}`, 128, 48);
                nameCtx.fillText(`Alvos: ${targetsHit}`, 128, 48); // Abaixo do nome
                
                // Criar textura para o nome
                const nameTexture = new THREE.CanvasTexture(nameCanvas);
                nameTexture.needsUpdate = true;
                
                const nameMaterial = new THREE.MeshBasicMaterial({
                    map: nameTexture,
                    transparent: true,
                    depthTest: false,
                    side: THREE.DoubleSide
                });
                
                // Criar plano para o texto do nome
                const nameTextPlane = new THREE.Mesh(
                    new THREE.PlaneGeometry(28, 6),
                    nameMaterial
                );
                nameTextPlane.position.set(0, 0, 0.1);
                nameBackground.add(nameTextPlane);
            } catch (e) {
                console.warn('Erro ao criar texto do nome:', e);
            }
            
            // Criar o texto do ranking usando canvas
            try {
                const rankCanvas = document.createElement('canvas');
                rankCanvas.width = 64;
                rankCanvas.height = 64;
                const rankCtx = rankCanvas.getContext('2d');
                
                // Limpar o canvas com fundo transparente
                rankCtx.clearRect(0, 0, rankCanvas.width, rankCanvas.height);
                
                // Configurar o texto do ranking - BRANCO BRILHANTE
                rankCtx.font = 'bold 40px Arial';
                rankCtx.fillStyle = '#FFFFFF'; // Branco puro
                rankCtx.strokeStyle = '#000000';
                rankCtx.lineWidth = 3;
                rankCtx.textAlign = 'center';
                rankCtx.textBaseline = 'middle';
                
                // Desenhar o contorno e depois o texto
                rankCtx.strokeText(rankPosition.toString(), 32, 32);
                rankCtx.fillText(rankPosition.toString(), 32, 32);
                
                // Criar textura para o ranking
                const rankTexture = new THREE.CanvasTexture(rankCanvas);
                rankTexture.needsUpdate = true; // Garantir que a textura seja atualizada
                
                const rankMaterial = new THREE.MeshBasicMaterial({
                    map: rankTexture,
                    transparent: true,
                    depthTest: false,
                    side: THREE.DoubleSide
                });
                
                // Criar plano para o texto do ranking
                const rankTextPlane = new THREE.Mesh(
                    new THREE.PlaneGeometry(6, 6),
                    rankMaterial
                );
                rankTextPlane.position.set(0, 0, 0.1);
                rankBackground.add(rankTextPlane);
            } catch (e) {
                console.warn('Erro ao criar texto do ranking:', e);
            }
            
            // Verificar se é um bot ou outro jogador (não o jogador principal)
            const isCurrentPlayer = window.socket && name === (localStorage.getItem('playerName') || 'Jogador');
            
            // Rotacionar para ficar virado para a câmera
            if (isCurrentPlayer) {
                // Jogador principal - virado para o sul
                nameObj.rotation.y = Math.PI;
            } else {
                // Bots e outros jogadores - virados para o norte
                nameObj.rotation.y = 0;
            }
            
            // Adicionar ao pai
            if (parent) {
                parent.add(nameObj);
            }
            
            return nameObj;
        } catch (error) {
            console.error('Erro ao criar tag para', name, error);
            return null;
        }
    }
    
    // Função para atualizar as tags dos nomes (com atualização de ranking)
    function updatePlayerTags() {
        try {
            // Atualizar a tag do jogador principal
            if (balloon) {
                let hasNameTag = false;
                let currentRank = 0;
                
                // Determinar a posição atual no ranking
                try {
                    const currentState = window.mode === 'world' ? window.worldState : window.roomState;
                    if (currentState && currentState.players) {
                        const players = Object.values(currentState.players);
                        const sortedPlayers = players.sort((a, b) => b.score - a.score);
                        const socketId = window.socket ? window.socket.id : null;
                        const playerIndex = sortedPlayers.findIndex(player => player.id === socketId);
                        if (playerIndex >= 0) {
                            currentRank = playerIndex + 1;
                        }
                    }
                } catch (e) {
                    console.warn('Erro ao determinar ranking na atualização de tags:', e);
                    currentRank = 1;
                }
                
                // Verificar se a tag existe e se a posição no ranking mudou
                try {
                    if (balloon && typeof balloon.traverse === 'function') {
                        balloon.traverse((child) => {
                            if (child.userData && child.userData.isPlayerTag) {
                                hasNameTag = true;
                                
                                // Se a posição no ranking mudou, recriar a tag
                                if (child.userData.rank !== currentRank) {
                                    const playerName = child.userData.name;
                                    balloon.remove(child);
                                    const newTag = createPlayerNameTag(playerName, balloon, { x: 0, y: 110, z: 0 });
                                    if (newTag) {
                                        newTag.userData.rank = currentRank;
                                    }
                                }
                            }
                        });
                    } else {
                        console.warn('Balão não possui método traverse na atualização de tags');
                        hasNameTag = false;
                    }
                } catch (e) {
                    console.warn('Erro ao verificar tag existente:', e);
                    hasNameTag = false;
                }
                
                if (!hasNameTag) {
                    try {
                        const playerName = localStorage.getItem('playerName') || 'Jogador';
                        const newTag = createPlayerNameTag(playerName, balloon, { x: 0, y: 110, z: 0 });
                        if (newTag) {
                            newTag.userData.rank = currentRank;
                        }
                    } catch (e) {
                        console.error('Erro ao criar nova tag para jogador principal:', e);
                    }
                }
            }
            
            // Atualizar as tags dos outros jogadores
            try {
                for (const id in window.otherPlayers) {
                    if (window.otherPlayers[id]) {
                        let hasNameTag = false;
                        try {
                            if (window.otherPlayers[id] && typeof window.otherPlayers[id].traverse === 'function') {
                                window.otherPlayers[id].traverse((child) => {
                                    if (child.userData && child.userData.isPlayerTag) {
                                        hasNameTag = true;
                                    }
                                });
                            } else {
                                console.warn(`Jogador ${id} não possui método traverse`);
                                hasNameTag = false;
                            }
                        } catch (e) {
                            console.warn(`Erro ao verificar tag para jogador ${id}:`, e);
                            hasNameTag = false;
                        }
                        
                        if (!hasNameTag) {
                            try {
                                const player = window.worldState?.players[id] || window.roomState?.players[id];
                                if (player && player.name) {
                                    createPlayerNameTag(player.name, window.otherPlayers[id], { x: 0, y: 110, z: 0 });
                                }
                            } catch (e) {
                                console.error(`Erro ao criar tag para jogador ${id}:`, e);
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Erro ao atualizar tags de outros jogadores:', e);
            }
        } catch (e) {
            console.error('Erro geral na função updatePlayerTags:', e);
        }
    }

    // Função para criar um billboard com o nome do jogador (mantida para compatibilidade)
    function createPlayerNameBillboard(name, parent, position = { x: 0, y: 120, z: 0 }) {
        // Agora apenas chama a nova função
        return createPlayerNameTag(name, parent, { x: 0, y: 110, z: 0 });
    }
    
    // Expor a função globalmente para compatibilidade
    window.createPlayerNameBillboard = createPlayerNameBillboard;
    
    // Substituir a função updateNameBillboards pela nova
    function updateNameBillboards() {
        updatePlayerTags();
    }

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
        if (window.balloon && scene.children.includes(window.balloon)) {
            scene.remove(window.balloon);
            console.log('Balão anterior removido da cena:', window.balloon);
        }
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
    
    // Função para inicializar o estado do jogo
    window.initGameState = function(state) {
        if (!state) return;
        
        // Verificar se o jogador atual existe no estado
        if (window.socket && state.players && state.players[window.socket.id]) {
            const player = state.players[window.socket.id];
            
            // Atualizar informações de vento na UI
            if (player.windDirection) {
                document.getElementById('windDirection').textContent = player.windDirection;
            }
            if (player.windSpeed !== undefined) {
                document.getElementById('windSpeed').textContent = player.windSpeed.toFixed(1);
            }
            if (player.windDirection) {
                document.getElementById('windIndicator').textContent = `Vento: ${player.windDirection.charAt(0)}`;
            }
            
            // Atualizar o indicador de camada
            if (player.currentWindLayer !== undefined) {
                const currentLayer = player.currentWindLayer;
                for (let i = 1; i <= 5; i++) {
                    const element = document.getElementById(`layer${i}`);
                    if (element) {
                        if (i === currentLayer + 1) element.classList.add('active');
                        else element.classList.remove('active');
                    }
                }
            }
        }
    };
}