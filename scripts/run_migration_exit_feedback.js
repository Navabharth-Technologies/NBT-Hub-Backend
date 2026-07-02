const { getPool } = require('../db');

async function run() {
    try {
        const pool = await getPool();
        console.log('Dropping existing exit_feedback table if exists and recreating...');

        const query = `
            IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[exit_feedback]') AND type in (N'U'))
            BEGIN
                DROP TABLE [dbo].[exit_feedback];
                PRINT 'Existing exit_feedback table dropped.';
            END

            CREATE TABLE [dbo].[exit_feedback] (
                [id] INT IDENTITY(1,1) PRIMARY KEY,
                [employee_id] INT NOT NULL FOREIGN KEY REFERENCES [dbo].[users]([id]),
                [resignation_id] INT NULL FOREIGN KEY REFERENCES [dbo].[resignations]([id]),
                [exit_formality_id] INT NULL FOREIGN KEY REFERENCES [dbo].[exit_formalities]([id]),
                
                [like_most] NVARCHAR(MAX) NULL,
                [improve_company] NVARCHAR(MAX) NULL,
                
                [employee_signature] NVARCHAR(255) NULL,
                [employee_signature_date] DATE NULL,
                
                [hr_signature] NVARCHAR(255) NULL,
                [hr_signature_date] DATE NULL,
                
                [manager_signature] NVARCHAR(255) NULL,
                [manager_signature_date] DATE NULL,
                
                [created_at] DATETIME DEFAULT DATEADD(MINUTE, 330, GETUTCDATE()),
                [updated_at] DATETIME DEFAULT DATEADD(MINUTE, 330, GETUTCDATE())
            );
            PRINT 'Table [dbo].[exit_feedback] created.';
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
