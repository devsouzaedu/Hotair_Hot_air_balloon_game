// libraair_/frontend/js/ui.js
export function initUI() {
    window.balloonColor = null;
    window.mode = null; // Inicializa explicitamente
    window.roomName = null; // Inicializa explicitamente

    // Configurar eventos apenas para elementos que existem após autenticação
    document.querySelectorAll('.colorButton').forEach(button => {
        button.addEventListener('click', () => {
            window.balloonColor = button.getAttribute('data-color');
        });
    });

    document.getElementById('okButton').addEventListener('click', () => {
        if (window.balloonColor) {
            document.getElementById('colorScreen').style.display = 'none';
            if (!window.socket) {
                console.error('Socket não está inicializado.');
                return;
            }
            fetch('https://hotair-backend.onrender.com/profile', { credentials: 'include' })
                .then(response => response.json())
                .then(profile => {
                    const playerName = profile.nickname;
                    if (window.mode === 'world') {
                        window.socket.emit('joinNow', { name: playerName, color: window.balloonColor });
                    } else if (window.mode === 'room' && window.roomName) {
                        window.socket.emit('setColor', { roomName: window.roomName, color: window.balloonColor });
                        window.socket.emit('joinRoom', { roomName: window.roomName, playerData: { name: playerName, color: window.balloonColor } });
                        document.getElementById('lobbyScreen').style.display = 'flex';
                    } else {
                        console.error('Modo ou nome da sala não definidos:', { mode: window.mode, roomName: window.roomName });
                    }
                })
                .catch(err => console.error('Erro ao obter perfil para nome:', err));
        } else {
            alert("Escolha uma cor!");
        }
    });

    document.getElementById('createRoomButton').addEventListener('click', () => {
        const inputRoomName = document.getElementById('roomName').value.trim();
        if (inputRoomName) {
            window.roomName = inputRoomName;
            if (!window.socket) {
                console.error('Socket não está inicializado.');
                return;
            }
            window.socket.emit('createRoom', { name: window.roomName });
        } else {
            alert("Digite o nome da sala!");
        }
    });

    document.getElementById('joinRoomButton').addEventListener('click', () => {
        const inputRoomName = document.getElementById('roomName').value.trim();
        if (inputRoomName) {
            window.roomName = inputRoomName;
            if (!window.socket) {
                console.error('Socket não está inicializado.');
                return;
            }
            fetch('https://hotair-backend.onrender.com/profile', { credentials: 'include' })
                .then(response => response.json())
                .then(profile => {
                    window.socket.emit('joinRoom', { roomName: window.roomName, playerData: { name: profile.nickname, color: null } });
                    document.getElementById('roomScreen').style.display = 'none';
                    document.getElementById('colorScreen').style.display = 'flex';
                })
                .catch(err => console.error('Erro ao obter perfil para nome:', err));
        } else {
            alert("Digite o nome da sala!");
        }
    });

    document.getElementById('startRoomButton').addEventListener('click', () => {
        if (window.isCreator && window.socket) {
            window.socket.emit('startRoom', { roomName: window.roomName });
        }
    });

    document.getElementById('restartButton').addEventListener('click', () => {
        window.restartGame();
    });
}