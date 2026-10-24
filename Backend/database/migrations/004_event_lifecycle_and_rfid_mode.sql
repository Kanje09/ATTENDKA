ALTER TABLE events
    ADD COLUMN IF NOT EXISTS event_status TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS status_note TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'events_event_status_check'
          AND conrelid = 'events'::regclass
    ) THEN
        ALTER TABLE events
            ADD CONSTRAINT events_event_status_check
            CHECK (event_status IN ('pending', 'ongoing', 'moved', 'done', 'cancelled'));
    END IF;
END $$;

ALTER TABLE rfid_event_assignments
    ADD COLUMN IF NOT EXISTS attendance_mode TEXT NOT NULL DEFAULT 'auto';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'rfid_event_assignments_attendance_mode_check'
          AND conrelid = 'rfid_event_assignments'::regclass
    ) THEN
        ALTER TABLE rfid_event_assignments
            ADD CONSTRAINT rfid_event_assignments_attendance_mode_check
            CHECK (attendance_mode IN ('auto', 'time_in', 'time_out'));
    END IF;
END $$;

ALTER TABLE teachers
    ADD COLUMN IF NOT EXISTS year_level SMALLINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'teachers_year_level_check'
          AND conrelid = 'teachers'::regclass
    ) THEN
        ALTER TABLE teachers
            ADD CONSTRAINT teachers_year_level_check
            CHECK (year_level IS NULL OR year_level BETWEEN 1 AND 10);
    END IF;
END $$;
