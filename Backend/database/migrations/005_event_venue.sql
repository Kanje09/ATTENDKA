ALTER TABLE events
    ADD COLUMN IF NOT EXISTS venue TEXT,
    ADD COLUMN IF NOT EXISTS event_status TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS status_note TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'events_event_status_check'
          AND conrelid = 'events'::regclass
    ) THEN
        ALTER TABLE events
            ADD CONSTRAINT events_event_status_check
            CHECK (event_status IN ('pending', 'ongoing', 'moved', 'done', 'cancelled'));
    END IF; 
END $$;
