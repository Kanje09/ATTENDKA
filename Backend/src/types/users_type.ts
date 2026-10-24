export type UserRole = "student" | "teacher" | "admin" | "team_leader";

export interface LoginInput {
    email?: string;
    username?: string;
    password: string;
}

export interface BaseRegisterInput {
    last_name: string;
    first_name: string;
    middle_name?: string;
    email?: string;
    username: string;
    password: string;
}

export interface StudentRegisterInput extends BaseRegisterInput {
    student_no: string;
    department_id: number;
    year_level: number;
    section?: string;
}
