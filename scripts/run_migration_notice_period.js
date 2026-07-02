const { getPool } = require('../db');

async function run() {
    try {
        const pool = await getPool();
        console.log('Checking and adding notice period columns to resignations table...');
        
        // 1. Add notice_period_reason_by_pm
        await pool.request().query(`
            IF NOT EXISTS (
                SELECT * FROM sys.columns 
                WHERE object_id = OBJECT_ID(N'[dbo].[resignations]') 
                AND name = 'notice_period_reason_by_pm'
            )
            BEGIN
                ALTER TABLE [dbo].[resignations] ADD [notice_period_reason_by_pm] NVARCHAR(MAX) NULL;
            END
        `);
        console.log('notice_period_reason_by_pm column check/addition complete.');

        // 2. Add notice_period_from_date
        await pool.request().query(`
            IF NOT EXISTS (
                SELECT * FROM sys.columns 
                WHERE object_id = OBJECT_ID(N'[dbo].[resignations]') 
                AND name = 'notice_period_from_date'
            )
            BEGIN
                ALTER TABLE [dbo].[resignations] ADD [notice_period_from_date] DATE NULL;
            END
        `);
        console.log('notice_period_from_date column check/addition complete.');

        // 3. Add notice_period_to_date
        await pool.request().query(`
            IF NOT EXISTS (
                SELECT * FROM sys.columns 
                WHERE object_id = OBJECT_ID(N'[dbo].[resignations]') 
                AND name = 'notice_period_to_date'
            )
            BEGIN
                ALTER TABLE [dbo].[resignations] ADD [notice_period_to_date] DATE NULL;
            END
        `);
        console.log('notice_period_to_date column check/addition complete.');

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

run();
