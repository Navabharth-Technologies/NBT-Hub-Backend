const { getPool } = require('../db');

/**
 * Migration: Create hr_personnel table
 * 
 * Purpose:
 *   Bridges the permanent HR Team account (hr@navabharathtechnologies.com)
 *   with individual HR persons' personal accounts (which use Employee Screen).
 * 
 *   - When an HR person is hired, a row is inserted here with is_active = 1
 *   - The HR Team screen reads display_name from this table
 *   - When an HR person resigns, is_active = 0 and resigned_at is set
 *   - The personal account (users table) is set to status = 'Resigned'
 *   - This record is NEVER deleted — kept for audit history forever
 */
async function run() {
    try {
        const pool = await getPool();
        console.log('[HR Personnel Migration] Starting...');

        // Create hr_personnel table if it does not exist
        await pool.request().query(`
            IF NOT EXISTS (
                SELECT * FROM sysobjects WHERE name = 'hr_personnel' AND xtype = 'U'
            )
            BEGIN
                CREATE TABLE [dbo].[hr_personnel] (
                    [id]             INT IDENTITY(1,1) PRIMARY KEY,
                    [user_id]        INT NOT NULL,           -- FK to users.id (personal HR account)
                    [display_name]   NVARCHAR(255) NOT NULL, -- Name shown on HR Team screen (e.g. "Ravi Kumar")
                    [personal_email] NVARCHAR(255) NOT NULL, -- Personal email for reference/display
                    [assigned_by]    INT NULL,               -- user_id of SuperAdmin who created this record
                    [assigned_at]    DATETIME DEFAULT GETDATE(),
                    [resigned_at]    DATETIME NULL,          -- Filled when this HR person resigns
                    [is_active]      BIT NOT NULL DEFAULT 1  -- 1 = current HR, 0 = resigned (NEVER deleted)
                );
                PRINT 'hr_personnel table created successfully.';
            END
            ELSE
            BEGIN
                PRINT 'hr_personnel table already exists. Skipping creation.';
            END
        `);
        console.log('[HR Personnel Migration] hr_personnel table check complete.');

        console.log('[HR Personnel Migration] Completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('[HR Personnel Migration] FAILED:', err);
        process.exit(1);
    }
}

run();
