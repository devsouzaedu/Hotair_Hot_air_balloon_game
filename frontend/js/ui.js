console.log('ui.js carregado');
export function initUI() {
    window.balloonColor = null;
    window.mode = null;
    window.roomName = null;
    window.isCreator = false; // Adicionado para rastrear se o jogador é criador

    document.getElementById('createRoomButton').addEventListener('click', () => {
        const inputRoomName = document.getElementById('roomName').value.trim();
        if (inputRoomName) {
            window.roomName = inputRoomName;
            if (!window.socket) {
                console.error('Socket não está inicializado.');
                return;
            }
            window.socket.emit('createRoom', { name: window.roomName });
            window.isCreator = true; // Marca como criador
            document.getElementById('roomScreen').style.display = 'none';
            document.getElementById('lobbyScreen').style.display = 'flex';
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

    window.socket.on('roomCreated', (data) => {
        if (data.creator === window.socket.id) {
            window.isCreator = true;
            document.getElementById('lobbyScreen').style.display = 'flex';
            document.getElementById('startRoomButton').style.display = 'block';
        }
    });

    window.socket.on('playerJoined', ({ players, creator }) => {
        const playersList = document.getElementById('playersList');
        if (playersList) {
            playersList.innerHTML = '';
            for (const id in players) {
                const playerDiv = document.createElement('div');
                playerDiv.textContent = players[id].name;
                playersList.appendChild(playerDiv);
            }
        }
        window.isCreator = (creator === window.socket.id);
        document.getElementById('startRoomButton').style.display = window.isCreator ? 'block' : 'none';
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