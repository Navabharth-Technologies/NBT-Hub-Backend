const { getPool } = require('../db');

async function run() {
    try {
        const pool = await getPool();
        console.log('Adding status column to users table...');
        
        // 1. Add status column if it doesn't exist
        await pool.request().query(`
            IF NOT EXISTS (
                SELECT * FROM sys.columns 
                WHERE object_id = OBJECT_ID(N'[dbo].[users]') 
                AND name = 'status'
            )
            BEGIN
                ALTER TABLE [dbo].[users] ADD [status] VARCHAR(50) NOT NULL DEFAULT 'Active';
            END
        `);
        console.log('Column checks/alteration complete.');

        // 2. Set existing status to 'Resigned' for users with approved resignations
        const result = await pool.request().query(`
            UPDATE users 
            SET status = 'Resigned' 
            WHERE id IN (
                SELECT employee_id FROM resignations WHERE status = 'Approved'
            )
        `);
        console.log(`Updated ${result.rowsAffected[0]} user status(es) to 'Resigned'.`);

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

run();
