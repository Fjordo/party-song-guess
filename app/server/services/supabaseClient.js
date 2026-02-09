const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Use the variables present in .env
// Note: Usually servers use SERVICE_ROLE_KEY for admin tasks, but we'll try with what's available.
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase credentials missing in .env. Database features will be disabled.');
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

/**
 * Creates a new game room entry in the database.
 */
async function createGameRoom(roomData) {
    if (!supabaseUrl) return null;

    const { id, hostId, totalRounds, genres, decade, language, difficulty } = roomData;

    console.log(`[DB] Creating room ${id} for host ${hostId}`);

    const { data, error } = await supabase
        .from('game_rooms')
        .insert([
            {
                id,
                host_id: hostId,
                status: 'LOBBY',
                total_rounds: totalRounds,
                genres,
                decade,
                language,
                difficulty,
                created_at: new Date().toISOString()
            }
        ])
        .select()
        .single();

    if (error) {
        console.error('Error creating game room:', error.message);
        return null;
    }
    return data;
}

/**
 * Updates room status (e.g., to 'PLAYING').
 */
async function updateGameRoomStatus(roomId, status, extraData = {}) {
    if (!supabaseUrl) return;

    const { error } = await supabase
        .from('game_rooms')
        .update({ status, ...extraData })
        .eq('id', roomId);

    if (error) {
        console.error(`Error updating room status ${roomId}:`, error.message);
    }
}

/**
 * Finalizes the game: updates room to ENDED and saves participants.
 */
async function endGame(roomId, players) {
    if (!supabaseUrl) return;

    const endedAt = new Date().toISOString();

    // 1. Update Room Status
    const { error: roomError } = await supabase
        .from('game_rooms')
        .update({
            status: 'ENDED',
            ended_at: endedAt
        })
        .eq('id', roomId);

    if (roomError) {
        console.error(`Error ending room ${roomId}:`, roomError.message);
        return;
    }

    // 2. Save Participants
    const participantsData = players.map(p => ({
        room_id: roomId,
        user_id: p.userId,
        final_score: p.score,
        guesses_correct: p.score,
        joined_at: endedAt
    }));

    if (participantsData.length > 0) {
        const { error: participantsError } = await supabase
            .from('game_participants')
            .insert(participantsData);

        if (participantsError) {
            console.error(`Error saving participants for room ${roomId}:`, participantsError.message);
        }
    }
}


module.exports = {
    createGameRoom,
    updateGameRoomStatus,
    endGame
};
