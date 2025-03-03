// libraair_/frontend/js/main.js
import { initUI } from './ui.js';
import { initGame } from './game.js';
import { initSocket } from './socket.js';

document.addEventListener('DOMContentLoaded', () => {
    // Verificar autenticação ao carregar a página
    fetch('https://hotair-backend.onrender.com/auth/check', { credentials: 'include' })
        .then(response => response.json())
        .then(data => {
            if (data.authenticated) {
                if (!data.user.nickname) {
                    document.getElementById('nicknameForm').style.display = 'block';
                    document.getElementById('googleLoginButton').style.display = 'none';
                } else {
                    showProfile(data.user);
                }
            }
        })
        .catch(err => console.error('Erro ao verificar autenticação:', err));

    // Login com Google
    const googleLoginButton = document.getElementById('googleLoginButton');
    if (googleLoginButton) {
        googleLoginButton.addEventListener('click', () => {
            console.log('Botão de login clicado');
            // Inicializar o Google Identity Services apenas quando o botão é clicado
            if (typeof google === 'undefined') {
                console.error('Google Identity Services não carregado ainda');
                return;
            }
            const client = google.accounts.oauth2.initCodeClient({
                client_id: '977819867201-unkn3raoa1evunhpcrm6ipqtejbnec0n.apps.googleusercontent.com',
                scope: 'profile email',
                ux_mode: 'popup',
                callback: (response) => {
                    console.log('Código de autorização obtido:', response.code);
                    window.location.href = `https://hotair-backend.onrender.com/auth/google/callback?code=${response.code}`;
                },
                error_callback: (error) => {
                    console.error('Erro ao fazer login com Google:', error);
                }
            });
            client.requestCode();
        });
    } else {
        console.error('Elemento googleLoginButton não encontrado');
    }

    // Definir Nickname
    const setNicknameButton = document.getElementById('setNicknameButton');
    if (setNicknameButton) {
        setNicknameButton.addEventListener('click', () => {
            const nickname = document.getElementById('nicknameInput').value;
            fetch('https://hotair-backend.onrender.com/auth/set-nickname', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nickname }),
                credentials: 'include'
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

    // Iniciar Jogo
    const startGameButton = document.getElementById('startGameButton');
    if (startGameButton) {
        startGameButton.addEventListener('click', () => {
            document.getElementById('profileScreen').style.display = 'none';
            document.getElementById('modeScreen').style.display = 'flex';
            initGame();
            initSocket();
            initUI();
        });
    }

    // Modo de Jogo
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
});

function showProfile(user) {
    fetch('https://hotair-backend.onrender.com/profile', { credentials: 'include' })
        .then(response => response.json())
        .then(profile => {
            document.getElementById('nameScreen').style.display = 'none';
            document.getElementById('profileScreen').style.display = 'flex';
            document.getElementById('profileNickname').textContent = profile.nickname;
            document.getElementById('profileTargetsHit').textContent = profile.targetsHit;
            document.getElementById('profileTotalPoints').textContent = profile.totalPoints;
            document.getElementById('profileJoinDate').textContent = new Date(profile.joinDate).toLocaleDateString();
        })
        .catch(err => console.error('Erro ao carregar perfil:', err));
}