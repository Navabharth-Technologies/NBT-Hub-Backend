const { getPool } = require('../db');

async function run() {
    try {
        const pool = await getPool();
        console.log('Checking and adding reviewed_by_tl column to resignations table...');
        
        await pool.request().query(`
            IF NOT EXISTS (
                SELECT * FROM sys.columns 
                WHERE object_id = OBJECT_ID(N'[dbo].[resignations]') 
                AND name = 'reviewed_by_tl'
            )
            BEGIN
                ALTER TABLE [dbo].[resignations] ADD [reviewed_by_tl] BIT NOT NULL DEFAULT 0;
            END
        `);
        console.log('reviewed_by_tl column check/addition complete.');

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

run();
