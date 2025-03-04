console.log('ui.js carregado');
export function initUI() {
    window.balloonColor = null;
    window.mode = null;
    window.roomName = null;

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
            fetch('https://hotair-backend.onrender.com/profile', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('jwtToken')}` }
            })
            .then(response => {
                if (!response.ok) throw new Error(`Erro ${response.status}`);
                return response.json();
            })
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