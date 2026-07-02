const { getPool } = require('../db');

async function run() {
    try {
        const pool = await getPool();
        console.log('Dropping existing exit_formalities table if exists and recreating with explicit detail columns at the start...');

        const query = `
            IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[exit_formalities]') AND type in (N'U'))
            BEGIN
                DROP TABLE [dbo].[exit_formalities];
                PRINT 'Existing exit_formalities table dropped.';
            END

            CREATE TABLE [dbo].[exit_formalities] (
                [id] INT IDENTITY(1,1) PRIMARY KEY,
                [employee_id] INT NOT NULL FOREIGN KEY REFERENCES [dbo].[users]([id]),
                [resignation_id] INT NULL FOREIGN KEY REFERENCES [dbo].[resignations]([id]),
                
                -- Explicit Employee Details at the start of the table
                [employee_name] NVARCHAR(255) NULL,
                [department] NVARCHAR(255) NULL,
                [last_working_day] DATE NULL,
                [company_employee_id] NVARCHAR(255) NULL,
                [reporting_manager] NVARCHAR(255) NULL,
                [resignation_submitted_date] DATE NULL,
                [designation] NVARCHAR(255) NULL,
                [date_of_joining] DATE NULL,
                [hr_name] NVARCHAR(255) NULL,
                
                [reason_type] NVARCHAR(255) NULL,
                [reason_other_specify] NVARCHAR(MAX) NULL,
                [handover_completed] NVARCHAR(50) NULL,
                [handover_to_employee_id] INT NULL FOREIGN KEY REFERENCES [dbo].[users]([id]),
                [handover_to_name] NVARCHAR(255) NULL,
                [pending_tasks] NVARCHAR(MAX) NULL,
                [asset_id_card_status] NVARCHAR(50) NULL,
                [asset_id_card_remarks] NVARCHAR(MAX) NULL,
                [asset_laptop_status] NVARCHAR(50) NULL,
                [asset_laptop_remarks] NVARCHAR(MAX) NULL,
                [asset_mobile_status] NVARCHAR(50) NULL,
                [asset_mobile_remarks] NVARCHAR(MAX) NULL,
                [asset_access_card_status] NVARCHAR(50) NULL,
                [asset_access_card_remarks] NVARCHAR(MAX) NULL,
                [asset_other_status] NVARCHAR(50) NULL,
                [asset_other_remarks] NVARCHAR(MAX) NULL,
                [clearance_hr_status] NVARCHAR(50) NULL,
                [clearance_hr_remarks] NVARCHAR(MAX) NULL,
                [clearance_it_status] NVARCHAR(50) NULL,
                [clearance_it_remarks] NVARCHAR(MAX) NULL,
                [clearance_finance_status] NVARCHAR(50) NULL,
                [clearance_finance_remarks] NVARCHAR(MAX) NULL,
                [clearance_admin_status] NVARCHAR(50) NULL,
                [clearance_admin_remarks] NVARCHAR(MAX) NULL,
                [notice_period_served] NVARCHAR(50) NULL,
                [recovery_details] NVARCHAR(MAX) NULL,
                [final_settlement_date] DATE NULL,
                [created_at] DATETIME DEFAULT DATEADD(MINUTE, 330, GETUTCDATE()),
                [updated_at] DATETIME DEFAULT DATEADD(MINUTE, 330, GETUTCDATE())
            );
            PRINT 'Table [dbo].[exit_formalities] created with details columns at the start.';
        `;

        await pool.request().query(query);
        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

run();
