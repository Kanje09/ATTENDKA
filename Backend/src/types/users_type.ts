export interface users {
    id: number;
    last_name: string;
    first_name: string;
    password: string;
    role: "student" | "advisor" | "admin";
};