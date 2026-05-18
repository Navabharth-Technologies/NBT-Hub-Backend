const sql = require('mssql');

const dbConfig = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'sa#7744',
    server: process.env.DB_SERVER || '192.168.1.8\\SQLEXPRESS01',
    database: process.env.DB_NAME || 'NBT Hub',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 60000,    // Increased to 60s
        connectionTimeout: 30000, // Increased to 30s
        cancelTimeout: 30000,
    },
    pool: {
        max: 150, // Increased pool size
        min: 10,
        idleTimeoutMillis: 30000,
        acquireTimeoutMillis: 120000 // Higher buffer for high load
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
                // On fatal pool error, reset so next request tries again
                pool = null;
                poolPromise = null;
            });

            console.log(`[DB] Attempting connection to ${dbConfig.server} as ${dbConfig.user}...`);
            console.log(`[DB] Using database: ${dbConfig.database}, Port: ${dbConfig.port}`);
            await pool.connect();
            console.log('✅ --- DATABASE CONNECTION ESTABLISHED ---');
            console.log(`✅ Connected to: ${dbConfig.database} on ${dbConfig.server}`);
            
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

