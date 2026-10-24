import { Pool } from 'pg';
import { required } from './index.js';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool(
    connectionString
        ? {
              connectionString,
              ssl: process.env.DATABASE_SSL === "true"
                  ? { rejectUnauthorized: true }
                  : undefined,
          }
        : {
              user: required("DB_USER"),
              host: required("DB_HOST"),
              database: required("DB_NAME"),
              password: required("DB_PASSWORD"),
              port: Number(process.env.DB_PORT || "5432"),
          },
);

pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error:", error);
});

export default pool;