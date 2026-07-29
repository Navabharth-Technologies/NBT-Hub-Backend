require('dotenv').config();
const { getPool } = require('./db');
(async () => {
    try {
        const pool = await getPool();
        const res = await pool.request().query('SELECT u.id, u.name, u.role, ep.designation FROM users u LEFT JOIN employee_profiles ep ON u.id = ep.employee_id');
        console.log(JSON.stringify(res.recordset, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
