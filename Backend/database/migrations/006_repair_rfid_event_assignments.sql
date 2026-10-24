CREATE TABLE IF NOT EXISTS rfid_event_assignments (
    reader_id INT NOT NULL REFERENCES rfid_readers(reader_id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    event_id INT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    assigned_by INT NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    attendance_mode TEXT NOT NULL DEFAULT 'auto',
    PRIMARY KEY (reader_id, attendance_date)
);

ALTER TABLE rfid_event_assignments
    ADD COLUMN IF NOT EXISTS attendance_mode TEXT NOT NULL DEFAULT 'auto';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'rfid_event_assignments_attendance_mode_check'
          AND conrelid = 'rfid_event_assignments'::regclass
    ) THEN
        ALTER TABLE rfid_event_assignments
            ADD CONSTRAINT rfid_event_assignments_attendance_mode_check
            CHECK (attendance_mode IN ('auto', 'time_in', 'time_out'));
    END IF;
END $$;
