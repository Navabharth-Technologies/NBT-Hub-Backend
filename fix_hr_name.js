require('dotenv').config();
const sql = require('mssql');

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    instanceName: process.env.DB_INSTANCE,
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: true,
  },
};

async function main() {
  try {
    const pool = await sql.connect(config);

    // Fix HR user name: id=202522, hr@navabharathtechnologies.com
    console.log('Fixing HR user name from "Ashwini B G" to "Ravi Kumar B M"...');
    const updateResult = await pool.request()
      .input('newName', sql.NVarChar(255), 'Ravi Kumar B M')
      .input('userId', sql.Int, 202522)
      .query(`UPDATE users SET name = @newName WHERE id = @userId`);

    console.log(`Rows affected: ${updateResult.rowsAffected[0]}`);

    // Verify the fix
    console.log('\n=== Verifying fix ===');
    const verify = await pool.request().query(`
      SELECT id, email, role, name, team
      FROM users
      WHERE id IN (202521, 202522)
    `);
    console.table(verify.recordset);

    await pool.close();
    console.log('Done!');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
