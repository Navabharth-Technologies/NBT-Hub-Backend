const { getPool } = require('../db');

async function run() {
    try {
        const pool = await getPool();
        console.log('Checking and renaming column status to hr_status in service_certificate_requests...');
        
        // 1. Rename status to hr_status
        await pool.request().query(`
            IF EXISTS (
                SELECT * FROM sys.columns 
                WHERE object_id = OBJECT_ID(N'[dbo].[service_certificate_requests]') 
                AND name = 'status'
            )
            BEGIN
                EXEC sp_rename 'dbo.service_certificate_requests.status', 'hr_status', 'COLUMN';
            END
        `);
        console.log('Rename check/action complete.');

        // 2. Add pm_status column if it doesn't exist
        console.log('Checking and adding pm_status column to service_certificate_requests...');
        await pool.request().query(`
            IF NOT EXISTS (
                SELECT * FROM sys.columns 
                WHERE object_id = OBJECT_ID(N'[dbo].[service_certificate_requests]') 
                AND name = 'pm_status'
            )
            BEGIN
                ALTER TABLE [dbo].[service_certificate_requests] ADD [pm_status] NVARCHAR(50) NOT NULL DEFAULT 'Pending';
            END
        `);
        console.log('pm_status check/action complete.');

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

run();
