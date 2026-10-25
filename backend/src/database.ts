import mysql from 'mysql2/promise';

export const db = mysql.createPool({
  host: process.env.DB_HOST ?? '',
  port: Number(process.env.DB_PORT) || 4000,
  user: process.env.DB_USER ?? '',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sys',
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});