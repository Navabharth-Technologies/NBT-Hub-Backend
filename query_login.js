const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { getPool } = require('./db');

async function run() {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT TOP 5 id, name, email, password, role 
            FROM users 
            WHERE status = 'Active'
        `);
        console.log(JSON.stringify(result.recordset, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
