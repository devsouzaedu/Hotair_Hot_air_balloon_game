export function initUI() {
    // Mostrar apenas a tela de login inicialmente (controlado por main.js)
    // Esconder todas as outras telas (controlado por main.js)

    window.balloonColor = null;
    window.mode = null;
    window.roomName = null;
    let playerName = localStorage.getItem('playerName') || 'Aventureiro'; // Usa o nome do Google ou fallback

    document.getElementById('playNowButton').addEventListener('click', () => {
        window.mode = 'world';
        document.getElementById('modeScreen').style.display = 'none';
        document.getElementById('colorScreen').style.display = 'flex';
    });

    document.getElementById('roomModeButton').addEventListener('click', () => {
        window.mode = 'room';
        document.getElementById('modeScreen').style.display = 'none';
        document.getElementById('roomScreen').style.display = 'flex';
    });

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
            if (window.mode === 'world') {
                window.socket.emit('joinNow', { name: playerName, color: window.balloonColor });
            } else if (window.mode === 'room' && window.roomName) {
                window.socket.emit('setColor', { roomName: window.roomName, color: window.balloonColor });
                window.socket.emit('joinRoom', { roomName: window.roomName, playerData: { name: playerName, color: window.balloonColor } });
                document.getElementById('lobbyScreen').style.display = 'flex';
            } else {
                console.error('Modo ou nome da sala não definidos:', { mode: window.mode, roomName: window.roomName });
            }
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
            window.socket.emit('joinRoom', { roomName: window.roomName, playerData: { name: playerName, color: null } });
            document.getElementById('roomScreen').style.display = 'none';
            document.getElementById('colorScreen').style.display = 'flex';
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