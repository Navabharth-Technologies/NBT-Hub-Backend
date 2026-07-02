const { getPool } = require('../db');

async function run() {
    try {
        const pool = await getPool();
        console.log('Starting migration to alter reviewed_by_tl to NVARCHAR(MAX)...');

        // 1. Find and drop default constraints on reviewed_by_tl
        console.log('Finding and dropping default constraints...');
        await pool.request().query(`
            DECLARE @ConstraintName NVARCHAR(200)
            SELECT @ConstraintName = name
            FROM sys.default_constraints
            WHERE parent_object_id = OBJECT_ID('[dbo].[resignations]')
            AND parent_column_id = COLUMNPROPERTY(OBJECT_ID('[dbo].[resignations]'), 'reviewed_by_tl', 'ColumnId')

            IF @ConstraintName IS NOT NULL
            BEGIN
                EXEC('ALTER TABLE [dbo].[resignations] DROP CONSTRAINT ' + @ConstraintName)
            END
        `);
        console.log('Default constraint drop check complete.');

        // 2. Alter column type to NVARCHAR(MAX) NULL
        console.log('Altering column reviewed_by_tl to NVARCHAR(MAX) NULL...');
        await pool.request().query(`
            ALTER TABLE [dbo].[resignations] ALTER COLUMN [reviewed_by_tl] NVARCHAR(MAX) NULL;
        `);
        console.log('Altered column successfully.');

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

run();
