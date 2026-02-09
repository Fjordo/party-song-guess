import { supabase } from './supabaseClient';

/**
 * Salva/aggiorna il profilo utente nella tabella 'users'
 * @param {string} userId - ID dell'utente da Supabase Auth
 * @param {string} email - Email dell'utente
 * @param {string} username - Nome utente opzionale
 * @returns {Promise<Object>} Dati utente salvati
 */
export const createOrUpdateUserProfile = async (userId, email, username = null) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .upsert(
        {
          id: userId,
          email,
          username: username || email.split('@')[0], // Default: parte prima dell'email
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select();

    if (error) throw error;
    return { success: true, data: data?.[0] };
  } catch (err) {
    console.error('Errore nel salvataggio profilo:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Recupera il profilo utente completo
 * @param {string} userId - ID dell'utente
 * @returns {Promise<Object>} Dati profilo utente
 */
export const getUserProfile = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('Errore nel recupero profilo:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Recupera le statistiche leaderboard dell'utente
 * @param {string} userId - ID dell'utente
 * @returns {Promise<Object>} Dati leaderboard
 */
export const getUserLeaderboardStats = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('Errore nel recupero statistiche:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Recupera la top 10 dei giocatori
 * @returns {Promise<Array>} Array di top players
 */
export const getTopPlayers = async () => {
  try {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('user_id, users(username, email, avatar_url), total_games, total_wins, win_rate, total_score, avg_score_per_game')
      .order('total_score', { ascending: false })
      .limit(10);

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('Errore nel recupero top players:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Aggiorna il profilo utente (username, avatar, etc.)
 * @param {string} userId - ID dell'utente
 * @param {Object} updates - Oggetto con i campi da aggiornare
 * @returns {Promise<Object>} Profilo aggiornato
 */
export const updateUserProfile = async (userId, updates) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select();

    if (error) throw error;
    return { success: true, data: data?.[0] };
  } catch (err) {
    console.error('Errore nell\'aggiornamento profilo:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Salva una partita completata
 * @param {string} roomId - ID della room
 * @param {string} hostId - ID dell'host
 * @param {Array} participants - Array di partecipanti {userId, finalScore, guessesCorrect}
 * @param {Object} settings - Impostazioni della partita {genres, decade, language, difficulty}
 * @returns {Promise<Object>} Dati partita salvati
 */
export const saveGameSession = async (roomId, hostId, participants, settings) => {
  try {
    // 1. Salva la game room
    const { data: roomData, error: roomError } = await supabase
      .from('game_rooms')
      .insert({
        id: roomId,
        host_id: hostId,
        status: 'ENDED',
        ended_at: new Date().toISOString(),
        genres: settings.genres,
        decade: settings.decade || null,
        language: settings.language || null,
        difficulty: settings.difficulty,
        total_rounds: settings.totalRounds || 10,
      })
      .select();

    if (roomError) throw roomError;

    // 2. Salva i partecipanti
    const participantRecords = participants.map((p) => ({
      room_id: roomId,
      user_id: p.userId,
      final_score: p.finalScore,
      guesses_correct: p.guessesCorrect,
    }));

    const { data: participantsData, error: participantsError } = await supabase
      .from('game_participants')
      .insert(participantRecords)
      .select();

    if (participantsError) throw participantsError;

    return { success: true, data: { room: roomData?.[0], participants: participantsData } };
  } catch (err) {
    console.error('Errore nel salvataggio partita:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Salva una singola risposta di un giocatore
 * @param {string} roomId - ID della room
 * @param {number} roundNumber - Numero del round
 * @param {string} userId - ID dell'utente
 * @param {string} guess - Risposta fornita
 * @param {boolean} isCorrect - Se la risposta è corretta
 * @returns {Promise<Object>} Dati della risposta salvati
 */
export const saveRoundGuess = async (roomId, roundNumber, userId, guess, isCorrect) => {
  try {
    const { data, error } = await supabase
      .from('round_guesses')
      .insert({
        room_id: roomId,
        round_number: roundNumber,
        user_id: userId,
        guess,
        is_correct: isCorrect,
      })
      .select();

    if (error) throw error;
    return { success: true, data: data?.[0] };
  } catch (err) {
    console.error('Errore nel salvataggio risposta:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Recupera le statistiche recenti di un giocatore (ultimi 7 giorni)
 * @param {string} userId - ID dell'utente
 * @returns {Promise<Object>} Statistiche recenti
 */
export const getRecentGameStats = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('recent_games_stats')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('Errore nel recupero statistiche recenti:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Elimina il profilo utente (soft delete)
 * @param {string} userId - ID dell'utente da eliminare
 * @returns {Promise<Object>} Risultato dell'eliminazione
 */
export const deleteUserProfile = async (userId) => {
  try {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('Errore nell\'eliminazione profilo:', err);
    return { success: false, error: err.message };
  }
};
