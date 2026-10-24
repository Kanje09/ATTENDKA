CREATE TABLE IF NOT EXISTS student_event_checklist (
    student_id INT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    event_id INT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    is_done BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (student_id, event_id),
    CHECK ((is_done AND completed_at IS NOT NULL) OR (NOT is_done AND completed_at IS NULL))
);
