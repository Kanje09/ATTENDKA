import { Pool } from 'pg';
import { required } from './index.js';

const pool = new Pool({
    user: required("DB_USER"),
    host: required("DB_HOST"),
    database: required("DB_NAME"),
    password: required("DB_PASSWORD"),
    port: Number(required("DB_PORT")),
});

export default pool;