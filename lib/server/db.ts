import mysql, { type Pool } from "mysql2/promise";

let pool: Pool | null = null;

export function database(): Pool {
  if (pool) return pool;
  const { MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE } = process.env;
  if (!MYSQL_HOST || !MYSQL_USER || !MYSQL_DATABASE) throw new Error("MYSQL_NOT_CONFIGURED");
  pool = mysql.createPool({
    host: MYSQL_HOST,
    port: Number(MYSQL_PORT || 3306),
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
    connectionLimit: 3,
    connectTimeout: 10_000,
    enableKeepAlive: true,
    charset: "utf8mb4",
  });
  return pool;
}
