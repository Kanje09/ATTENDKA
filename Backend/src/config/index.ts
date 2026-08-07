import dotenv from "dotenv"
dotenv.config();

export function required(key: string): string {
    const value = process.env[key];

    if (!value) {
        throw new Error(`Messing required environment variable: ${key}`);
    };
    return value
};

