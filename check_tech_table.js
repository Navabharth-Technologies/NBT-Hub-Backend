const sql = require('mssql');
require('dotenv').config();
const cfg = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: { encrypt: false, trustServerCertificate: true }
};
sql.connect(cfg).then(async pool => {
  try {
    const res = await pool.request().query('SELECT * FROM team_technical_support');
    console.log('team_technical_support contents:', res.recordset);
  } catch (err) {
    console.error('Error fetching from team_technical_support:', err.message);
  }
  sql.close();
}).catch(e => { console.error(e.message); sql.close(); });
