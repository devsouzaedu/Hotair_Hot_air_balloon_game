import { initUI } from './ui.js';
import { initGame } from './game.js';
import { initSocket } from './socket.js';
// Adicione isso antes das rotas existentes no server.js
app.get('/auth/google/callback', (req, res, next) => {
    passport.authenticate('google', { failureRedirect: '/' }, (err, user, info) => {
        if (err) {
            console.error('Erro na autenticação:', err);
            return res.status(500).send('Erro na autenticação');
        }
        if (!user) {
            console.error('Usuário não autenticado:', info);
            return res.status(401).send('Falha na autenticação');
        }
        req.logIn(user, (loginErr) => {
            if (loginErr) {
                console.error('Erro ao logar:', loginErr);
                return res.status(500).send('Erro ao logar');
            }
            res.redirect('https://devsouzaedu.github.io/?auth=success');
        });
    })(req, res, next);
});

// Carregar Google Auth2
gapi.load('auth2', () => {
    gapi.auth2.init({
        client_id: '977819867201-unkn3raoa1evunhpcrm6ipqtejbnec0n.apps.googleusercontent.com'
    });
});

document.addEventListener('DOMContentLoaded', () => {
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

    const googleLoginButton = document.getElementById('googleLoginButton');
    if (googleLoginButton) {
        googleLoginButton.addEventListener('click', () => {
            console.log('Botão de login clicado');
            const auth2 = gapi.auth2.getAuthInstance();
            auth2.grantOfflineAccess().then(response => {
                const idToken = response.code;
                console.log('Código de autorização obtido:', idToken);
                window.location.href = `https://hotair-backend.onrender.com/auth/google/callback?code=${idToken}`;
            }).catch(err => console.error('Erro ao fazer login com Google:', err));
        });
    } else {
        console.error('Elemento googleLoginButton não encontrado');
    }

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