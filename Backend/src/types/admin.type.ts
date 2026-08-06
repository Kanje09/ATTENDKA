export interface admin_type {
    id: number;
    name: string;

    email: string;
    password: string;
    role: "admin";

    created_at: Date;
};