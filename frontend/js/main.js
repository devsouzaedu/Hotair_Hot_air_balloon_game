import { initUI } from './ui.js';
import { initGame } from './game.js';
import { initSocket } from './socket.js';

document.addEventListener('DOMContentLoaded', () => {
    initSocket();
    initUI();
    initGame();
});