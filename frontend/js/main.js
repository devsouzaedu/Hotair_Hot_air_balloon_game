console.log('main.js carregado');
import { initUI } from './ui.js';
import { initGame } from './game.js';
import { initSocket } from './socket.js';

const BASE_URL = 'https://devsouzaedu.github.io/Hotair_Hot_air_balloon_game/';

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const authStatus = urlParams.get('auth');
    const token = urlParams.get('token');

    if (authStatus === 'success' && token) {
        localStorage.setItem('jwtToken', token);
        checkAuthentication();
    } else if (authStatus === 'failed') {
        alert('Falha na autenticação com Google. Tente novamente.');
        window.history.replaceState({}, document.title, BASE_URL);
    } else {
        checkAuthentication();
    }

    const googleLoginButton = document.getElementById('googleLoginButton');
    if (googleLoginButton) {
        googleLoginButton.addEventListener('click', () => {
            window.location.href = 'https://hotair-backend.onrender.com/auth/google';
        });
    }

    const setNicknameButton = document.getElementById('setNicknameButton');
    if (setNicknameButton) {
        setNicknameButton.addEventListener('click', () => {
            const nickname = document.getElementById('nicknameInput').value;
            const token = localStorage.getItem('jwtToken');
            fetch('https://hotair-backend.onrender.com/auth/set-nickname', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ nickname })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showProfile({ googleId: data.googleId, nickname: data.nickname });
                } else {
                    alert(data.error);
                }
            })
            .catch(err => console.error('Erro ao definir nickname:', err));
        });
    }

    const startGameButton = document.getElementById('startGameButton');
    if (startGameButton) {
        startGameButton.addEventListener('click', () => {
            console.log('startGameButton clicado');
            document.getElementById('profileScreen').style.display = 'none';
            document.getElementById('modeScreen').style.display = 'flex';
            initGame(); // Inicializa variáveis e funções do jogo
        });
    }

    const playNowButton = document.getElementById('playNowButton');
    if (playNowButton) {
        playNowButton.addEventListener('click', () => {
            window.mode = 'world';
            document.getElementById('modeScreen').style.display = 'none';
            document.getElementById('colorScreen').style.display = 'flex';
        });
    }

    const roomModeButton = document.getElementById('roomModeButton');
    if (roomModeButton) {
        roomModeButton.addEventListener('click', () => {
            document.getElementById('modeScreen').style.display = 'none';
            document.getElementById('roomScreen').style.display = 'flex';
        });
    }

    const okButton = document.getElementById('okButton');
    let selectedColor = '#FF4500'; // Cor padrão

    document.querySelectorAll('.colorButton').forEach(button => {
        button.addEventListener('click', () => {
            selectedColor = button.getAttribute('data-color');
            document.querySelectorAll('.colorButton').forEach(btn => btn.classList.remove('selected'));
            button.classList.add('selected');
        });
    });

    if (okButton) {
        okButton.addEventListener('click', () => {
            console.log('okButton clicado, cor selecionada:', selectedColor);
            document.getElementById('colorScreen').style.display = 'none';
            document.getElementById('gameScreen').style.display = 'block';
            initSocket(); // Inicializa o socket aqui, quando o jogo realmente começa
            initUI();     // Inicializa a UI aqui
            const token = localStorage.getItem('jwtToken');
            fetch('https://hotair-backend.onrender.com/auth/check', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            .then(response => response.json())
            .then(data => {
                if (data.authenticated) {
                    window.socket.emit('joinNow', { color: selectedColor });
                }
            })
            .catch(err => console.error('Erro ao verificar autenticação ao entrar no jogo:', err));
        });
    }
});

function checkAuthentication() {
    const token = localStorage.getItem('jwtToken');
    if (!token) {
        document.getElementById('nameScreen').style.display = 'block';
        window.history.replaceState({}, document.title, BASE_URL);
        return;
    }

    fetch('https://hotair-backend.onrender.com/auth/check', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        document.getElementById('nameScreen').style.display = 'none';
        if (data.authenticated) {
            if (!data.user.nickname) {
                document.getElementById('nicknameForm').style.display = 'block';
                document.getElementById('googleLoginButton').style.display = 'none';
            } else {
                showProfile(data.user);
            }
        } else {
            localStorage.removeItem('jwtToken');
            document.getElementById('nameScreen').style.display = 'block';
        }
        window.history.replaceState({}, document.title, BASE_URL);
    })
    .catch(err => {
        console.error('Erro ao verificar autenticação:', err);
        localStorage.removeItem('jwtToken');
        document.getElementById('nameScreen').style.display = 'block';
        window.history.replaceState({}, document.title, BASE_URL);
    });
}

function showProfile(user) {
    const token = localStorage.getItem('jwtToken');
    fetch('https://hotair-backend.onrender.com/profile', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status}`);
        }
        return response.json();
    })
    .then(profile => {
        document.getElementById('nameScreen').style.display = 'none';
        document.getElementById('profileScreen').style.display = 'flex';
        document.getElementById('profileNickname').textContent = profile.nickname;
        document.getElementById('profileTargetsHit').textContent = profile.targetsHit;
        document.getElementById('profileTotalPoints').textContent = profile.totalPoints;
        document.getElementById('profileJoinDate').textContent = new Date(profile.joinDate).toLocaleDateString();
    })
    .catch(err => {
        console.error('Erro ao carregar perfil:', err);
        localStorage.removeItem('jwtToken');
        document.getElementById('nameScreen').style.display = 'block';
    });
}