export interface student_type {
    id: number;
    name: string;

    email: string;
    password: string;
    role: "student";

    created_at: Date;
};