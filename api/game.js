// Vercel Serverless API для игры "Бункер"
// Простое хранение в памяти + fallback

// ВАЖНО: На Vercel это работает ограниченно (данные могут теряться)
// Для продакшена рекомендуется использовать внешнюю БД

let roomStates = {};

function createDefaultGameState(roomId) {
    return {
        roomId: roomId,
        players: [],
        currentPlayerId: null,
        phase: 'waiting',
        round: 1,
        votingResults: {},
        detailedVotes: {},
        playersWhoVoted: [],
        discussionSkipVotes: [],
        bunkerSlots: 2,
        maxPlayers: 8,
        hostId: null,
        auditLog: [],
        scenario: null,
        lastUpdate: Date.now(),
        createdAt: Date.now()
    };
}

function getRoomState(roomId) {
    if (!roomStates[roomId]) {
        roomStates[roomId] = createDefaultGameState(roomId);
    }
    return roomStates[roomId];
}

function cleanupOldRooms() {
    const now = Date.now();
    const maxAge = 2 * 60 * 60 * 1000; // 2 часа
    
    Object.keys(roomStates).forEach(roomId => {
        if (now - roomStates[roomId].lastUpdate > maxAge) {
            delete roomStates[roomId];
        }
    });
}

export default function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Очистка старых комнат
    cleanupOldRooms();

    const { method } = req;

    try {
        const roomId = req.query.roomId || (req.body && req.body.roomId) || null;

        // Список комнат
        if (method === 'GET' && req.query.action === 'listRooms') {
            const rooms = Object.values(roomStates)
                .filter(r => r.phase === 'waiting')
                .map(r => ({
                    roomId: r.roomId,
                    playerCount: r.players.length,
                    maxPlayers: r.maxPlayers
                }));
            return res.status(200).json({ rooms });
        }

        if (!roomId) {
            return res.status(400).json({ error: 'Room ID is required' });
        }

        const gameState = getRoomState(roomId);

        switch (method) {
            case 'GET':
                res.status(200).json(gameState);
                break;

            case 'POST':
                const { action, player } = req.body;

                if (action === 'join' && player) {
                    // Переподключение
                    const existingIndex = gameState.players.findIndex(p => p.id === player.id);
                    
                    if (existingIndex !== -1) {
                        gameState.players[existingIndex] = {
                            ...gameState.players[existingIndex],
                            name: player.name,
                            lastSeen: Date.now()
                        };
                        gameState.lastUpdate = Date.now();
                        return res.status(200).json(gameState);
                    }
                    
                    // Проверки
                    if (gameState.players.length >= gameState.maxPlayers) {
                        return res.status(400).json({ error: 'Room is full!' });
                    }

                    if (gameState.players.some(p => p.name === player.name)) {
                        return res.status(400).json({ error: 'Name already taken!' });
                    }

                    // Добавление игрока
                    gameState.players.push({
                        ...player,
                        roomId: roomId,
                        lastSeen: Date.now()
                    });
                    
                    if (gameState.players.length === 1) {
                        gameState.hostId = player.id;
                    }

                    gameState.lastUpdate = Date.now();
                    res.status(200).json(gameState);
                } else {
                    res.status(400).json({ error: 'Invalid request' });
                }
                break;

            case 'PUT':
                const { action: updateAction, gameState: newState } = req.body;
                
                if (updateAction === 'update' && newState) {
                    roomStates[roomId] = {
                        ...gameState,
                        ...newState,
                        roomId: roomId,
                        lastUpdate: Date.now()
                    };
                    res.status(200).json(roomStates[roomId]);
                } else {
                    res.status(400).json({ error: 'Invalid update' });
                }
                break;

            case 'DELETE':
                const { action: delAction, playerId } = req.body;
                
                if (delAction === 'leave' && playerId) {
                    const idx = gameState.players.findIndex(p => p.id === playerId);
                    if (idx !== -1) {
                        gameState.players.splice(idx, 1);
                        
                        if (gameState.hostId === playerId && gameState.players.length > 0) {
                            gameState.hostId = gameState.players[0].id;
                        }
                        
                        if (gameState.players.length === 0) {
                            delete roomStates[roomId];
                            return res.status(200).json({ deleted: true });
                        }
                        
                        gameState.lastUpdate = Date.now();
                    }
                    res.status(200).json(gameState);
                } else {
                    res.status(400).json({ error: 'Invalid delete' });
                }
                break;

            default:
                res.status(405).json({ error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Server error', message: error.message });
    }
}