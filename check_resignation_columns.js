const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function main() {
  try {
    const pool = await sql.connect(dbConfig);
    console.log("Connected to database successfully!");

    const result = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'resignations'");
    console.log("\n--- RESIGNATIONS COLUMNS ---");
    console.table(result.recordset);

    await sql.close();
  } catch (err) {
    console.error("Database connection/query error:", err);
  }
}

main();
