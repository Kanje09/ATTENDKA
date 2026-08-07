export interface studentAuth_type {
    id: number;
    name: string;

    email: string;
    password: string;
    role: "student";

    created_at: Date;
};

export interface studentAttendance_type {
    id: number;
    student_id: number;

    time_in: string;
    time_out: string;
};  