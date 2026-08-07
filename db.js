const sql = require('mssql');

const dbConfig = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'sa#7744',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'NBT Hub',
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERT !== 'false', // Default to true
        enableArithAbort: true,
        requestTimeout: 60000,    // Increased to 60s
        connectTimeout: 30000, // Fixed property name for Tedious driver
        cancelTimeout: 30000,
    },
    pool: {
        max: 20,  // Increased from 5 to prevent connection starvation and timeout errors under concurrent load
        min: 0,   // Set to 0 to prevent stale/dead connections from staying in the pool during idle periods
        idleTimeoutMillis: 30000,
        acquireTimeoutMillis: 60000 // Queue wait time
    }
};

if (process.env.DB_PORT) {
    dbConfig.port = parseInt(process.env.DB_PORT, 10);
} else if (!process.env.DB_INSTANCE) {
    // Default port if no instance name is provided
    dbConfig.port = 1433;
}

if (process.env.DB_INSTANCE) {
    dbConfig.options.instanceName = process.env.DB_INSTANCE;
}

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

