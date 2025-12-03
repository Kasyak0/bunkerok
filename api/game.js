// Vercel Serverless API для игры "Бункер"
// Использует Vercel KV (Redis) для хранения состояния комнат

import { kv } from '@vercel/kv';

// Префикс для ключей комнат в Redis
const ROOM_PREFIX = 'bunker:room:';
const ROOM_TTL = 24 * 60 * 60; // 24 часа (время жизни комнаты)

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

async function getRoomState(roomId) {
    try {
        const state = await kv.get(ROOM_PREFIX + roomId);
        if (state) {
            return state;
        }
    } catch (error) {
        console.error('Error getting room state from KV:', error);
    }
    return createDefaultGameState(roomId);
}

async function saveRoomState(roomId, state) {
    try {
        state.lastUpdate = Date.now();
        await kv.set(ROOM_PREFIX + roomId, state, { ex: ROOM_TTL });
        return true;
    } catch (error) {
        console.error('Error saving room state to KV:', error);
        return false;
    }
}

async function deleteRoom(roomId) {
    try {
        await kv.del(ROOM_PREFIX + roomId);
        return true;
    } catch (error) {
        console.error('Error deleting room from KV:', error);
        return false;
    }
}

// Получить список всех активных комнат
async function getActiveRooms() {
    try {
        const keys = await kv.keys(ROOM_PREFIX + '*');
        const rooms = [];
        for (const key of keys) {
            const state = await kv.get(key);
            if (state && state.phase === 'waiting') {
                rooms.push({
                    roomId: state.roomId,
                    playerCount: state.players.length,
                    maxPlayers: state.maxPlayers,
                    createdAt: state.createdAt
                });
            }
        }
        return rooms;
    } catch (error) {
        console.error('Error getting active rooms:', error);
        return [];
    }
}

export default async function handler(req, res) {
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
        const roomId = req.query.roomId || (req.body && req.body.roomId) || null;

        // Специальный эндпоинт для получения списка комнат
        if (method === 'GET' && req.query.action === 'listRooms') {
            const rooms = await getActiveRooms();
            return res.status(200).json({ rooms });
        }

        // Проверяем, что roomId указан для всех операций кроме listRooms
        if (!roomId) {
            return res.status(400).json({ error: 'Room ID is required' });
        }

        const gameState = await getRoomState(roomId);

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
                        await saveRoomState(roomId, gameState);
                        res.status(200).json(gameState);
                        return;
                    }
                    
                    // New player joining
                    // Check player limit
                    if (gameState.players.length >= gameState.maxPlayers) {
                        return res.status(400).json({ error: 'Lobby is full!' });
                    }

                    // Check name uniqueness (only for new players)
                    if (gameState.players.some(p => p.name === player.name)) {
                        return res.status(400).json({ error: 'Name already taken!' });
                    }

                    // Add new player
                    const newPlayer = {
                        ...player,
                        roomId: roomId,
                        lastSeen: Date.now()
                    };
                    gameState.players.push(newPlayer);
                    
                    // First player becomes host
                    if (gameState.players.length === 1) {
                        gameState.hostId = player.id;
                    }

                    console.log(`New player ${player.name} (${player.id}) joined room ${roomId}`);
                    await saveRoomState(roomId, gameState);
                    res.status(200).json(gameState);
                } else if (action === 'createRoom') {
                    // Создать новую комнату
                    const newState = createDefaultGameState(roomId);
                    await saveRoomState(roomId, newState);
                    res.status(200).json(newState);
                } else {
                    res.status(400).json({ error: 'Invalid request' });
                }
                break;

            case 'PUT':
                const { action: updateAction, gameState: newGameState } = req.body;
                
                if (updateAction === 'update' && newGameState) {
                    // Merge new state with existing, preserving roomId
                    const mergedState = {
                        ...gameState,
                        ...newGameState,
                        roomId: roomId, // Always keep original roomId
                        lastUpdate: Date.now()
                    };
                    await saveRoomState(roomId, mergedState);
                    res.status(200).json(mergedState);
                } else {
                    res.status(400).json({ error: 'Invalid update request' });
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
                        
                        // Если комната пуста, удаляем её
                        if (gameState.players.length === 0) {
                            await deleteRoom(roomId);
                            return res.status(200).json({ deleted: true });
                        }
                        
                        await saveRoomState(roomId, gameState);
                    }
                    res.status(200).json(gameState);
                } else if (deleteAction === 'deleteRoom') {
                    // Полное удаление комнаты (только для хоста)
                    await deleteRoom(roomId);
                    res.status(200).json({ deleted: true });
                } else {
                    res.status(400).json({ error: 'Invalid delete request' });
                }
                break;

            default:
                res.status(405).json({ error: 'Method not supported' });
        }
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Server error', details: error.message });
    }
}