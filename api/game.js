// Vercel Serverless API для игры "Бункер"
// Хранит состояние игр по комнатам в памяти

let roomStates = {};

function createDefaultGameState() {
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

function getRoomState(roomId) {
    if (!roomStates[roomId]) {
        roomStates[roomId] = createDefaultGameState();
    }
    return roomStates[roomId];
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

    try {
        // Получаем roomId из параметров запроса или тела запроса
        const roomId = req.query.roomId || (req.body && req.body.roomId) || 'default';
        const gameState = getRoomState(roomId);

        switch (method) {
            case 'GET':
                // Получить текущее состояние игры для конкретной комнаты
                res.status(200).json(gameState);
                break;

            case 'POST':
                const { action, player } = req.body;

                if (action === 'join' && player) {
                    // Check if player is trying to reconnect
                    const existingPlayerIndex = gameState.players.findIndex(p => p.id === player.id);
                    
                    if (existingPlayerIndex !== -1) {
                        // Player is reconnecting - update their data but keep game state
                        const existingPlayer = gameState.players[existingPlayerIndex];
                        
                        // Update only safe properties (keep game state like characteristics, revealed, etc.)
                        gameState.players[existingPlayerIndex] = {
                            ...existingPlayer,
                            name: player.name, // Allow name update
                            lastSeen: Date.now()
                        };
                        
                        console.log(`Player ${player.name} (${player.id}) reconnected to room ${roomId}`);
                        gameState.lastUpdate = Date.now();
                        res.status(200).json(gameState);
                        return;
                    }
                    
                    // New player joining
                    // Check player limit
                    if (gameState.players.length >= gameState.maxPlayers) {
                        return res.status(400).send('Lobby is full!');
                    }

                    // Check name uniqueness (only for new players)
                    if (gameState.players.some(p => p.name === player.name)) {
                        return res.status(400).send('Name already taken!');
                    }

                    // Add new player
                    const newPlayer = {
                        ...player,
                        lastSeen: Date.now()
                    };
                    gameState.players.push(newPlayer);
                    
                    // First player becomes host
                    if (gameState.players.length === 1) {
                        gameState.hostId = player.id;
                    }

                    console.log(`New player ${player.name} (${player.id}) joined room ${roomId}`);
                    gameState.lastUpdate = Date.now();
                    res.status(200).json(gameState);
                } else {
                    res.status(400).send('Invalid request');
                }
                break;

            case 'PUT':
                const { action: updateAction, gameState: newGameState } = req.body;
                
                if (updateAction === 'update' && newGameState) {
                    // Обновляем состояние конкретной комнаты
                    roomStates[roomId] = {
                        ...gameState,
                        ...newGameState,
                        lastUpdate: Date.now()
                    };
                    res.status(200).json(roomStates[roomId]);
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