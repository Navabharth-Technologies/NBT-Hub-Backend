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
  const r = await pool.request().query(`
    SELECT TOP 5 id, target_user_id, message, type,
      created_at,
      CONVERT(varchar, created_at, 120) as raw_str,
      CONVERT(varchar, GETDATE(), 120) as server_now_str,
      CONVERT(varchar, GETUTCDATE(), 120) as utc_now_str
    FROM notifications
    WHERE type = 'Resignation'
    ORDER BY id DESC
  `);
  r.recordset.forEach(n => {
    const raw = n.raw_str;
    const jsDate = n.created_at;
    console.log('--- Notification ID:', n.id);
    console.log('  raw_str (DB stored):', raw);
    console.log('  JS Date from driver:', jsDate ? jsDate.toString() : 'null');
    console.log('  server_now (GETDATE):', n.server_now_str);
    console.log('  utc_now (GETUTCDATE):', n.utc_now_str);
    console.log('  message:', n.message);
  });
  sql.close();
}).catch(e => { console.error(e.message); sql.close(); });
