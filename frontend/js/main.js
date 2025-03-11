import { initUI } from './ui.js';
import { initGame } from './game.js';
import { initSocket } from './socket.js';

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.style.display = 'none';
    });
    document.getElementById(screenId).style.display = 'flex';
}

// Função para verificar se o token JWT é válido
function isTokenValid(token) {
    if (!token) return false;
    
    try {
        // Decodifica o token JWT (formato: header.payload.signature)
        const base64Url = token.split('.')[1];
        if (!base64Url) return false;
        
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        const payload = JSON.parse(jsonPayload);
        
        // Verifica se o token expirou
        if (payload.exp) {
            const expirationTime = payload.exp * 1000; // Converte para milissegundos
            const currentTime = Date.now();
            return currentTime < expirationTime;
        }
        
        return true; // Se não tiver data de expiração, consideramos válido
    } catch (error) {
        console.error('Erro ao verificar token:', error);
        return false;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Captura o token da URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    // Inicializa os módulos
    initSocket();
    initUI();
    initGame();

    // Configura o botão "Começar a Jogar"
    document.getElementById('continueButton').addEventListener('click', () => {
        showScreen('modeScreen');
    });

    if (token) {
        try {
            console.log('Token capturado da URL:', token);
            // Faz a requisição ao backend para pegar os dados do jogador
            const backendUrl = 'https://hotair-backend.onrender.com/api/profile';
                
            const response = await fetch(backendUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Erro na requisição: ${response.status} - ${response.statusText}`);
            }

            const playerData = await response.json();
            console.log('Dados do jogador recebidos:', playerData);
            localStorage.setItem('jwtToken', token); // Armazena o token
            localStorage.setItem('playerName', playerData.name); // Armazena o nome

            // Preenche os dados na tela de perfil
            document.getElementById('profileName').textContent = playerData.name || 'Aventureiro';
            document.getElementById('profilePicture').src = playerData.picture || 'default-avatar.png';
            document.getElementById('profileScore').textContent = playerData.totalScore || 0;
            document.getElementById('profileTargets').textContent = playerData.targetsHit || 0;
            document.getElementById('profileStartDate').textContent = new Date(playerData.startDate).toLocaleDateString('pt-BR');

            // Mostra a tela de perfil
            showScreen('profileScreen');

            // Remove o token da URL
            window.history.replaceState({}, document.title, '/Hotair_Hot_air_balloon_game/');
        } catch (error) {
            console.error('Erro ao carregar perfil:', error.message);
            console.error('Stack trace:', error.stack);
            showScreen('loginScreen');
        }
    } else {
        // Verifica se já existe um token no localStorage
        const storedToken = localStorage.getItem('jwtToken');
        if (storedToken && isTokenValid(storedToken)) {
            console.log('Token válido encontrado no localStorage');
            try {
                // Faz a requisição ao backend para pegar os dados do jogador
                const backendUrl = 'https://hotair-backend.onrender.com/api/profile';
                    
                const response = await fetch(backendUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${storedToken}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error(`Erro na requisição: ${response.status} - ${response.statusText}`);
                }

                const playerData = await response.json();
                console.log('Dados do jogador recebidos:', playerData);
                localStorage.setItem('playerName', playerData.name); // Armazena o nome

                // Preenche os dados na tela de perfil
                document.getElementById('profileName').textContent = playerData.name || 'Aventureiro';
                document.getElementById('profilePicture').src = playerData.picture || 'default-avatar.png';
                document.getElementById('profileScore').textContent = playerData.totalScore || 0;
                document.getElementById('profileTargets').textContent = playerData.targetsHit || 0;
                document.getElementById('profileStartDate').textContent = new Date(playerData.startDate).toLocaleDateString('pt-BR');

                // Mostra a tela de perfil
                showScreen('profileScreen');
            } catch (error) {
                console.error('Erro ao carregar perfil com token armazenado:', error.message);
                localStorage.removeItem('jwtToken'); // Remove o token inválido
                showScreen('loginScreen');
            }
        } else {
            if (storedToken) {
                console.log('Token expirado ou inválido no localStorage');
                localStorage.removeItem('jwtToken'); // Remove o token inválido
            } else {
                console.log('Nenhum token encontrado');
            }
            showScreen('loginScreen');
        }
    }
});

export { showScreen };