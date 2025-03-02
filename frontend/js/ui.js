export function initUI() {
    let balloonColor = null;
    let playerName = '';
    let mode = null;
    let roomName = null;

    document.getElementById('nameButton').addEventListener('click', () => {
        playerName = document.getElementById('playerName').value.trim();
        if (playerName) {
            document.getElementById('nameScreen').style.display = 'none';
            document.getElementById('modeScreen').style.display = 'flex';
        } else {
            alert("Digite seu nome!");
        }
    });

    document.getElementById('playNowButton').addEventListener('click', () => {
        mode = 'world';
        document.getElementById('modeScreen').style.display = 'none';
        document.getElementById('colorScreen').style.display = 'flex';
    });

    document.getElementById('roomModeButton').addEventListener('click', () => {
        mode = 'room';
        document.getElementById('modeScreen').style.display = 'none';
        document.getElementById('roomScreen').style.display = 'flex';
    });

    document.querySelectorAll('.colorButton').forEach(button => {
        button.addEventListener('click', () => {
            balloonColor = button.getAttribute('data-color');
        });
    });

    document.getElementById('okButton').addEventListener('click', () => {
        if (balloonColor) {
            document.getElementById('colorScreen').style.display = 'none';
            if (mode === 'world') {
                window.socket.emit('joinNow', { name: playerName, color: balloonColor });
            } else if (mode === 'room' && roomName) {
                window.socket.emit('setColor', { roomName, color: balloonColor });
                window.socket.emit('joinRoom', { roomName, playerData: { name: playerName, color: balloonColor } });
                document.getElementById('lobbyScreen').style.display = 'flex';
            }
        } else {
            alert("Escolha uma cor!");
        }
    });

    document.getElementById('createRoomButton').addEventListener('click', () => {
        const inputRoomName = document.getElementById('roomName').value.trim();
        if (inputRoomName) {
            roomName = inputRoomName;
            window.socket.emit('createRoom', { name: roomName });
        } else {
            alert("Digite o nome da sala!");
        }
    });

    document.getElementById('joinRoomButton').addEventListener('click', () => {
        const inputRoomName = document.getElementById('roomName').value.trim();
        if (inputRoomName) {
            roomName = inputRoomName;
            window.socket.emit('joinRoom', { roomName, playerData: { name: playerName, color: null } });
            document.getElementById('roomScreen').style.display = 'none';
            document.getElementById('colorScreen').style.display = 'flex';
        } else {
            alert("Digite o nome da sala!");
        }
    });

    document.getElementById('startRoomButton').addEventListener('click', () => {
        if (window.isCreator) {
            window.socket.emit('startRoom', { roomName });
        }
    });

    document.getElementById('restartButton').addEventListener('click', () => {
        window.restartGame();
    });
}