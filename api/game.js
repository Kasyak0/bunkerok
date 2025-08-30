// Vercel Serverless API для игры "Бункер"
// Хранит состояние игр по комнатам в памяти

let gameRooms = new Map();

function getDefaultGameState() {
    return {
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
}

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
    const { roomId = 'default' } = req.query;

    // Получаем или создаем комнату
    if (!gameRooms.has(roomId)) {
        gameRooms.set(roomId, getDefaultGameState());
    }
    
    let gameState = gameRooms.get(roomId);

    try {
        switch (method) {
            case 'GET':
                // Получить текущее состояние игры
                res.status(200).json(gameState);
                break;

            case 'POST':
                const { action, player } = req.body;

                if (action === 'join' && player) {
                    // Проверяем лимит игроков
                    if (gameState.players.length >= gameState.maxPlayers) {
                        return res.status(400).send('Лобби заполнено!');
                    }

                    // Проверяем уникальность имени в этой комнате
                    if (gameState.players.some(p => p.name === player.name)) {
                        return res.status(400).send('Имя уже занято в этой комнате!');
                    }

                    // Добавляем игрока
                    gameState.players.push(player);
                    
                    // Первый игрок становится хостом
                    if (gameState.players.length === 1) {
                        gameState.hostId = player.id;
                    }

                    gameState.lastUpdate = Date.now();
                    gameRooms.set(roomId, gameState);
                    res.status(200).json(gameState);
                } else {
                    res.status(400).send('Неверный запрос');
                }
                break;

            case 'PUT':
                const { action: updateAction, gameState: newGameState } = req.body;
                
                if (updateAction === 'update' && newGameState) {
                    gameState = {
                        ...gameState,
                        ...newGameState,
                        lastUpdate: Date.now()
                    };
                    gameRooms.set(roomId, gameState);
                    res.status(200).json(gameState);
                } else {
                    res.status(400).send('Неверный запрос на обновление');
                }
                break;

            case 'DELETE':
                const { action: deleteAction, playerId } = req.body;
                
                if (deleteAction === 'leave' && playerId) {
                    const playerIndex = gameState.players.findIndex(p => p.id === playerId);
                    if (playerIndex !== -1) {
                        gameState.players.splice(playerIndex, 1);
                        
                        // Если ушел хост, назначаем нового
                        if (gameState.hostId === playerId && gameState.players.length > 0) {
                            gameState.hostId = gameState.players[0].id;
                        }
                        
                        gameState.lastUpdate = Date.now();
                        gameRooms.set(roomId, gameState);
                    }
                    res.status(200).json(gameState);
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
