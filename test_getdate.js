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
  // Get a real user id
  const uRes = await pool.request().query('SELECT TOP 1 id FROM users ORDER BY id');
  const realUserId = uRes.recordset[0].id;
  
  // Insert a test notification using GETDATE()
  await pool.request()
    .input('uid', sql.Int, realUserId)
    .query(`INSERT INTO notifications (target_user_id, message, type, is_read, created_at)
            VALUES (@uid, 'TEST_GETDATE_CHECK', 'Test', 0, GETDATE())`);
  
  // Read it back immediately
  const r = await pool.request()
    .input('uid2', sql.Int, realUserId)
    .query(`SELECT TOP 1 id, created_at, CONVERT(varchar, created_at, 120) as raw_str,
      CONVERT(varchar, GETDATE(), 120) as server_now
    FROM notifications WHERE target_user_id = @uid2 AND message = 'TEST_GETDATE_CHECK'
    ORDER BY id DESC`);
  
  const n = r.recordset[0];
  const now = new Date();
  console.log('Test Notification:');
  console.log('  raw_str (stored in DB)  :', n.raw_str);
  console.log('  JS Date from driver     :', n.created_at.toString());
  console.log('  GETDATE() (server now)  :', n.server_now);
  console.log('  Node JS now()           :', now.toLocaleString('en-IN', {timeZone:'Asia/Kolkata'}));
  console.log('');
  console.log('  raw_str matches GETDATE?', n.raw_str.substring(0,16) === n.server_now.substring(0,16) ? 'YES ✅' : 'NO ❌');
  console.log('  JS Date = server time?  ', n.created_at.toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}).includes(n.server_now.substring(11,16)) ? 'YES ✅' : 'check manually');

  // Cleanup
  await pool.request()
    .input('uid3', sql.Int, realUserId)
    .query("DELETE FROM notifications WHERE target_user_id = @uid3 AND message = 'TEST_GETDATE_CHECK'");
  sql.close();
}).catch(e => { console.error(e.message); sql.close(); });
