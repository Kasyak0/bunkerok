// Vercel Serverless API для игры "Бункер"
// Поддерживает множественные комнаты и сохранение имен игроков

// Хранилище комнат в памяти
let gameRooms = new Map();

// Функция создания новой комнаты
function createNewRoom(roomId) {
    return {
        players: [],
        currentPlayerId: null,
        phase: 'waiting',
        subPhase: null,
        round: 1,
        votingResults: {},
        bunkerSlots: 2,
        maxPlayers: 8,
        hostId: null,
        phaseStartTime: null,
        phaseDuration: null,
        lastUpdate: Date.now(),
        roomId: roomId
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
    const roomId = req.query.room || req.body?.roomId || 'global';

    try {
        // Получаем или создаем комнату
        if (!gameRooms.has(roomId)) {
            gameRooms.set(roomId, createNewRoom(roomId));
        }
        const gameState = gameRooms.get(roomId);

        switch (method) {
            case 'GET':
                // Получить текущее состояние игры для комнаты
                res.status(200).json(gameState);
                break;

            case 'POST':
                const { action, player } = req.body;

                if (action === 'join' && player) {
                    // Проверяем, есть ли уже игрок с таким именем в этой комнате
                    const existingPlayer = gameState.players.find(p => p.name === player.name);
                    
                    if (existingPlayer) {
                        // Игрок пытается переподключиться
                        existingPlayer.id = player.id; // Обновляем ID для переподключения
                        existingPlayer.isReconnected = true;
                        
                        gameState.lastUpdate = Date.now();
                        res.status(200).json({ 
                            message: 'Переподключение успешно', 
                            player: existingPlayer,
                            isReconnect: true
                        });
                        break;
                    }

                    // Проверяем лимит игроков для новых игроков
                    if (gameState.players.length >= gameState.maxPlayers) {
                        return res.status(400).send('Лобби заполнено!');
                    }

                    // Добавляем нового игрока
                    gameState.players.push(player);
                    
                    // Первый игрок становится хостом
                    if (gameState.players.length === 1) {
                        gameState.hostId = player.id;
                    }

                    gameState.lastUpdate = Date.now();
                    res.status(200).json({
                        message: 'Игрок добавлен',
                        player: player,
                        isReconnect: false
                    });
                } else {
                    res.status(400).send('Неверный запрос');
                }
                break;

            case 'PUT':
                const { action: updateAction, gameState: newGameState } = req.body;
                
                if (updateAction === 'update' && newGameState) {
                    // Обновляем состояние комнаты
                    Object.assign(gameState, newGameState, {
                        lastUpdate: Date.now(),
                        roomId: roomId
                    });
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
