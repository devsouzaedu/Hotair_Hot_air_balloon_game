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
            // Faz a requisição ao backend para pegar os dados do jogador
            const response = await fetch('https://hotair-backend.onrender.com/api/profile', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Erro ao buscar perfil');
            }

            const playerData = await response.json();
            localStorage.setItem('jwtToken', token); // Armazena o token para uso posterior
            localStorage.setItem('playerName', playerData.name); // Armazena o nome para uso no jogo

            // Preenche os dados na tela de perfil
            document.getElementById('profileName').textContent = playerData.name || 'Aventureiro';
            document.getElementById('profilePicture').src = playerData.picture || 'default-avatar.png';
            document.getElementById('profileScore').textContent = playerData.totalScore || 0;
            document.getElementById('profileTargets').textContent = playerData.targetsHit || 0;
            document.getElementById('profileStartDate').textContent = new Date(playerData.startDate).toLocaleDateString('pt-BR');

            // Mostra a tela de perfil
            showScreen('profileScreen');

            // Remove o token da URL para limpar a barra de endereço
            window.history.replaceState({}, document.title, '/Hotair_Hot_air_balloon_game/');
        } catch (error) {
            console.error('Erro ao carregar perfil:', error);
            showScreen('loginScreen'); // Volta para a tela de login em caso de erro
        }
    } else {
        // Se não houver token, mostra a tela de login
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