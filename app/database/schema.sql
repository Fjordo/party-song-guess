-- ============================================
-- PARTY SONG GUESS - DATABASE SCHEMA
-- ============================================
-- 1. CREATE TABLES
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    username TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    avatar_url TEXT,
    total_games INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0
);

CREATE TABLE public.game_rooms (
    id TEXT PRIMARY KEY,
    host_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'LOBBY',
    total_rounds INTEGER DEFAULT 10,
    genres TEXT [] DEFAULT ARRAY ['pop'],
    decade TEXT,
    language TEXT,
    difficulty TEXT DEFAULT 'easy'
);

CREATE TABLE public.game_participants (
    id SERIAL PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    final_score INTEGER DEFAULT 0,
    guesses_correct INTEGER DEFAULT 0,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(room_id, user_id)
);

CREATE TABLE public.round_guesses (
    id SERIAL PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    guess TEXT NOT NULL,
    is_correct BOOLEAN DEFAULT FALSE,
    guessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.leaderboard (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    total_games INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    win_rate DECIMAL(5, 2) DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    avg_score_per_game DECIMAL(10, 2) DEFAULT 0,
    last_played TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. ENABLE ROW LEVEL SECURITY
ALTER TABLE
    public.users ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    public.game_rooms ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    public.game_participants ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    public.round_guesses ENABLE ROW LEVEL SECURITY;

ALTER TABLE
    public.leaderboard ENABLE ROW LEVEL SECURITY;

-- 3. POLICIES - USERS
CREATE POLICY "users_insert_authenticated" ON public.users FOR
INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "users_select_all" ON public.users FOR
SELECT
    USING (true);

CREATE POLICY "users_update_own" ON public.users FOR
UPDATE
    USING (auth.uid() = id);

-- 4. POLICIES - GAME ROOMS
CREATE POLICY "game_rooms_view_all" ON public.game_rooms FOR
SELECT
    USING (true);

CREATE POLICY "game_rooms_insert_own" ON public.game_rooms FOR
INSERT
    WITH CHECK (auth.uid() = host_id);

CREATE POLICY "game_rooms_update_own" ON public.game_rooms FOR
UPDATE
    USING (auth.uid() = host_id);

-- 5. POLICIES - GAME PARTICIPANTS
CREATE POLICY "game_participants_view_all" ON public.game_participants FOR
SELECT
    USING (true);

CREATE POLICY "game_participants_insert_own" ON public.game_participants FOR
INSERT
    WITH CHECK (auth.uid() = user_id);

-- 6. POLICIES - ROUND GUESSES
CREATE POLICY "round_guesses_view_all" ON public.round_guesses FOR
SELECT
    USING (true);

CREATE POLICY "round_guesses_insert_own" ON public.round_guesses FOR
INSERT
    WITH CHECK (auth.uid() = user_id);

-- 7. POLICIES - LEADERBOARD
CREATE POLICY "leaderboard_view_all" ON public.leaderboard FOR
SELECT
    USING (true);

-- 8. FUNCTION - AUTO UPDATE TIMESTAMP
CREATE
OR REPLACE FUNCTION public.update_users_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $ $ BEGIN NEW.updated_at = NOW();

RETURN NEW;

END;

$ $;

-- 9. TRIGGER - UPDATE TIMESTAMP
DROP TRIGGER IF EXISTS update_users_updated_at_trigger ON public.users;

CREATE TRIGGER update_users_updated_at_trigger BEFORE
UPDATE
    ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_users_updated_at();

-- 10. FUNCTION - AUTO CREATE USER PROFILE
CREATE
OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET
    search_path = public AS $ $ BEGIN
INSERT INTO
    public.users (id, email, username)
VALUES
    (
        NEW.id,
        NEW.email,
        COALESCE(
            NEW.raw_user_meta_data ->> 'username',
            SPLIT_PART(NEW.email, '@', 1)
        )
    ) ON CONFLICT (id) DO
UPDATE
SET
    email = NEW.email,
    username = COALESCE(
        NEW.raw_user_meta_data ->> 'username',
        SPLIT_PART(NEW.email, '@', 1)
    );

RETURN NEW;

END;

$ $;

-- 11. TRIGGER - AUTO CREATE USER PROFILE
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER
INSERT
    ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 12. INDEXES
CREATE INDEX idx_game_rooms_host_id ON public.game_rooms(host_id);

CREATE INDEX idx_game_rooms_status ON public.game_rooms(status);

CREATE INDEX idx_game_participants_room_id ON public.game_participants(room_id);

CREATE INDEX idx_game_participants_user_id ON public.game_participants(user_id);

CREATE INDEX idx_round_guesses_room_id ON public.round_guesses(room_id);

CREATE INDEX idx_leaderboard_total_score ON public.leaderboard(total_score DESC);

-- 13. VIEWS
DROP VIEW IF EXISTS public.top_players_by_score CASCADE;

CREATE VIEW public.top_players_by_score AS
SELECT
    u.id,
    u.email,
    u.username,
    l.total_games,
    l.total_wins,
    l.win_rate,
    l.total_score,
    l.avg_score_per_game,
    l.last_played
FROM
    public.leaderboard l
    JOIN public.users u ON l.user_id = u.id
ORDER BY
    l.total_score DESC
LIMIT
    10;

DROP VIEW IF EXISTS public.recent_games_stats CASCADE;

CREATE VIEW public.recent_games_stats AS
SELECT
    u.id,
    u.username,
    COUNT(gp.id) as games_played_week,
    SUM(
        CASE
            WHEN gp.guesses_correct > 0 THEN 1
            ELSE 0
        END
    ) as wins_week,
    AVG(gp.final_score) as avg_score_week
FROM
    public.users u
    LEFT JOIN public.game_participants gp ON u.id = gp.user_id
    LEFT JOIN public.game_rooms gr ON gp.room_id = gr.id
WHERE
    gr.ended_at >= NOW() - INTERVAL '7 days'
GROUP BY
    u.id,
    u.username;