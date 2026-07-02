const { getPool } = require('../db');

async function run() {
    try {
        const pool = await getPool();
        console.log('Checking and adding notice_period_applicable column to resignations table...');
        
        await pool.request().query(`
            IF NOT EXISTS (
                SELECT * FROM sys.columns 
                WHERE object_id = OBJECT_ID(N'[dbo].[resignations]') 
                AND name = 'notice_period_applicable'
            )
            BEGIN
                ALTER TABLE [dbo].[resignations] ADD [notice_period_applicable] NVARCHAR(50) NULL;
            END
        `);
        console.log('notice_period_applicable column check/addition complete.');

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

run();
