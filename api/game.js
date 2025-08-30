// Vercel Serverless API для игры "Бункер"
// Хранит глобальное состояние игры в памяти

let globalGameState = {
    players: [],
    currentPlayerId: null,
    phase: 'waiting',
    round: 1,
    votingResults: {},
    bunkerSlots: 2,
    maxPlayers: 8,
    hostId: null,
    lastUpdate: Date.now()
};

export default function handler(req, res) {
    // Включаем CORS для всех доменов
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { method } = req;

    try {
        switch (method) {
            case 'GET':
                // Получить текущее состояние игры
                res.status(200).json(globalGameState);
                break;

            case 'POST':
                const { action, player } = req.body;

                if (action === 'join' && player) {
                    // Проверяем лимит игроков
                    if (globalGameState.players.length >= globalGameState.maxPlayers) {
                        return res.status(400).send('Лобби заполнено!');
                    }

                    // Проверяем уникальность имени
                    if (globalGameState.players.some(p => p.name === player.name)) {
                        return res.status(400).send('Имя уже занято!');
                    }

                    // Добавляем игрока
                    globalGameState.players.push(player);
                    
                    // Первый игрок становится хостом
                    if (globalGameState.players.length === 1) {
                        globalGameState.hostId = player.id;
                    }

                    globalGameState.lastUpdate = Date.now();
                    res.status(200).json(globalGameState);
                } else {
                    res.status(400).send('Неверный запрос');
                }
                break;

            case 'PUT':
                const { action: updateAction, gameState } = req.body;
                
                if (updateAction === 'update' && gameState) {
                    globalGameState = {
                        ...globalGameState,
                        ...gameState,
                        lastUpdate: Date.now()
                    };
                    res.status(200).json(globalGameState);
                } else {
                    res.status(400).send('Неверный запрос на обновление');
                }
                break;

            case 'DELETE':
                const { action: deleteAction, playerId } = req.body;
                
                if (deleteAction === 'leave' && playerId) {
                    const playerIndex = globalGameState.players.findIndex(p => p.id === playerId);
                    if (playerIndex !== -1) {
                        globalGameState.players.splice(playerIndex, 1);
                        
                        // Если ушел хост, назначаем нового
                        if (globalGameState.hostId === playerId && globalGameState.players.length > 0) {
                            globalGameState.hostId = globalGameState.players[0].id;
                        }
                        
                        globalGameState.lastUpdate = Date.now();
                    }
                    res.status(200).json(globalGameState);
                } else {
                    res.status(400).send('Неверный запрос на выход');
                }
                break;

            default:
                res.status(405).send('Метод не поддерживается');
        }
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).send('Ошибка сервера');
    }
}
