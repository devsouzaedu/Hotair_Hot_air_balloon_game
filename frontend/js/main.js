import { initUI } from './ui.js';
import { initGame } from './game.js';
import { initSocket } from './socket.js';

document.addEventListener('DOMContentLoaded', () => {
    // Verificar autenticação
    fetch('https://hotair-backend.onrender.com/auth/check', { 
        credentials: 'include',
        mode: 'cors'
    })
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

    const googleLoginButton = document.getElementById('googleLoginButton');
    if (googleLoginButton) {
        googleLoginButton.addEventListener('click', () => {
            window.location.href = 'https://hotair-backend.onrender.com/auth/google';
        });
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
                credentials: 'include',
                mode: 'cors'
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