import { initUI } from './ui.js';
import { initGame } from './game.js';
import { initSocket } from './socket.js';

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.style.display = 'none';
    });
    document.getElementById(screenId).style.display = 'flex';
}

document.addEventListener('DOMContentLoaded', async () => {
    // Captura o token da URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (token) {
        try {
            console.log('Token capturado:', token); // Debug
            // Faz a requisição ao backend para pegar os dados do jogador
            const response = await fetch('http://localhost:3000/api/profile', {
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
            console.log('Dados do jogador recebidos:', playerData); // Debug
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
            console.error('Erro ao carregar perfil:', error.message); // Melhor log de erro
            console.error('Stack trace:', error.stack); // Mais detalhes
            showScreen('loginScreen'); // Volta para login em caso de erro
        }
    } else {
        console.log('Nenhum token encontrado na URL'); // Debug
        showScreen('loginScreen');
    }

    // Inicializa os módulos
    initSocket();
    initUI();
    initGame();

    // Configura o botão "Começar a Jogar"
    document.getElementById('continueButton').addEventListener('click', () => {
        showScreen('modeScreen');
    });
});

export { showScreen };