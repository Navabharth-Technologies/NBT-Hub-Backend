const sql = require('mssql');

const dbConfig = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'sa#7744',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'NBT Hub',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 300000, // Query execution timeout increased to 5m (ETIMEOUT prevention)
        connectionTimeout: 300000 // Connection establishment timeout increased to 5m
    },
    pool: {
        max: 50, // Expanded pool for higher concurrent resilience
        min: 5,  // Keep warm connections ready to avoid cold-start latency
        idleTimeoutMillis: 30000,
        acquireTimeoutMillis: 30000 // Prevent pool acquisition hangs
    }
};

/**
 * Optimized Connection Pool Handler
 * - Removes heavy schema auditing from the application lifecycle.
 * - Standardizes on a single, persistent connection pool.
 */
const poolPromise = new sql.ConnectionPool(dbConfig)
    .connect()
    .then(pool => {
        console.log('✅ --- DATABASE CONNECTION ESTABLISHED ---');
        console.log(`✅ Connected to: ${dbConfig.database} on ${dbConfig.server}`);
        return pool;
    })
    .catch(err => {
        console.error('❌ DATABASE CONNECTION FAILED:', err.message);
        console.error('❌ Instance:', dbConfig.server);
        console.error('❌ Check your .env file and ensure SQL Server service is running.');
        // Throw to allow server.js to catch it
        throw err;
    });

module.exports = {
    sql,
    poolPromise
};
