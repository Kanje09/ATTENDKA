CREATE TABLE IF NOT EXISTS attendance_live_display_state (
    singleton_id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton_id),
    reset_after_attendance_id BIGINT NOT NULL DEFAULT 0,
    reset_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE attendance_live_display_state
    ADD COLUMN IF NOT EXISTS reset_at TIMESTAMPTZ;

INSERT INTO attendance_live_display_state (singleton_id, reset_after_attendance_id)
VALUES (TRUE, 0)
ON CONFLICT (singleton_id) DO NOTHING;
