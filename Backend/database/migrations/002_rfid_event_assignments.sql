CREATE TABLE IF NOT EXISTS rfid_event_assignments (
    reader_id INT NOT NULL REFERENCES rfid_readers(reader_id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    event_id INT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    assigned_by INT NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (reader_id, attendance_date)
);
