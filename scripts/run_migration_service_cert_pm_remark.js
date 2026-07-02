const { getPool } = require('../db');

async function run() {
    try {
        const pool = await getPool();
        console.log('Checking service_certificate_requests column order for pm_remark...');

        const columnsResult = await pool.request().query(`
            SELECT COLUMN_NAME, ORDINAL_POSITION
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'service_certificate_requests'
            ORDER BY ORDINAL_POSITION
        `);

        const columns = columnsResult.recordset;
        if (columns.length === 0) {
            console.log('Table service_certificate_requests does not exist.');
            process.exit(0);
        }

        const adminRemarkCol = columns.find(c => c.COLUMN_NAME === 'admin_remark');
        const pmRemarkCol = columns.find(c => c.COLUMN_NAME === 'pm_remark');

        if (!adminRemarkCol) {
            console.log('admin_remark column does not exist! Cannot proceed.');
            process.exit(1);
        }

        // Check if pm_remark is already positioned right after admin_remark
        if (pmRemarkCol && pmRemarkCol.ORDINAL_POSITION === adminRemarkCol.ORDINAL_POSITION + 1) {
            console.log('pm_remark is already positioned immediately after admin_remark. No migration needed.');
            process.exit(0);
        }

        console.log('Columns need to be reordered. Recreating table and preserving data...');

        const hasPmRemark = !!pmRemarkCol;

        // Build the INSERT query based on whether columns exist in the old table
        const insertCols = [
            'id', 'employee_id', 'purpose', 'designation_at_request', 'hr_status', 'pm_status', 'admin_remark', 'pm_remark', 'certificate_url',
            'created_at', 'updated_at', 'laptop_details', 'serial_number', 'has_mouse', 'has_keyboard', 'has_laptop_stand',
            'mouse', 'keyboard', 'laptop_stand', 'ruf_pad', 'pendrive', 'company_mobile', 'external_camera', 'earphone_headphone', 'tablet'
        ];

        const selectCols = [
            '[id]', '[employee_id]', '[purpose]', '[designation_at_request]', '[hr_status]', '[pm_status]',
            '[admin_remark]',
            hasPmRemark ? '[pm_remark]' : 'CAST(NULL AS NVARCHAR(MAX)) AS [pm_remark]',
            '[certificate_url]',
            '[created_at]', '[updated_at]', '[laptop_details]', '[serial_number]', '[has_mouse]', '[has_keyboard]', '[has_laptop_stand]',
            '[mouse]', '[keyboard]', '[laptop_stand]', '[ruf_pad]', '[pendrive]', '[company_mobile]', '[external_camera]', '[earphone_headphone]', '[tablet]'
        ];

        const query = `
            BEGIN TRANSACTION;
            
            BEGIN TRY
                -- 1. Drop constraints on service_certificate_requests
                DECLARE @Sql NVARCHAR(MAX) = '';
                SELECT @Sql += 'ALTER TABLE [dbo].[service_certificate_requests] DROP CONSTRAINT ' + QUOTENAME(fk.name) + ';'
                FROM sys.foreign_keys fk
                WHERE fk.parent_object_id = OBJECT_ID(N'[dbo].[service_certificate_requests]');
                
                IF @Sql <> ''
                BEGIN
                    EXEC sp_executesql @Sql;
                END

                -- Drop Primary Key constraint
                DECLARE @PkName NVARCHAR(255);
                SELECT @PkName = name 
                FROM sys.key_constraints 
                WHERE type = 'PK' AND parent_object_id = OBJECT_ID(N'[dbo].[service_certificate_requests]');
                
                IF @PkName IS NOT NULL
                BEGIN
                    EXEC('ALTER TABLE [dbo].[service_certificate_requests] DROP CONSTRAINT ' + @PkName);
                END

                -- Drop index if it exists
                IF EXISTS (
                    SELECT * FROM sys.indexes 
                    WHERE object_id = OBJECT_ID(N'[dbo].[service_certificate_requests]') 
                    AND name = N'IX_service_certs_employee'
                )
                BEGIN
                    DROP INDEX [IX_service_certs_employee] ON [dbo].[service_certificate_requests];
                END

                -- 2. Rename old table to service_certificate_requests_old
                IF OBJECT_ID(N'[dbo].[service_certificate_requests_old]') IS NOT NULL
                BEGIN
                    DROP TABLE [dbo].[service_certificate_requests_old];
                END

                EXEC sp_rename 'dbo.service_certificate_requests', 'service_certificate_requests_old';

                -- 3. Create new table with pm_status right after hr_status, and pm_remark right after admin_remark
                CREATE TABLE [dbo].[service_certificate_requests] (
                    [id] INT IDENTITY(1,1) NOT NULL,
                    [employee_id] INT NOT NULL,
                    [purpose] NVARCHAR(255) NOT NULL,
                    [designation_at_request] NVARCHAR(255) NOT NULL,
                    [hr_status] NVARCHAR(50) NULL DEFAULT ('Pending'),
                    [pm_status] NVARCHAR(50) NOT NULL DEFAULT ('Pending'),
                    [admin_remark] NVARCHAR(MAX) NULL,
                    [pm_remark] NVARCHAR(MAX) NULL,
                    [certificate_url] NVARCHAR(MAX) NULL,
                    [created_at] DATETIME NULL DEFAULT (dateadd(minute,(330),getutcdate())),
                    [updated_at] DATETIME NULL DEFAULT (dateadd(minute,(330),getutcdate())),
                    [laptop_details] NVARCHAR(MAX) NULL,
                    [serial_number] NVARCHAR(MAX) NULL,
                    [has_mouse] BIT NULL,
                    [has_keyboard] BIT NULL,
                    [has_laptop_stand] BIT NULL,
                    [mouse] BIT NULL DEFAULT ((0)),
                    [keyboard] BIT NULL DEFAULT ((0)),
                    [laptop_stand] BIT NULL DEFAULT ((0)),
                    [ruf_pad] BIT NULL DEFAULT ((0)),
                    [pendrive] BIT NULL DEFAULT ((0)),
                    [company_mobile] BIT NULL DEFAULT ((0)),
                    [external_camera] BIT NULL DEFAULT ((0)),
                    [earphone_headphone] BIT NULL DEFAULT ((0)),
                    [tablet] BIT NULL DEFAULT ((0)),
                    CONSTRAINT [PK_service_certificate_requests] PRIMARY KEY CLUSTERED ([id] ASC)
                );

                -- 4. Copy data from old table to new table
                SET IDENTITY_INSERT [dbo].[service_certificate_requests] ON;

                INSERT INTO [dbo].[service_certificate_requests] (
                    ${insertCols.map(c => `[${c}]`).join(', ')}
                )
                SELECT 
                    ${selectCols.join(', ')}
                FROM [dbo].[service_certificate_requests_old];

                SET IDENTITY_INSERT [dbo].[service_certificate_requests] OFF;

                -- 5. Create constraints and indexes back
                ALTER TABLE [dbo].[service_certificate_requests] ADD CONSTRAINT [FK_service_certificate_requests_users] FOREIGN KEY([employee_id]) REFERENCES [dbo].[users] ([id]);
                CREATE NONCLUSTERED INDEX [IX_service_certs_employee] ON [dbo].[service_certificate_requests] ([employee_id] ASC);

                -- 6. Drop old table
                DROP TABLE [dbo].[service_certificate_requests_old];

                COMMIT TRANSACTION;
                PRINT 'Migration transaction committed successfully.';
            END TRY
            BEGIN CATCH
                IF @@TRANCOUNT > 0
                BEGIN
                    ROLLBACK TRANSACTION;
                END
                PRINT 'Error detected. Transaction rolled back.';
                THROW;
            END CATCH
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
