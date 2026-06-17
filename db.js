const sql = require('mssql');

const dbConfig = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'sa#7744',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'NBT Hub',
    port: 1433,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 60000,    // Increased to 60s
        connectTimeout: 30000, // Fixed property name for Tedious driver
        cancelTimeout: 30000,
    },
    pool: {
        max: 5,  // Lowered to queue requests in Node.js rather than overwhelm SQL Server (5 * 12 = 60 max)
        min: 0,  // Allow connections to completely close when idle to save DB memory
        idleTimeoutMillis: 30000,
        acquireTimeoutMillis: 60000 // Queue wait time
    }
};

let pool = null;
let poolPromise = null;

/**
 * Get or create a database connection pool.
 * Uses a singleton promise to prevent "Cannot close a pool while it is connecting" errors.
 */
async function getPool() {
    // 1. Return existing connected pool
    if (pool && pool.connected) {
        return pool;
    }

    // 2. If a connection attempt is already in progress, wait for it
    if (poolPromise) {
        return poolPromise;
    }

    // 3. Start a new connection attempt
    poolPromise = (async () => {
        try {
            // Clean up old pool if it exists but is disconnected
            if (pool) {
                try {
                    // Only try to close if not already connecting (safety check)
                    if (!pool.connecting) {
                        await pool.close();
                    }
                } catch (err) {
                    console.error('Error closing dead pool:', err.message);
                }
            }

            pool = new sql.ConnectionPool(dbConfig);
            
            pool.on('error', err => {
                console.error('DATABASE POOL ERROR:', err.message);
                // DO NOT set pool = null here, it leaks connections and pools. The pool will attempt to recover.
            });

            if (process.env.NODE_APP_INSTANCE === '0' || process.env.NODE_APP_INSTANCE === undefined) {
                console.log(`[DB] Attempting connection to ${dbConfig.server} as ${dbConfig.user}...`);
                console.log(`[DB] Using database: ${dbConfig.database}, Port: ${dbConfig.port}`);
            }
            await pool.connect();
            if (process.env.NODE_APP_INSTANCE === '0' || process.env.NODE_APP_INSTANCE === undefined) {
                console.log('✅ --- DATABASE CONNECTION ESTABLISHED ---');
                console.log(`✅ Connected to: ${dbConfig.database} on ${dbConfig.server}`);
            }
            
            return pool;
        } catch (err) {
            console.error('❌ DATABASE CONNECTION FAILED:', err.message);
            pool = null;
            poolPromise = null; // Reset promise so next call can retry
            throw err;
        }
    })();

    return poolPromise;
}

module.exports = {
    sql,
    getPool
};

