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
    SELECT u.id, u.name, u.role, e.designation as emp_designation, ep.designation as ep_designation
    FROM users u
    LEFT JOIN employee e ON u.id = e.user_id
    LEFT JOIN employee_profiles ep ON u.id = ep.employee_id
  `);
  console.log(JSON.stringify(r.recordset, null, 2));
  sql.close();
}).catch(e => { console.error(e.message); sql.close(); });
