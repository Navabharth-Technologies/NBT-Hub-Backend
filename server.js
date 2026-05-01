require('dotenv').config();
const cron = require('node-cron');
const { importAttendance } = require('./scripts/import-attendance');
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const emailjs = require('@emailjs/nodejs');
const EMAILJS_CONFIG = {
  serviceId: process.env.EMAILJS_SERVICE_ID,
  reminderTemplateId: process.env.EMAILJS_REMINDER_TEMPLATE_ID || process.env.EMAILJS_TEMPLATE_ID,
  warningTemplateId: process.env.EMAILJS_WARNING_TEMPLATE_ID || process.env.EMAILJS_TEMPLATE_ID,
  publicKey: process.env.EMAILJS_PUBLIC_KEY,
  privateKey: process.env.EMAILJS_PRIVATE_KEY
};

const app = express();
app.get('/api/test-sync', (req, res) => res.send('Backend is Working!'));

// --- PREMIUM LOGGING UTILITY --- //
const Log = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[90m',

  // High-Fidelity Colors
  cyan: '\x1b[36m',
  emerald: '\x1b[32m',
  gold: '\x1b[33m',
  crimson: '\x1b[31m',
  sky: '\x1b[94m',
  pink: '\x1b[35m',

  timestamp: () => `\x1b[90m[${new Date().toLocaleTimeString('en-IN', { hour12: true })}]\x1b[0m`,

  // Semantic Loggers
  ready: (msg) => {
    console.log(`\n${Log.emerald}${Log.bold}â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”${Log.reset}`);
    console.log(`${Log.emerald}${Log.bold}â”‚  âœ… READY  \x1b[0m ${Log.cyan}${msg.padEnd(41)}\x1b[32m\x1b[1mâ”‚${Log.reset}`);
    console.log(`${Log.emerald}${Log.bold}â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜${Log.reset}\n`);
  },

  network: (origin, method, url) => {
    const methodColors = { 'GET': '\x1b[32m', 'POST': '\x1b[33m', 'PUT': '\x1b[34m', 'DELETE': '\x1b[31m' };
    const mColor = methodColors[method] || '\x1b[37m';
    console.log(`${Log.timestamp()} \x1b[36m${origin.padEnd(15)}\x1b[0m âš¡ ${mColor}${method.padEnd(7)}\x1b[0m \x1b[90mâž”\x1b[0m \x1b[35m${url}\x1b[0m`);
  },

  success: (area, msg) => console.log(`${Log.timestamp()} ${Log.emerald}${Log.bold}[${area.toUpperCase()}]\x1b[0m ${Log.emerald}${msg}${Log.reset}`),

  auth: (msg, hint) => {
    console.log(`${Log.timestamp()} ${Log.gold}${Log.bold}ðŸ›¡ï¸  [AUTH]\x1b[0m ${Log.gold}${msg}${Log.reset}`);
    if (hint) console.log(`           \x1b[90mðŸ’¡ ${hint}\x1b[0m`);
  },

  error: (area, msg, hint) => {
    console.log(`${Log.timestamp()} ${Log.crimson}${Log.bold}âŒ [${area.toUpperCase()}]\x1b[0m ${Log.crimson}${msg}${Log.reset}`);
    if (hint) console.log(`           \x1b[90mðŸ’¡ ${hint}\x1b[0m`);
  },

  divider: () => console.log(`\x1b[90m${'â”€'.repeat(60)}\x1b[0m`)
};

const BANNER = `
\x1b[36m\x1b[1m
   ███╗   ██╗██████╗ ████████╗     ██╗  ██╗██╗   ██╗██████╗ 
   ████╗  ██║██╔══██╗╚══██╔══╝     ██║  ██║██║   ██║██╔══██╗
   ██╔██╗ ██║██████╔╝   ██║        ███████║██║   ██║██████╔╝
   ██║╚██╗██║██╔══██╗   ██║        ██╔══██║██║   ██║██╔══██╗
   ██║ ╚████║██████╔╝   ██║        ██║  ██║╚██████╔╝██████╔╝
   ╚═╝  ╚═══╝╚═════╝    ╚═╝        ╚═╝  ╚═╝ ╚═════╝ ╚═════╝
\x1b[0m

\x1b[94m💎  PREMIUM BACKEND OPERATIONAL\x1b[0m
\x1b[90m──────────────────────────────────────────────\x1b[0m
`;

// Ensure the uploads directory exists in the backend root
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

app.use(compression()); // 0. Enable Gzip Compression for high-performance dashboard analytics
const PORT = process.env.PORT || 5000;

// Initialize Database connection
const { sql, poolPromise } = require('./db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Store in the 'uploads' folder
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    // Make sure the file name is unique by appending the current timestamp & replacing spaces with hyphens
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'));
  }
});
const upload = multer({ storage: storage });

// NEW: Multer configuration for memory storage (direct to DB as base64 or cloud storage)
const memoryStorage = multer.memoryStorage();
const memoryUpload = multer({ storage: memoryStorage });

// --- GLOBAL UTILITY: Robust ID Sanitization ---
// Handles duplicated IDs like "20253,20253" by taking the first numeric segment.
const sanitizeNumericId = (rawId) => {
  if (rawId === null || rawId === undefined) return null;

  let idStr = '';
  if (Array.isArray(rawId)) {
    idStr = String(rawId[0]);
  } else if (typeof rawId === 'string' && rawId.includes(',')) {
    idStr = rawId.split(',')[0];
  } else {
    idStr = String(rawId);
  }

  // Clean up any trailing commas or whitespace and ensure it's a native JS Number (required by mssql driver)
  const cleaned = idStr.replace(/,/g, '').trim();
  const parsed = parseInt(cleaned, 10);
  return isNaN(parsed) ? null : parsed;
};

// --- PASSWORD RESET OTP STORE --- //
const otps = new Map(); // Store: { email: { code, expires } }

// NEW: Google Drive Service Integration
const driveService = require('./google-drive-service');

// NEW: NBT Career Portal Integration (Job Listings & Applications)
const { incomingRouter, publishJobToWebsite } = require('./nbt-integration');

/**
 * Helper to upload a Multer file to Google Drive and return the link
 */
const safeUploadToDrive = async (file) => {
  if (!file) return null;
  try {
    const link = await driveService.uploadFileToDrive(file.buffer, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'), file.mimetype);
    return link;
  } catch (err) {
    console.error('[DRIVE HELPER ERROR]', err.message);
    throw err;
  }
};

// --- PERFORMANCE: Cached Pool & Shared Utilities --- //
let _pool = null;
const getPool = async () => {
  if (_pool) return _pool;
  _pool = await poolPromise;

  // Initialize Suggestions Table if not exists
  try {
    await _pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[employee_suggestions]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[employee_suggestions] (
          [id] INT IDENTITY(1,1) PRIMARY KEY,
          [employee_id] INT NOT NULL,
          [employee_name] NVARCHAR(255),
          [suggestion] NVARCHAR(MAX),
          [requirement] NVARCHAR(MAX),
          [created_at] DATETIME DEFAULT DATEADD(MINUTE, 330, GETUTCDATE()),
          FOREIGN KEY ([employee_id]) REFERENCES [users](id)
        )
      END
      ELSE
      BEGIN
        -- Migration: Add requirement column if missing
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[employee_suggestions]') AND name = 'requirement')
        BEGIN
          ALTER TABLE [dbo].[employee_suggestions] ADD [requirement] NVARCHAR(MAX);
        END
      END
    `);
    console.log('✅ Suggestions tracking system initialized.');
  } catch (err) {
    console.error('❌ Failed to initialize suggestions table:', err.message);
  }

  return _pool;
};

/**
 * Shared image normalizer (extracted from 6+ inline copies)
 */
const normalizeImage = (img) => {
  if (!img) return null;
  if (typeof img !== 'string') return img;
  if (img.startsWith('data:') || img.startsWith('http') || img.startsWith('/')) return img;
  if (img.startsWith('GgoAAAANSUhEUg')) return `data:image/png;base64,iVBORw0KGgo${img}`;
  return `data:image/png;base64,${img}`;
};

// --- ASSET DATA MAPPING HELPER ---
const mapAssetRow = (row) => {
  if (!row) return null;

  const trimVal = (val) => (val && typeof val === 'string') ? val.trim() : (val || '');
  const isYes = (val) => trimVal(val).toLowerCase() === 'yes';

  const laptop = trimVal(row.laptop_details);

  // Extract Serial Number if present in details
  let serial = row.serial_number || '';
  if (!serial && laptop) {
    const serialMatch = laptop.match(/Serial\s*(?:No|Number)?\s*:\s*([^\n\r,]+)/i);
    if (serialMatch) serial = serialMatch[1].trim();
  }

  return {
    ...row, // 1. PRESERVE ORIGINAL STRINGS ("Yes"/"No")
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    designation: row.designation,
    joiningDate: row.joining_date,
    lastWorkingDate: row.last_working_date,
    laptopDetails: laptop,
    serialNumber: serial, // Extracted or virtual
    hasMouse: (row.mouse || '').toLowerCase() === 'yes',
    hasKeyboard: (row.keyboard || '').toLowerCase() === 'yes',
    hasLaptopStand: (row.laptop_stand || '').toLowerCase() === 'yes',
    hasRufPad: (row.ruf_pad || '').toLowerCase() === 'yes',
    hasPendrive: (row.pendrive || '').toLowerCase() === 'yes',
    hasMobile: (row.mobile || '').toLowerCase() === 'yes',
    hasCamera: (row.camera || '').toLowerCase() === 'yes',
    hasEarphone: (row.earphone_headphone || '').toLowerCase() === 'yes',
    hasTablet: (row.tablet || '').toLowerCase() === 'yes',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

/**
 * Shared emoji reaction type map (extracted from 4+ inline copies)
 */
const emojiMap = {
  heart: '❤️',
  like: '👍',
  shocked: '😮',
  laugh: '😂',
  fire: '🔥',
  clap: '👏',
  cake: '🎂'
};

// Middleware
// 1. Corrected CORS (Origin: true allows credentials to sync with any incoming requester)
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'employee_id', 'employee-id', 'x-user-id'],
  credentials: true,
  maxAge: 86400 // Cache preflight results for 24 hours (86400 seconds)
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 2. High-Fidelity Request Logger (Traces Origins & Methods - Optimized with Colors)
app.use((req, res, next) => {
  const origin = req.get('origin') || 'Local/Unknown';
  Log.network(origin, req.method, req.url);
  next();
});

// Reward System Standard Metadata
const REWARD_CATEGORIES = ['Performance', 'Peer Recognition', 'Service Anniversary', 'Fun Quiz', 'Core Values', 'Other'];


// 2.5 Static Folder Serving (for uploaded images/videos)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 2.6 NBT Career Portal Webhooks (Incoming Applications)
app.use('/webhooks/nbt', incomingRouter);

// 3. Database Health Check (Diagnostic Endpoint)
app.get('/api/test-db', async (req, res) => {
  try {
    let pool = await getPool();
    if (!pool) throw new Error('Pool not initialized');
    const result = await pool.request().query('SELECT DATEADD(MINUTE, 330, GETUTCDATE()) as serverTime');
    Log.success('Database', 'Health check passed: Connection to MSSQL alive.');
    res.json({ status: 'Connected', time: result.recordset[0].serverTime, timezone: 'IST (UTC+5:30)' });
  } catch (err) {
    Log.error('Database', err.message, 'Verify DB Server and credentials in .env');
    res.status(500).json({ status: 'Error', message: err.message });
  }
});

// Routes
app.get('/', (req, res) => {
  res.send('Backend Server is running =)');
});

app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', message: 'API is functional' });
});

// --- AUTH & SECURITY MIDDLEWARE --- //
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) {
    Log.auth('Request blocked: Missing Authorization Header', 'Make sure your frontend sends "Bearer <token>"');
    return res.status(403).json({ error: 'No token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key', { clockTolerance: 300 }, (err, decoded) => {
    if (err) {
      Log.auth('Invalid or Expired Token signature', 'Your session might have timed out. Try logging in again.');
      return res.status(401).json({ error: 'Failed to authenticate token' });
    }
    req.user = decoded;
    next();
  });
};

/**
 * --- NBT Career Portal: Job Vacancy Management ---
 */
// GET: List all local job postings
app.get('/api/job-postings', verifyToken, async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        id, title, department, experience, location, 
        job_type as [type], status, requirements, description, created_at, updated_at, website_id
      FROM job_postings 
      ORDER BY created_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    Log.error('Job Postings', 'Failed to fetch jobs', err.message);
    res.status(500).json({ error: 'Failed to fetch job postings' });
  }
});

// POST: Create new job posting & sync to portal
app.post('/api/job-postings', verifyToken, async (req, res) => {
  try {
    const jobData = req.body;

    // 0. Validation for Careers Portal requirements
    if (!jobData.title || jobData.title.length < 2) {
      return res.status(400).json({ error: "Job title must be at least 2 characters." });
    }
    const dept = jobData.department || jobData.team;
    if (!dept || dept.length < 2) {
      return res.status(400).json({ error: "Department name must be at least 2 characters." });
    }
    if (!jobData.location || jobData.location.length < 2) {
      return res.status(400).json({ error: "Location must be at least 2 characters." });
    }
    const description = jobData.description || jobData.jd;
    if (!description || description.length < 10) {
      return res.status(400).json({ error: "Job description must be at least 10 characters." });
    }

    Log.success('Career Portal', `Publishing new job: ${jobData.title}`);

    const pool = await getPool();

    // 1. Save to local database
    const localResult = await pool.request()
      .input('title', sql.NVarChar, jobData.title)
      .input('dept', sql.NVarChar, jobData.department || jobData.team)
      .input('loc', sql.NVarChar, jobData.location)
      .input('type', sql.NVarChar, jobData.type || jobData.job_type || 'Full-time')
      .input('exp', sql.NVarChar, jobData.experience || jobData.experience_required || 'Not specified')
      .input('desc', sql.NVarChar, jobData.description || jobData.jd || 'No description provided')
      .input('reqs', sql.NVarChar, jobData.requirements || '')
      .input('status', sql.NVarChar, jobData.status || 'Open')
      .query(`
        INSERT INTO job_postings (title, department, location, job_type, experience, description, requirements, status, created_at, updated_at)
        OUTPUT INSERTED.id
        VALUES (@title, @dept, @loc, @type, @exp, @desc, @reqs, @status, DATEADD(MINUTE, 330, GETUTCDATE()), DATEADD(MINUTE, 330, GETUTCDATE()))
      `);

    const localJobId = localResult.recordset[0].id;
    Log.success('Career Portal', `Job saved locally with ID: ${localJobId}`);

    // 2. Sync to careers website automatically
    try {
      const websiteJob = await publishJobToWebsite({
        title: jobData.title,
        team: jobData.department || jobData.team,
        location: jobData.location,
        type: jobData.type || jobData.job_type || 'Full-time',
        experience: jobData.experience || jobData.experience_required || 'Not specified',
        description: (jobData.description || jobData.jd || 'No description provided') + (jobData.requirements ? "\n\nRequirements:\n" + jobData.requirements : ""),
        atsJobId: String(localJobId),
      });

      // 3. Update local record with website_job_id
      await pool.request()
        .input('id', sql.Int, localJobId)
        .input('webId', sql.NVarChar, String(websiteJob.id))
        .query('UPDATE job_postings SET website_id = @webId WHERE id = @id');

      res.status(201).json({ success: true, localId: localJobId, websiteJobId: websiteJob.id });
    } catch (syncErr) {
      Log.error('Career Portal', `Website sync failed but job saved locally: ${syncErr.message}`);
      res.status(201).json({ success: true, localId: localJobId, syncError: syncErr.message });
    }
  } catch (error) {
    Log.error('Career Portal', `Job creation failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// PUT: Update job posting & sync to portal
app.put('/api/job-postings/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const jobData = req.body;

  try {
    const pool = await getPool();
    const jobRes = await pool.request().input('id', sql.Int, id).query('SELECT website_id FROM job_postings WHERE id = @id');
    if (jobRes.recordset.length === 0) return res.status(404).json({ error: 'Job not found' });

    const webId = jobRes.recordset[0].website_id;

    await pool.request()
      .input('id', sql.Int, id)
      .input('title', sql.NVarChar, jobData.title)
      .input('dept', sql.NVarChar, jobData.department || jobData.team)
      .input('loc', sql.NVarChar, jobData.location)
      .input('type', sql.NVarChar, jobData.job_type || jobData.type || 'Full-time')
      .input('exp', sql.NVarChar, jobData.experience || jobData.experience_required || 'Not specified')
      .input('desc', sql.NVarChar, jobData.description || jobData.jd || 'No description provided')
      .input('reqs', sql.NVarChar, jobData.requirements || '')
      .input('status', sql.NVarChar, jobData.status || 'Open')
      .query(`
        UPDATE job_postings 
        SET title = @title, department = @dept, location = @loc, job_type = @type, 
            experience = @exp, description = @desc, requirements = @reqs, status = @status,
            updated_at = DATEADD(MINUTE, 330, GETUTCDATE())
        WHERE id = @id
      `);

    if (webId) {
      const { updateJobOnWebsite } = require('./nbt-integration');
      try {
        await updateJobOnWebsite(webId, {
          title: jobData.title,
          team: jobData.department || jobData.team,
          location: jobData.location,
          type: jobData.job_type || jobData.type || 'Full-time',
          experience: jobData.experience || jobData.experience_required || 'Not specified',
          description: (jobData.description || jobData.jd || 'No description provided') + (jobData.requirements ? "\n\nRequirements:\n" + jobData.requirements : ""),
          isActive: (jobData.status || 'Open').toLowerCase() !== 'closed'
        });
      } catch (syncErr) {
        Log.error('Career Portal', `Failed to sync update for job ${webId}: ${syncErr.message}`);
      }
    }

    res.json({ success: true, message: 'Job posting updated' });
  } catch (err) {
    Log.error('Job Postings', 'Failed to update job', err.message);
    res.status(500).json({ error: 'Failed to update job posting' });
  }
});

// DELETE: Remove job posting & sync to portal
app.delete('/api/job-postings/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getPool();

    // 1. Get the website_id first before deleting locally
    const checkRes = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT website_id FROM job_postings WHERE id = @id');

    if (checkRes.recordset.length === 0) return res.status(404).json({ error: 'Job not found' });
    const websiteId = checkRes.recordset[0].website_id;

    // 2. Delete from local database
    await pool.request().input('id', id).query('DELETE FROM job_postings WHERE id = @id');

    // 3. Sync Delete to Website
    if (websiteId) {
      const { deleteJobFromWebsite } = require('./nbt-integration');
      try {
        await deleteJobFromWebsite(websiteId);
      } catch (e) {
        Log.error('Career Portal', `Failed to delete job ${websiteId} on portal: ${e.message}`);
      }
    }

    res.json({ success: true, message: 'Vacancy deleted locally and from website' });
  } catch (error) {
    Log.error('Delete failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * --- NBT Career Portal: Job Application Management ---
 */
// GET: List all incoming job applications
app.get('/api/job-applications', verifyToken, async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        ja.*, 
        jl.title as official_job_title,
        jl.department as official_department,
        jl.job_type as official_job_type
      FROM job_applications ja
      LEFT JOIN job_postings jl ON ja.internal_job_id = jl.id
      ORDER BY ja.applied_at DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    Log.error('Job Applications', 'Failed to fetch applications', err.message);
    res.status(500).json({ error: 'Failed to fetch job applications' });
  }
});

// PUT: Update application status & sync to portal
app.put('/api/job-applications/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { status, note, statusNote } = req.body;
  const finalNote = note || statusNote || `Status changed to ${status}`;

  try {
    const pool = await getPool();
    const appRes = await pool.request().input('id', sql.Int, id).query('SELECT website_application_id FROM job_applications WHERE id = @id');
    if (appRes.recordset.length === 0) return res.status(404).json({ error: 'Application not found' });

    const webAppId = appRes.recordset[0].website_application_id;

    await pool.request()
      .input('id', sql.Int, id)
      .input('status', sql.NVarChar, status)
      .query('UPDATE job_applications SET status = @status, updated_at = DATEADD(MINUTE, 330, GETUTCDATE()) WHERE id = @id');

    if (webAppId) {
      const { pushStatusUpdate } = require('./nbt-integration');
      try {
        await pushStatusUpdate({
          websiteApplicationId: webAppId,
          status: status,
          note: finalNote
        });
      } catch (syncErr) {
        Log.error('Career Portal', `Failed to sync status to website: ${syncErr.message}`);
      }
    }

    res.json({ success: true, message: 'Status updated and synced' });
  } catch (err) {
    Log.error('Job Applications', 'Failed to update status', err.message);
    res.status(500).json({ error: 'Failed to update application status' });
  }
});





// --- AUTHENTICATION ROUTES --- //

// 1. Register User
app.post('/api/register', async (req, res) => {
  if (!req.body) {
    return res.status(400).json({ error: 'Request body is missing or malformed' });
  }
  const { name, email, password, role } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }

  const userRole = role || 'employee'; // Default to employee if no role provided

  try {
    let pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is currently offline' });
    }

    // Check if user already exists (using parameterized query to prevent SQL injection)
    const checkUser = await pool.request()
      .input('email', sql.NVarChar, email)
      .query('SELECT id FROM users WHERE email = @email');

    if (checkUser.recordset.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash the password before saving
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 0. Normalize Name to Title Case (e.g., ANISH V N -> Anish V N)
    const normalizedName = name.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Insert new user with role and capture the new ID
    const insertResult = await pool.request()
      .input('name', sql.NVarChar, normalizedName)
      .input('email', sql.NVarChar, email)
      .input('password', sql.NVarChar, hashedPassword)
      .input('role', sql.NVarChar, userRole)
      .query('INSERT INTO users (name, email, password, role) OUTPUT INSERTED.id VALUES (@name, @email, @password, @role)');

    const newUserId = insertResult.recordset[0].id;

    // Determine which internal system table to use based on the display role
    let systemTable = 'employee'; // default
    const r = userRole.toLowerCase();
    if (r.includes('lead') || r === 'teamleader') systemTable = 'teamleader';
    else if (r.includes('hr')) systemTable = 'hr';
    else if (r.includes('super')) systemTable = 'superadmin';
    else if (r.includes('project')) systemTable = 'projectmanager';

    // Insert user into their corresponding system role table
    const allowedTables = [
      'superadmin', 'hr', 'teamleader', 'employee', 'projectmanager'
    ];
    if (allowedTables.includes(systemTable)) {
      await pool.request()
        .input('userId', sql.Int, newUserId)
        .query(`INSERT INTO ${systemTable} (user_id) VALUES (@userId)`);
    }

    res.status(201).json({ message: 'User registered successfully!', userId: newUserId });

  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// 2. Login User
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    let pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is currently offline' });
    }

    // Find user by email â€” only select needed fields
    let userResult = await pool.request()
      .input('email', sql.NVarChar, email)
      .query('SELECT id, name, email, password, role, phone_number, profile_picture, about_me, team, joining_date FROM users WHERE email = @email');

    let user;
    let userType = 'employee';

    if (userResult.recordset.length === 0) {
      // 2C. FALLBACK: Check New Joinees table
      const joineeResult = await pool.request()
        .input('email', sql.NVarChar, email)
        .query('SELECT id, name, email_id, password, role FROM new_joinees WHERE email_id = @email');

      if (joineeResult.recordset.length === 0) {
        // 3D. FALLBACK: Check Interns table
        const internResult = await pool.request()
          .input('email', sql.NVarChar, email)
          .query('SELECT id, name, email, password, role FROM interns WHERE email = @email');

        if (internResult.recordset.length === 0) {
          return res.status(401).json({ error: 'Invalid email or password' });
        }

        user = internResult.recordset[0];
        userType = 'intern';
        user.role = 'Intern';
      } else {
        user = joineeResult.recordset[0];
        user.email = user.email_id; // Normalize key
        userType = 'new_joinee';
        user.role = 'new_joinee';
      }
    } else {
      user = userResult.recordset[0];
    }

    // Compare submitted password with the hashed password (or plaintext for temporary accounts)
    let isMatch = false;
    if (userType === 'new_joinee' || userType === 'intern') {
      isMatch = (password === user.password); // Joinees/Interns currently use plaintext
    } else {
      isMatch = await bcrypt.compare(password, user.password);
    }

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        employee_id: user.id,
        userType: userType
      },
      process.env.JWT_SECRET || 'fallback_secret_key',
      { expiresIn: '365d' } // Extended session timeout for seamless work experience
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        employee_id: user.id,
        userType: userType,
        phone_number: user.phone_number,
        profile_picture: user.profile_picture ? `/api/users/${user.id}/photo` : null,
        about_me: user.about_me
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// 2B. NEW JOINEE LOGIN (Dedicated path to avoid ID collision)
app.post('/api/new-joinee/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    let pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is offline' });
    }

    // Use email_id as the primary lookup for joinees
    const joineeResult = await pool.request()
      .input('email', sql.NVarChar, email)
      .query('SELECT id, name, email_id, password, role FROM new_joinees WHERE email_id = @email');

    if (joineeResult.recordset.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const joinee = joineeResult.recordset[0];

    // Check password (schema currently uses plaintext default 'Nbt@123', so direct comparison first)
    // NOTE: In production, these should also be hashed via bcrypt
    if (password !== joinee.password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token with EXPLICIT userType to prevent identity theft/collision
    const token = jwt.sign(
      {
        id: joinee.id,
        email: joinee.email_id,
        role: 'new_joinee',
        name: joinee.name,
        userType: 'new_joinee'
      },
      process.env.JWT_SECRET || 'fallback_secret_key',
      { expiresIn: '365d' } // Extended session timeout for seamless work experience
    );

    res.json({
      message: 'New Joinee Login successful',
      token,
      user: {
        id: joinee.id,
        email: joinee.email_id,
        role: 'new_joinee',
        name: joinee.name,
        userType: 'new_joinee'
      }
    });

  } catch (err) {
    console.error('Joinee login error:', err);
    res.status(500).json({ error: 'Server error during joinee login' });
  }
});

/**
 * 2.D Request Password Reset OTP
 * Generates a 6-digit code and prints it to the terminal for administrative recovery.
 */
app.post('/api/password/request-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const pool = await getPool();
    // Check both tables
    const userResult = await pool.request().input('email', sql.NVarChar, email).query('SELECT id FROM users WHERE email = @email');
    const joineeResult = await pool.request().input('email', sql.NVarChar, email).query('SELECT id FROM new_joinees WHERE email_id = @email');

    if (userResult.recordset.length === 0 && joineeResult.recordset.length === 0) {
      return res.status(404).json({ error: 'User not found in NBT system' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes

    otps.set(email, { otp, expires });

    // Premium Terminal Output
    console.log('\n' + Log.gold + Log.bold + 'â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—' + Log.reset);
    console.log(Log.gold + Log.bold + 'â•‘  ðŸ”‘  PASSWORD RESET OTP GENERATED        â•‘' + Log.reset);
    console.log(Log.gold + Log.bold + 'â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• ' + Log.reset);
    console.log(Log.gold + Log.bold + `â•‘  User : ${email.padEnd(31)}  â•‘` + Log.reset);
    console.log(Log.gold + Log.bold + `â•‘  Code : ${Log.emerald}${Log.bold}${otp}${Log.gold}${Log.bold}                           â•‘` + Log.reset);
    console.log(Log.gold + Log.bold + 'â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• \n' + Log.reset);

    res.json({ success: true, message: 'OTP generated and printed to server console.' });
  } catch (err) {
    console.error('[OTP REQUEST ERROR]:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * 2.D.1 Verify OTP (Frontend auxiliary check)
 */
app.post('/api/password/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });

  const record = otps.get(email);
  if (!record || record.otp !== otp || Date.now() > record.expires) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }

  res.json({ success: true, message: 'OTP verified successfully' });
});

/**
 * 2.E Reset Password with OTP
 */
app.post('/api/password/reset-with-otp', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) return res.status(400).json({ error: 'All fields are required' });

  const record = otps.get(email);
  if (!record || record.otp !== otp || Date.now() > record.expires) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }

  try {
    const pool = await getPool();
    const userRes = await pool.request().input('email', sql.NVarChar, email).query('SELECT id FROM users WHERE email = @email');

    if (userRes.recordset.length > 0) {
      const hashedValue = await bcrypt.hash(newPassword, 10);
      await pool.request()
        .input('pass', sql.NVarChar, hashedValue)
        .input('email', sql.NVarChar, email)
        .query('UPDATE users SET password = @pass WHERE email = @email');
    } else {
      await pool.request()
        .input('pass', sql.NVarChar, newPassword)
        .input('email', sql.NVarChar, email)
        .query('UPDATE new_joinees SET password = @pass WHERE email_id = @email');
    }

    otps.delete(email);
    Log.success('Auth', `Password successfully reset via OTP for ${email}`);
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('[OTP RESET ERROR]:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * 2.F Change Password with Old Password (Authenticated)
 */
app.post('/api/password/change-password', verifyToken, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const email = req.user.email;
  const userType = req.user.userType;

  if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Old and new passwords required' });

  try {
    const pool = await getPool();
    const table = userType === 'new_joinee' ? 'new_joinees' : 'users';
    const emailCol = userType === 'new_joinee' ? 'email_id' : 'email';

    const result = await pool.request()
      .input('email', sql.NVarChar, email)
      .query(`SELECT password FROM ${table} WHERE ${emailCol} = @email`);

    if (result.recordset.length === 0) return res.status(404).json({ error: 'User not found' });

    const currentPass = result.recordset[0].password;
    let isMatch = false;

    if (userType === 'new_joinee') {
      isMatch = (oldPassword === currentPass);
    } else {
      isMatch = await bcrypt.compare(oldPassword, currentPass);
    }

    if (!isMatch) return res.status(401).json({ error: 'Incorrect old password' });

    const finalValue = userType === 'new_joinee' ? newPassword : await bcrypt.hash(newPassword, 10);

    await pool.request()
      .input('pass', sql.NVarChar, finalValue)
      .input('email', sql.NVarChar, email)
      .query(`UPDATE ${table} SET password = @pass WHERE ${emailCol} = @email`);

    Log.success('Auth', `Password changed by user for ${email}`);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error('[CHANGE PASSWORD ERROR]:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3A. Get Reporting Manager Profile (Must securely intercept before dynamic :email wildcard)
app.get('/api/profile/manager', async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ error: 'Email query statically required' });

  try {
    let pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is currently offline' });
    }

    const empResult = await pool.request()
      .input('email', sql.NVarChar, email)
      .query('SELECT reporting_manager_id FROM users WHERE email = @email');

    if (empResult.recordset.length === 0 || !empResult.recordset[0].reporting_manager_id) {
      return res.status(404).json({ error: 'No explicitly assigned manager found in relational matrix' });
    }

    const managerId = empResult.recordset[0].reporting_manager_id;
    const mgrResult = await pool.request()
      .input('managerId', sql.Int, managerId)
      .query('SELECT id, name, email, role, phone_number, profile_picture, about_me, date_of_birth, team, joining_date FROM users WHERE id = @managerId');

    if (mgrResult.recordset.length === 0) return res.status(404).json({ error: 'Manager profile missing or deleted' });

    const m = mgrResult.recordset[0];
    res.json({
      ...m,
      phoneNumber: m.phone_number,
      profilePicture: m.profile_picture,
      aboutMe: m.about_me,
      dateOfBirth: m.date_of_birth
    });
  } catch (err) {
    console.error('Manager strictly isolated endpoint critically failed:', err);
    res.status(500).json({ error: 'Server exploded tracing management matrix' });
  }
});

// 3B. Get Subordinates (Team Synergy View)
// Support both /api/subordinates (uses authenticated user) and /api/subordinates/:userId
app.get('/api/subordinates', verifyToken, async (req, res) => {
  const userId = req.user.id;
  try {
    let pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT id, name, role, profile_picture, team FROM users WHERE reporting_manager_id = @userId');
    res.json(result.recordset);
  } catch (err) {
    console.error('Failed to fetch subordinates:', err);
    res.status(500).json({ error: 'Failed to extract team synergy matrix' });
  }
});

app.get('/api/subordinates/:userId', verifyToken, async (req, res) => {
  const userId = sanitizeNumericId(req.params.userId);
  try {
    let pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT id, name, role, profile_picture, team FROM users WHERE reporting_manager_id = @userId');
    res.json(result.recordset);
  } catch (err) {
    console.error('Failed to fetch subordinates:', err);
    res.status(500).json({ error: 'Failed to extract team synergy matrix' });
  }
});

/**
 * Helper: Synchronizes a specific team's specialized table with latest User data.
 * Handles table existence checks and multiple naming variations (jkdmart vs jkd_mart).
 */
async function syncSpecificTeamTable(pool, transaction, teamName) {
  if (!teamName) return;

  // Try variations for table names: standard, compact, then underscored
  const variations = [
    `team_${teamName.toLowerCase().replace(/\s+/g, '_').replace(/&/g, 'and')}`,
    `team_${teamName.toLowerCase().replace(/[\s_&]+/g, '')}`,
    `team_${teamName.toLowerCase().replace(/\s+/g, '_').replace(/&/g, '')}`
  ];

  for (const tableName of variations) {
    try {
      const conn = transaction || pool;
      const checkReq = new sql.Request(conn);
      const checkResult = await checkReq.query(`SELECT OBJECT_ID(N'${tableName}', N'U') AS id`);

      if (checkResult.recordset[0].id) {
        console.log(`[DEEP SYNC] Refreshing table: ${tableName} for team: ${teamName}`);

        const truncateReq = new sql.Request(conn);
        await truncateReq.query(`TRUNCATE TABLE ${tableName}`);

        const syncReq = new sql.Request(conn);
        syncReq.input('team', sql.NVarChar, teamName);
        await syncReq.query(`
          INSERT INTO ${tableName} (user_id, emp_name, designation, team_name, reporting_manager)
          SELECT u.id, u.name, u.role, u.team, m.name
          FROM users u 
          LEFT JOIN users m ON u.reporting_manager_id = m.id 
          WHERE u.team = @team
        `);
        return true; // Success
      }
    } catch (syncErr) {
      console.warn(`[DEEP SYNC] Skipping variation ${tableName} due to: ${syncErr.message}`);
    }
  }
  return false;
}

/**
 * [POST] /api/hierarchy/sync-all
 * Force refresh all specialized team tables from the core Users directory.
 */
app.post('/api/hierarchy/sync-all', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  if (!role.includes('admin') && !role.includes('hr')) {
    return res.status(403).json({ error: 'Unauthorized: Global sync requires Admin/HR privileges' });
  }

  try {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Get all unique team names currently assigned to users
      const teamsResult = await pool.request().query('SELECT DISTINCT team FROM users WHERE team IS NOT NULL AND team != \'\'');
      const teams = teamsResult.recordset.map(r => r.team);

      console.log(`[GLOBAL SYNC] Initiating refresh for ${teams.length} teams...`);

      for (const teamName of teams) {
        await syncSpecificTeamTable(pool, transaction, teamName);
      }

      await transaction.commit();
      res.json({ success: true, message: `Successfully synchronized ${teams.length} team tables.` });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Global Sync Failed:', err);
    res.status(500).json({ error: 'Failed to synchronize organization tables' });
  }
});

/**
 * 3C. Hierarchy Realignment (Drag and Drop Support)
 * Allows Managers/Admin to reassign reporting lines and update teams.
 */
app.post('/api/hierarchy/realign', verifyToken, async (req, res) => {
  const { alignments } = req.body;

  if (!alignments || !Array.isArray(alignments)) {
    return res.status(400).json({ error: 'Invalid Payload: "alignments" array is required' });
  }

  const role = (req.user.role || '').toLowerCase();
  const isAdminOrHR = role.includes('admin') || role.includes('hr') || role.includes('manager') || role.includes('lead');

  if (!isAdminOrHR) {
    return res.status(403).json({ error: 'Unauthorized: Only Managers or HR can realign hierarchy' });
  }

  try {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. Optimization: Fetch name->id map for all users to avoid heavy looping
      const allUsersResult = await pool.request().query('SELECT id, name, role FROM users');
      const nameToIdMap = {};
      allUsersResult.recordset.forEach(u => {
        if (u.name) {
          const cleanName = u.name.trim();
          nameToIdMap[cleanName] = u.id;
          nameToIdMap[cleanName.toLowerCase()] = u.id;
        }
      });

      // 1.5 Extract Key Personnel IDs (Dynamic Lookup)
      let CEO_ID = 20250;
      let PM_ID = 20251;

      allUsersResult.recordset.forEach(u => {
        const role = (u.role || '').toLowerCase();
        if (role.includes('ceo')) CEO_ID = u.id;
        if (role.includes('project manager')) PM_ID = u.id;
      });

      console.log(`[BULK HIERARCHY] Processing ${alignments.length} teams. Org Baseline: CEO(${CEO_ID}), PM(${PM_ID})`);

      // 2. Pass 1: Update the primary 'users' table
      for (const team of alignments) {
        const leadName = (team.lead || '').trim();
        const pmName = (team.manager || team.project_manager || team.pm || '').trim();
        const teamName = team.team_name || team.team_id;

        let leadId = nameToIdMap[leadName] || nameToIdMap[leadName.toLowerCase()] || null;
        let pmId = nameToIdMap[pmName] || nameToIdMap[pmName.toLowerCase()] || PM_ID;

        // A. Update Team Lead's Reporting Manager (Lead -> PM)
        if (leadId) {
          const leadUpdateReq = new sql.Request(transaction);
          leadUpdateReq.input('leadId', sql.Int, leadId);
          leadUpdateReq.input('pmId', sql.Int, pmId);
          leadUpdateReq.input('teamName', sql.NVarChar, teamName);
          await leadUpdateReq.query(`
            UPDATE users 
            SET reporting_manager_id = @pmId, 
                team = @teamName 
            WHERE id = @leadId
          `);
        }

        // B. Update Members' Reporting Manager (Member -> Lead)
        if (team.members && Array.isArray(team.members)) {
          for (const member of team.members) {
            const memberName = (member.name || '').trim();
            let memberId = nameToIdMap[memberName] || nameToIdMap[memberName.toLowerCase()];

            if (memberId && memberId !== leadId) {
              const userReq = new sql.Request(transaction);
              userReq.input('memberId', sql.Int, memberId);
              userReq.input('leadId', sql.Int, leadId);
              userReq.input('teamName', sql.NVarChar, teamName);
              await userReq.query('UPDATE users SET reporting_manager_id = @leadId, team = @teamName WHERE id = @memberId');
            }
          }
        }
      }
      // C. Pass 1.5: Enforce CEO Reporting for PM and HR (Top Level)
      const topLevelReq = new sql.Request(transaction);
      topLevelReq.input('ceoId', sql.Int, CEO_ID);
      await topLevelReq.query(`
        UPDATE users 
        SET reporting_manager_id = @ceoId 
        WHERE (role LIKE '%Project Manager%' OR role LIKE '%HR%') 
        AND id <> @ceoId
      `);

      await transaction.commit();
      console.log('[BULK HIERARCHY] Pass 1: Users updated successfully.');

      // 3. Pass 2: Global Deep Sync (OUTSIDE transaction to avoid locks/timeouts)
      // We do this after commit so the 'users' table is clean and locks are released.
      console.log('[BULK HIERARCHY] Initiating global team sync to prevent duplicates...');
      try {
        const allTeamsResult = await pool.request().query("SELECT DISTINCT team FROM users WHERE team IS NOT NULL AND team != ''");
        for (const row of allTeamsResult.recordset) {
          if (row.team) {
            // We pass 'null' for transaction so it runs on the main pool
            await syncSpecificTeamTable(pool, null, row.team);
          }
        }
      } catch (syncError) {
        console.error('[BULK HIERARCHY] Post-Commit Global Sync Warning:', syncError.message);
        // We don't fail the whole request since Pass 1 succeeded
      }

      console.log('[BULK HIERARCHY] Success: Organization alignments persisted to DB.');
      res.json({ success: true, message: 'Organization realignment saved successfully' });
    } catch (err) {
      if (transaction) await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Bulk Hierarchy Realignment Failed:', err);
    res.status(500).json({ error: 'Failed to save organizational structure' });
  }
});

/**
 * 43. Submit Employee Suggestion
 */
app.post('/api/suggestions', verifyToken, async (req, res) => {
  const suggestionText = req.body.content || req.body.suggestion || req.body.message;
  const requirementText = req.body.requirement || '';
  const userId = req.user.id;
  const userName = req.user.name;

  if (!suggestionText) {
    return res.status(400).json({ error: 'Suggestion content is required.' });
  }

  try {
    const pool = await getPool();
    await pool.request()
      .input('empId', sql.Int, userId)
      .input('name', sql.NVarChar, userName)
      .input('suggestion', sql.NVarChar, suggestionText)
      .input('requirement', sql.NVarChar, requirementText)
      .query(`
        INSERT INTO employee_suggestions (employee_id, employee_name, suggestion, requirement)
        VALUES (@empId, @name, @suggestion, @requirement)
      `);

    Log.success('Suggestions', `New suggestion submitted by ${userName}`);
    res.json({ success: true, message: 'Thank you for your valuable suggestion!' });
  } catch (err) {
    Log.error('Suggestions', 'Submission failed', err.message);
    res.status(500).json({ error: 'Failed to save suggestion' });
  }
});

// 3. Get User Profile Data (Supports Path and Query Parameters)
app.get('/api/profile', async (req, res) => {
  const email = req.query.email || req.query.id;
  if (!email) return res.status(400).json({ error: 'Email or ID is required in query params' });
  req.params.email = email;
  return handleProfileGet(req, res);
});

app.get('/api/profile/:email', async (req, res) => {
  return handleProfileGet(req, res);
});

const handleProfileGet = async (req, res) => {
  try {
    let pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is currently offline' });
    }
    const identifier = req.params.email;
    const isNumeric = !isNaN(parseInt(identifier));

    const result = await pool.request()
      .input('identifier', sql.NVarChar, identifier)
      .query(`
        SELECT u.id as user_id, u.name, u.email, u.role, u.id AS employee_id, 
               u.phone_number, u.profile_picture, u.about_me, 
               u.date_of_birth, u.team, u.reporting_manager_id, u.joining_date,
               m.name AS reporting_manager_name,
               a.*,
               p.*
        FROM users u
        LEFT JOIN users m ON u.reporting_manager_id = m.id
        LEFT JOIN assets a ON CAST(u.id AS NVARCHAR) = a.employee_id
        LEFT JOIN employee_profiles p ON u.id = p.employee_id
        WHERE u.email = @identifier OR CAST(u.id AS NVARCHAR) = @identifier
      `);

    if (result.recordset.length === 0) {
      // 3C. FALLBACK: Check New Joinees table if not in core Users
      const joineeResult = await pool.request()
        .input('identifier', sql.NVarChar, identifier)
        .query('SELECT id, name, email_id, role FROM new_joinees WHERE email_id = @identifier OR CAST(id AS NVARCHAR) = @identifier');

      if (joineeResult.recordset.length === 0) {
        // Final fallback: Check Interns
        const internResult = await pool.request()
          .input('identifier', sql.NVarChar, identifier)
          .query('SELECT id, name, email, role FROM interns WHERE email = @identifier OR CAST(id AS NVARCHAR) = @identifier');

        if (internResult.recordset.length === 0) {
          return res.status(404).json({ error: 'User not found in any directory' });
        }

        const intern = internResult.recordset[0];
        return res.json({ ...intern, employee_id: intern.id, userType: 'intern' });
      }

      const nj = joineeResult.recordset[0];
      return res.json({
        id: nj.id,
        name: nj.name,
        email: nj.email_id,
        role: 'new_joinee',
        userType: 'new_joinee',
        employee_id: nj.id,
        team: 'Onboarding',
        aboutMe: 'New Joinee - Profile Pending'
      });
    }

    // Map them clearly back assuming React uses camelCase natively!
    const userRow = result.recordset[0];

    // Normalize Asset Data using the shared helper
    const assetData = mapAssetRow(userRow);

    // Prioritize the full role title over any truncated designation strings
    const finalDesignation = userRow.role || userRow.designation;

    res.json({
      ...userRow,
      id: userRow.user_id,
      designation: finalDesignation,
      phoneNumber: userRow.phone_number,
      profilePicture: userRow.profile_picture,
      aboutMe: userRow.about_me,
      dateOfBirth: userRow.date_of_birth,
      reportingManager: userRow.reporting_manager_name,
      assets: assetData
    });

  } catch (err) {
    console.error('Profile fetch error:', err);
    res.status(500).json({ error: 'Server error while fetching profile' });
  }
};

/**
 * Helper: Resolve team name to its specific database table
 */
const getTeamTableName = (teamName) => {
  if (!teamName) return null;
  // Rule: team_ + lowercase + spaces/special chars to underscore
  const sanitized = teamName.toLowerCase()
    .replace(/&/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/__+/g, '_')
    .replace(/(^_|_$)/g, '');
  return `team_${sanitized}`;
};

// 4. Update User Profile Data (Supports multipart/form-data for base64 image uploads)
app.put('/api/profile/update', verifyToken, memoryUpload.single('profilePicture'), async (req, res) => {
  const email = req.body.email || req.query.email || req.user.email; // Fallback to token email

  // Universally map standard JS camelCase fields to our SQL targets
  const phoneNumber = req.body.phoneNumber !== undefined ? req.body.phoneNumber : (req.body.phone_number !== undefined ? req.body.phone_number : req.body.phone);

  // Handle profile picture - check req.file first (multipart support)
  let profilePicture = req.body.profileImage !== undefined ? req.body.profileImage : (req.body.profilePicture !== undefined ? req.body.profilePicture : req.body.profile_picture);
  if (req.file) {
    const base64Image = req.file.buffer.toString('base64');
    profilePicture = `data:${req.file.mimetype};base64,${base64Image}`;
  }

  const aboutMe = req.body.aboutMe !== undefined ? req.body.aboutMe : req.body.about_me;
  const dateOfBirth = req.body.dateOfBirth !== undefined ? req.body.dateOfBirth : (req.body.date_of_birth !== undefined ? req.body.date_of_birth : req.body.dob);
  const team = req.body.team;
  const reportingManagerId = req.body.reportingManager !== undefined ? req.body.reportingManager : (req.body.reportingManagerId !== undefined ? req.body.reportingManagerId : req.body.reporting_manager_id);

  if (!email) {
    console.warn('[PROFILE UPDATE] Failed: Missing email in payload and token');
    return res.status(400).json({ error: 'Email is uniquely required (provide in body or query, or ensure valid JWT token)' });
  }

  try {
    let pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is currently offline' });
    }
    let updateQuery = 'UPDATE users SET ';
    const fieldsToUpdate = [];

    // Dynamically check injected update payload elements
    if (req.body.name !== undefined) fieldsToUpdate.push('name = @name');
    if (phoneNumber !== undefined) fieldsToUpdate.push('phone_number = @phone_number');
    if (profilePicture !== undefined) fieldsToUpdate.push('profile_picture = @profile_picture');
    if (aboutMe !== undefined) fieldsToUpdate.push('about_me = @about_me');
    if (dateOfBirth !== undefined) fieldsToUpdate.push('date_of_birth = @date_of_birth');
    if (team !== undefined) fieldsToUpdate.push('team = @team');
    if (reportingManagerId !== undefined) fieldsToUpdate.push('reporting_manager_id = @reporting_manager_id');

    if (fieldsToUpdate.length === 0) {
      console.warn('[PROFILE UPDATE] 400 ERROR: No recognizable fields in request body');
      return res.status(400).json({ error: 'No recognizable fields to update. Please check your JSON keys.', receivedKeys: Object.keys(req.body) });
    }

    updateQuery += fieldsToUpdate.join(', ') + ' WHERE email = @email';

    // 0. Normalize Name to Title Case if provided
    let finalName = req.body.name;
    if (finalName) {
      finalName = finalName.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    // Execute safe mapped update into the DB Core with dynamic parameters
    const request = pool.request().input('email', sql.NVarChar, email);
    if (finalName !== undefined) request.input('name', sql.NVarChar, finalName);
    if (phoneNumber !== undefined) request.input('phone_number', sql.NVarChar, phoneNumber);

    // CRITICAL: Use sql.MAX for profile picture strings to avoid truncation/errors
    if (profilePicture !== undefined) request.input('profile_picture', sql.NVarChar(sql.MAX), profilePicture);
    if (aboutMe !== undefined) request.input('about_me', sql.NVarChar(sql.MAX), aboutMe);

    if (dateOfBirth !== undefined) request.input('date_of_birth', sql.NVarChar, dateOfBirth);
    if (team !== undefined) request.input('team', sql.NVarChar, team);
    if (reportingManagerId !== undefined) request.input('reporting_manager_id', sql.Int, reportingManagerId);

    // --- CASCADING TEAM UPDATE LOGIC --- //
    if (team !== undefined) {
      console.log(`[CASCADE] Initiating team migration for ${email} to "${team}"`);
      const transaction = new sql.Transaction(pool);
      await transaction.begin();

      try {
        const tRequest = new sql.Request(transaction);
        tRequest.input('email', sql.NVarChar, email);
        tRequest.input('newTeam', sql.NVarChar, team);

        // 1. Fetch current user state (Primary ID and Old Team)
        const userState = await tRequest.query('SELECT id, team FROM users WHERE email = @email');
        if (userState.recordset.length > 0) {
          const userId = userState.recordset[0].id;
          const oldTeam = userState.recordset[0].team;
          tRequest.input('userId', sql.Int, userId);

          if (oldTeam !== team) {
            console.log(`[CASCADE] User ${userId} moving: ${oldTeam} -> ${team}`);

            // A. Update Users (Main Record)
            await tRequest.query(updateQuery);

            // B. Update Historical Records
            await tRequest.query('UPDATE leaves SET team = @newTeam WHERE employee_id = @userId');
            await tRequest.query('UPDATE task_updates SET team = @newTeam WHERE user_id = @userId');

            // C. Update Role-Specific Tables
            const roleTables = ['employee', 'projectmanager', 'teamleader', 'hr', 'superadmin'];
            for (const rTable of roleTables) {
              await tRequest.query(`UPDATE ${rTable} SET team_name = @newTeam WHERE user_id = @userId`);
            }

            // D. Cross-Table Migration (Bucket Tables)
            const oldTable = getTeamTableName(oldTeam);
            const newTable = getTeamTableName(team);

            if (oldTable) {
              await tRequest.query(`DELETE FROM ${oldTable} WHERE user_id = @userId`);
            }

            if (newTable) {
              // Try to insert into new table by fetching role data (Designation, etc.)
              const metaResult = await tRequest.query('SELECT emp_name, designation, emp_id FROM employee WHERE user_id = @userId');
              if (metaResult.recordset.length > 0) {
                const meta = metaResult.recordset[0];
                const insRequest = new sql.Request(transaction);
                insRequest.input('uid', sql.Int, userId);
                insRequest.input('name', sql.NVarChar, meta.emp_name);
                insRequest.input('desig', sql.NVarChar, meta.designation);
                insRequest.input('eid', sql.Int, meta.emp_id);
                insRequest.input('tname', sql.NVarChar, team);

                // Use a dynamic query for the table name, safely constructed via helper
                await insRequest.query(`
                  IF NOT EXISTS (SELECT 1 FROM ${newTable} WHERE user_id = @uid)
                  INSERT INTO ${newTable} (user_id, emp_name, designation, emp_id, team_name)
                  VALUES (@uid, @name, @desig, @eid, @tname)
                `);
              }
            }
          } else {
            // Team hasn't actually changed, just perform standard profile update
            await tRequest.query(updateQuery);
          }
        }
        await transaction.commit();
        console.log(`[CASCADE] Successfully completed migration for ${email}`);
      } catch (err) {
        await transaction.rollback();
        console.error('[CASCADE ERROR]: Migration failed, rolled back.', err);
        throw err;
      }
    } else {
      // Standard update (No team change)
      await request.query(updateQuery);
    }

    res.json({ message: 'Profile payload saved structurally to MS SQL database' });
  } catch (err) {
    console.error('[CRITICAL PROFILE UPDATE ERROR]:', err);
    res.status(500).json({ error: 'Backend integrity failed over update', details: err.message });
  }
});

// 4B. Get Profile Picture as Binary Image (Diagnostic & Direct Loading)
app.get('/api/profile/picture/:email', async (req, res) => {
  const { email } = req.params;
  try {
    let pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is currently offline' });
    }

    let result = await pool.request()
      .input('email', sql.NVarChar, email)
      .query('SELECT profile_picture FROM users WHERE email = @email');

    if (result.recordset.length === 0 || !result.recordset[0].profile_picture) {
      result = await pool.request()
        .input('email', sql.NVarChar, email)
        .query('SELECT profile_picture FROM interns WHERE email = @email');
    }

    if (result.recordset.length === 0 || !result.recordset[0].profile_picture) {
      result = await pool.request()
        .input('email', sql.NVarChar, email)
        .query('SELECT profile_picture FROM new_joinees WHERE email_id = @email');
    }

    if (result.recordset.length === 0 || !result.recordset[0].profile_picture) {
      // Return 200 with null instead of 404 to avoid frontend fetch/broken image breakage
      return res.json({ profile_picture: null, message: 'No profile picture available' });
    }

    const picData = result.recordset[0].profile_picture;

    // Check if it's a valid Data URI (data:image/png;base64,...)
    if (picData.startsWith('data:image')) {
      const parts = picData.split(',');
      const mime = parts[0].split(':')[1].split(';')[0];
      const base64Data = parts[1];
      const buffer = Buffer.from(base64Data, 'base64');

      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);
    } else {
      // Fallback for raw base64 without prefix (assume PNG)
      const buffer = Buffer.from(picData, 'base64');
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);
    }
  } catch (err) {
    console.error('Failed to serve profile picture binary:', err);
    res.status(500).json({ error: 'Failed to extract binary image data' });
  }
});

// 4B. High-Performance Photo Service by User ID (Lazy Loading for Feed)
app.get('/api/users/:id/photo', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getPool();
    let result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT profile_picture FROM users WHERE id = @id');

    if (result.recordset.length === 0 || !result.recordset[0].profile_picture) {
      result = await pool.request()
        .input('id', sql.Int, id)
        .query('SELECT profile_picture FROM interns WHERE id = @id');
    }

    if (result.recordset.length === 0 || !result.recordset[0].profile_picture) {
      result = await pool.request()
        .input('id', sql.Int, id)
        .query('SELECT profile_picture FROM new_joinees WHERE id = @id');
    }

    if (result.recordset.length === 0 || !result.recordset[0].profile_picture) {
      return res.status(404).send('Not Found');
    }

    const picData = result.recordset[0].profile_picture;
    if (picData.startsWith('data:image')) {
      const parts = picData.split(',');
      const mime = parts[0].split(':')[1].split(';')[0];
      const buffer = Buffer.from(parts[1], 'base64');
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      return res.send(buffer);
    } else {
      const buffer = Buffer.from(picData, 'base64');
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      return res.send(buffer);
    }
  } catch (err) {
    res.status(500).send('Error');
  }
});

// 4C. High-Performance Thread Media Service (Lazy Loading for Feed)
app.get('/api/threads/:id/media', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT media_url, media_type FROM threads WHERE id = @id');

    if (result.recordset.length === 0 || !result.recordset[0].media_url) {
      return res.status(404).send('Not Found');
    }

    const { media_url, media_type } = result.recordset[0];
    const picData = media_url;
    let contentType = media_type === 'video' ? 'video/mp4' : 'image/png';

    if (picData.startsWith('data:')) {
      const parts = picData.split(',');
      contentType = parts[0].split(':')[1].split(';')[0];
      const buffer = Buffer.from(parts[1], 'base64');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(buffer);
    } else {
      const buffer = Buffer.from(picData, 'base64');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(buffer);
    }
  } catch (err) {
    res.status(500).send('Error');
  }
});

// 4C. Dedicated Profile Picture Upload (Handles 404 for /api/profile/upload-image)
app.post('/api/profile/upload-image', memoryUpload.any(), async (req, res) => {
  let { userId, email, employee_id, id } = req.body;

  // Handle "undefined" or "null" strings that can come from FormData
  if (userId === 'undefined' || userId === 'null') userId = null;
  if (email === 'undefined' || email === 'null') email = null;
  if (employee_id === 'undefined' || employee_id === 'null') employee_id = null;
  if (id === 'undefined' || id === 'null') id = null;

  const targetId = userId || employee_id || id;
  const targetEmail = email;

  console.log(`[PROFILE UPLOAD] Upload attempt for ${targetEmail || targetId || 'Unknown'}`);

  if (!targetId && !targetEmail) {
    return res.status(400).json({ error: 'User identifier or Email is required for image synchronization' });
  }

  const file = req.files && req.files.length > 0 ? req.files[0] : null;

  if (!file) {
    return res.status(400).json({ error: 'No image file provided in the form data' });
  }

  // Convert image to base64 Data URI
  const base64Image = file.buffer.toString('base64');
  const imageUrl = `data:${file.mimetype};base64,${base64Image}`;

  try {
    const pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is offline' });
    }

    const request = pool.request();
    request.input('targetId', sql.NVarChar, String(targetId || ''));
    request.input('targetEmail', sql.NVarChar, targetEmail || '');
    request.input('profilePicture', sql.NVarChar(sql.MAX), imageUrl);

    let rowsAffected = 0;

    // Update users table
    const r1 = await request.query(`
      UPDATE users 
      SET profile_picture = @profilePicture 
      WHERE (CAST(id AS NVARCHAR) = @targetId AND @targetId != '') 
         OR (email = @targetEmail AND @targetEmail != '')
    `);
    rowsAffected += r1.rowsAffected[0] || 0;

    // Update interns table
    const r2 = await request.query(`
      UPDATE interns 
      SET profile_picture = @profilePicture 
      WHERE (CAST(id AS NVARCHAR) = @targetId AND @targetId != '') 
         OR (email = @targetEmail AND @targetEmail != '')
    `);
    rowsAffected += r2.rowsAffected[0] || 0;

    // Update new_joinees table
    const r3 = await request.query(`
      UPDATE new_joinees 
      SET profile_picture = @profilePicture 
      WHERE (CAST(id AS NVARCHAR) = @targetId AND @targetId != '') 
         OR (email_id = @targetEmail AND @targetEmail != '')
    `);
    rowsAffected += r3.rowsAffected[0] || 0;

    if (rowsAffected === 0) {
      console.log(`[PROFILE UPLOAD] Warning: No user found for ${targetEmail || targetId}`);
      return res.status(404).json({ error: 'User not found to update profile picture' });
    }

    console.log(`[PROFILE UPLOAD] Success: Profile updated for ${targetEmail || targetId} with base64 data`);

    const returnUrl = targetId 
        ? `/api/users/${targetId}/photo?t=${Date.now()}` 
        : `/api/profile/picture/${targetEmail}?t=${Date.now()}`;

    res.json({
      message: 'Upload successful',
      profileImage: returnUrl,
      profile_picture: returnUrl
    });
  } catch (err) {
    console.error('[PROFILE UPLOAD ERROR]:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

/**
 * 4D. Direct Profile Picture Update (JSON-based)
 */
app.post('/api/profile/upload-direct', verifyToken, async (req, res) => {
  if (!req.body) {
    return res.status(400).json({ error: 'Request body is missing. Please ensure Content-Type is application/json.' });
  }
  const { userId, email, employee_id, id, profilePicture } = req.body;
  const identifier = userId || employee_id || id || email || (req.user ? req.user.id : null);
  const picData = profilePicture || req.body.profileImage || req.body.image;

  if (!identifier || !picData) {
    return res.status(400).json({ error: 'User identifier and profilePicture data are required' });
  }

  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('id', sql.NVarChar, String(identifier));
    request.input('pic', sql.NVarChar(sql.MAX), picData);

    let rowsAffected = 0;

    const r1 = await request.query(`
      UPDATE users 
      SET profile_picture = @pic 
      WHERE CAST(id AS NVARCHAR) = @id OR email = @id
    `);
    rowsAffected += r1.rowsAffected[0] || 0;

    const r2 = await request.query(`
      UPDATE interns 
      SET profile_picture = @pic 
      WHERE CAST(id AS NVARCHAR) = @id OR email = @id
    `);
    rowsAffected += r2.rowsAffected[0] || 0;

    const r3 = await request.query(`
      UPDATE new_joinees 
      SET profile_picture = @pic 
      WHERE CAST(id AS NVARCHAR) = @id OR email_id = @id
    `);
    rowsAffected += r3.rowsAffected[0] || 0;

    if (rowsAffected === 0) {
      return res.status(404).json({ error: 'User not found to update profile picture' });
    }

    Log.success('Profile', `Direct picture update successful for ${identifier}`);
    res.json({ success: true, message: 'Profile picture updated directly in users/interns table.' });
  } catch (err) {
    res.status(500).json({ error: 'Direct upload failed', details: err.message });
  }
});

// 4E. Dedicated Manager Profile Picture Upload API
app.post('/api/managers/upload-image', verifyToken, memoryUpload.any(), async (req, res) => {
  let { managerId, email } = req.body;
  if (managerId === 'undefined' || managerId === 'null') managerId = null;

  const targetId = managerId || req.body.id || req.body.employee_id || req.body.userId;
  const targetEmail = email || req.body.email_id;

  if (!targetId && !targetEmail) {
    return res.status(400).json({ error: 'Manager ID or Email is required' });
  }

  const file = req.files && req.files.length > 0 ? req.files[0] : null;

  if (!file) {
    return res.status(400).json({ error: 'No image file provided in the form data' });
  }

  const base64Image = file.buffer.toString('base64');
  const imageUrl = `data:${file.mimetype};base64,${base64Image}`;

  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('targetId', sql.NVarChar, String(targetId || ''));
    request.input('targetEmail', sql.NVarChar, email || '');
    request.input('profilePicture', sql.NVarChar(sql.MAX), imageUrl);

    // Specifically target the users table where the managers reside
    const result = await request.query(`
      UPDATE users 
      SET profile_picture = @profilePicture 
      WHERE (CAST(id AS NVARCHAR) = @targetId AND @targetId != '') 
         OR (email = @targetEmail AND @targetEmail != '')
    `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Manager not found in the users table or unauthorized role.' });
    }

    Log.success('Manager Profile', `Profile picture updated for manager ${targetEmail || targetId}`);
    const returnUrl = targetId 
        ? `/api/users/${targetId}/photo?t=${Date.now()}` 
        : `/api/profile/picture/${targetEmail}?t=${Date.now()}`;

    res.json({
      success: true,
      message: 'Manager profile picture updated successfully',
      profile_picture: returnUrl,
      profileImage: returnUrl
    });
  } catch (err) {
    Log.error('Manager Profile', err.message);
    res.status(500).json({ error: 'Failed to update manager profile picture', details: err.message });
  }
});

/**
 * 4E. Dedicated Document Upload (Handles Onboarding Docs)
 */
app.post(['/api/profile/upload-doc', '/api/profile/upload-document'], verifyToken, memoryUpload.single('file'), async (req, res) => {
  const { userId, docType } = req.body;
  let fileData = req.body.fileData || req.body.base64;

  if (req.file) {
    const base64 = req.file.buffer.toString('base64');
    fileData = `data:${req.file.mimetype};base64,${base64}`;
  }

  if (!userId || !docType || !fileData) {
    return res.status(400).json({ error: 'userId, docType, and fileData are required.' });
  }

  // Map user-friendly names to DB columns
  const columnMap = {
    'pancard': 'pancard_photo',
    'aadhar': 'adharcard_photo',
    'experience': 'experience_letter_photo',
    'pan_card': 'pancard_photo',
    'aadhar_card': 'adharcard_photo'
  };

  const dbColumn = columnMap[docType.toLowerCase()] || docType;

  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('empId', sql.Int, userId);
    request.input('data', sql.NVarChar(sql.MAX), fileData);

    const result = await request.query(`
      IF EXISTS (SELECT 1 FROM employee_profiles WHERE employee_id = @empId)
      BEGIN
        UPDATE employee_profiles SET ${dbColumn} = @data, updated_at = GETDATE() WHERE employee_id = @empId
      END
      ELSE
      BEGIN
        INSERT INTO employee_profiles (employee_id, ${dbColumn}, updated_at) VALUES (@empId, @data, GETDATE())
      END
    `);

    Log.success('Profile', `Document (${docType}) uploaded for user ${userId}`);
    res.json({ success: true, message: `${docType} uploaded successfully.` });
  } catch (err) {
    console.error('[DOC UPLOAD ERROR]:', err);
    res.status(500).json({ error: 'Failed to upload document', details: err.message });
  }
});

// --- 4D. Real-Time Project Sprint Tracking (Team Leader Social/Dashboard) --- //

// GET: Fetch the latest real-time sprint progress for the manager
app.get('/api/sprint-updates/:managerId', async (req, res) => {
  const { managerId } = req.params;
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('managerId', sql.Int, managerId)
      .query(`
        SELECT TOP 1 
          title AS project_name, status AS sprint_status, progress AS progress_percentage, updated_at
        FROM master_tasks WITH (NOLOCK)
        WHERE assignee_id = @managerId AND type = 'SPRINT'
        ORDER BY updated_at DESC
      `);

    res.json(result.recordset[0] || { sprint_status: 'Pending', progress_percentage: 0 });
  } catch (err) {
    console.error('[SPRINT FETCH ERROR]:', err);
    res.status(500).json({ error: 'Failed to fetch sprint progress', details: err.message });
  }
});

// POST: Update the sprint status and progress in real time (UPSERT)
app.post('/api/sprint-updates', async (req, res) => {
  const { projectName, teamLeaderId, sprintStatus, progressPercentage } = req.body;

  if (!projectName || !teamLeaderId) {
    return res.status(400).json({ error: 'projectName and teamLeaderId are required' });
  }

  try {
    const pool = await getPool();
    const request = pool.request();
    const cleanProjectName = String(projectName).trim();
    const cleanLeaderId = parseInt(teamLeaderId);

    request.input('projectName', sql.NVarChar, cleanProjectName);
    request.input('teamLeaderId', sql.Int, cleanLeaderId);
    request.input('sprintStatus', sql.NVarChar, sprintStatus || 'Pending');
    request.input('progressPercentage', sql.Int, progressPercentage || 0);

    // MS SQL MERGE (UPSERT) logic in Master Tasks
    // Robust Matching Logic: Case-insensitive and Whitespace-tolerant
    await request.query(`
      MERGE INTO master_tasks AS target
      USING (SELECT @projectName AS src_title, @teamLeaderId AS src_assignee) AS source
      ON (UPPER(LTRIM(RTRIM(target.title))) = UPPER(LTRIM(RTRIM(source.src_title))))
      WHEN MATCHED THEN
        UPDATE SET 
          status = @sprintStatus,
          progress = @progressPercentage,
          updated_at = DATEADD(MINUTE, 330, GETUTCDATE())
      WHEN NOT MATCHED THEN
        INSERT (type, title, assignee_id, status, progress, owner_id, updated_at)
        VALUES ('TASK', source.src_title, source.src_assignee, @sprintStatus, @progressPercentage, 202501, DATEADD(MINUTE, 330, GETUTCDATE()));
    `);

    res.json({ success: true, message: 'Sprint progress updated successfully' });
  } catch (err) {
    console.error('[SPRINT UPDATE ERROR]:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

// GET: Fetch real-time sprint progress for ALL subordinates of a manager
app.get('/api/manager/sprint-updates/:managerId', async (req, res) => {
  const { managerId } = req.params;
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('managerId', sql.Int, managerId)
      .query(`
                SELECT 
                    mt.id, mt.title as project_name, mt.status as sprint_status, 
                    mt.progress as progress_percentage, mt.updated_at,
                    u.name AS team_leader_name,
                    u.role AS team_leader_role,
                    u.profile_picture AS team_leader_picture
                FROM master_tasks mt WITH (NOLOCK)
                JOIN users u WITH (NOLOCK) ON mt.assignee_id = u.id
                WHERE u.reporting_manager_id = @managerId AND mt.type = 'SPRINT'
                ORDER BY mt.updated_at DESC
            `);

    res.json(result.recordset);
  } catch (err) {
    console.error('[MANAGER SPRINT FETCH ERROR]:', err);
    res.status(500).json({ error: 'Failed to fetch subordinate sprint progress', details: err.message });
  }
});

// GET: Unified Sprint Progress API with multiple filters
app.get('/api/sprints/progress', async (req, res) => {
  const { managerId, team, projectName } = req.query;
  try {
    const pool = await getPool();
    const request = pool.request();
    let query = `
      SELECT 
        mt.id, mt.title as projectTitle, mt.status as sprintStatus, 
        mt.progress as progress, mt.updated_at as lastUpdated,
        u.name as teamLeader, u.team as team, u.role as leaderRole
      FROM master_tasks mt WITH (NOLOCK)
      JOIN users u WITH (NOLOCK) ON mt.assignee_id = u.id
      WHERE mt.type = 'SPRINT'
    `;

    if (managerId) {
      query += ' AND (u.reporting_manager_id = @managerId OR u.id = @managerId) ';
      request.input('managerId', sql.Int, managerId);
    }
    if (team) {
      query += ' AND u.team = @team ';
      request.input('team', sql.NVarChar, team);
    }
    if (projectName) {
      query += ' AND mt.title LIKE @projectName ';
      request.input('projectName', sql.NVarChar, `%${projectName}%`);
    }

    query += ' ORDER BY mt.updated_at DESC ';
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error('[UNIFIED SPRINT FETCH ERROR]:', err);
    res.status(500).json({ error: 'Failed to extract organizational sprint progress' });
  }
});

// 5. Explicitly Isolated "About Status" Endpoint
app.put('/api/profile/about', async (req, res) => {
  return handleAboutUpdate(req, res);
});

app.post('/api/profile/about', async (req, res) => {
  return handleAboutUpdate(req, res);
});

const handleAboutUpdate = async (req, res) => {
  const { email, aboutStatus, aboutMe, about_me } = req.body;
  // Intelligently fallback against any frontend variable naming structures you throw at it
  const finalStatusText = aboutStatus !== undefined ? aboutStatus : (aboutMe !== undefined ? aboutMe : about_me);

  if (!email) return res.status(400).json({ error: 'Email structurally required to lock onto Profile' });
  if (finalStatusText === undefined) return res.status(400).json({ error: 'Status string natively required for update' });

  try {
    let pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is currently offline' });
    }

    await pool.request()
      .input('email', sql.NVarChar, email)
      .input('about_me', sql.NVarChar, finalStatusText)
      .query('UPDATE users SET about_me = @about_me WHERE email = @email');

    res.json({ message: 'Profile About Status dramatically successfully isolated and updated!' });
  } catch (err) {
    console.error('About Status isolated update heavily crashed:', err);
    res.status(500).json({ error: 'Database safely blocked the Status Update operation' });
  }
};
// --- LEAVE MANAGEMENT ROUTES --- //

// 1. Post a new leave request
app.post('/api/leaves', verifyToken, async (req, res) => {
  const leave_type = req.body.leave_type || req.body.leaveType;
  const start_date = req.body.start_date || req.body.startDate;
  const end_date = req.body.end_date || req.body.endDate;
  const reason = req.body.reason;
  const is_half_day = req.body.is_half_day ?? req.body.isHalfDay;
  const half_day_slot = req.body.half_day_slot || req.body.halfDaySlot;

  const userId = req.user.id;

  console.log(`[LEAVE POST] Attempt by User ID: ${userId} for ${leave_type}`);

  if (!leave_type || !start_date || !end_date) {
    return res.status(400).json({ error: 'Leave type, start date, and end date are required', received: { leave_type, start_date, end_date } });
  }

  try {
    const pool = await getPool();

    // Fetch user metadata: balance and reporting manager matrix
    const userResult = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT u.name, u.role, ISNULL(ls.leaves_available, 0) as leave_balance, u.reporting_manager_id, u.joining_date,
               m.reporting_manager_id as hierarchy_pm_id
        FROM users u
        LEFT JOIN users m ON u.reporting_manager_id = m.id
        LEFT JOIN leave_stats ls ON u.id = ls.employee_id 
             AND ls.month = MONTH(DATEADD(MINUTE, 330, GETUTCDATE())) 
             AND ls.year = YEAR(DATEADD(MINUTE, 330, GETUTCDATE()))
        WHERE u.id = @userId
      `);

    if (userResult.recordset.length === 0) {
      return res.status(404).json({ error: 'User not found in organizational database' });
    }

    const { name, role, leave_balance, reporting_manager_id, joining_date, hierarchy_pm_id } = userResult.recordset[0];

    // DUPLICATE CHECK: Prevent multiple active requests for the same user on the same date
    const duplicateCheck = await pool.request()
      .input('uId', sql.Int, userId)
      .input('sDate', sql.Date, start_date)
      .query("SELECT id FROM leaves WITH (NOLOCK) WHERE user_id = @uId AND start_date = @sDate AND (rm_status <> 'Rejected' AND pm_status <> 'Rejected' AND hr_status <> 'Rejected')");
    
    if (duplicateCheck.recordset.length > 0) {
      return res.status(409).json({ 
        error: 'Duplicate Request', 
        message: `You already have an active leave request starting on ${start_date}. Please check your history.` 
      });
    }

    const normalizedRole = (role || '').toLowerCase();
    const isTL = normalizedRole.includes('lead') || normalizedRole.includes('tl');
    const isManager = normalizedRole.includes('manager');

    // HIERARCHY LOGIC: 
    // If Manager: Reports directly to CEO (20251)
    // If Lead: PM is their direct RM
    // If Member: PM is their RM's RM
    let project_manager_id = isTL ? reporting_manager_id : (hierarchy_pm_id || 20251);
    if (isManager) project_manager_id = 20251;

    let requestedDays = Math.ceil((new Date(end_date) - new Date(start_date)) / (1000 * 60 * 60 * 24)) + 1;
    if (is_half_day) requestedDays = 0.5;
    let rmStatus = 'Pending';
    let pmStatus = 'Pending';

    // SPECIAL CASE: If TL or Manager: RM stage is skipped (N/A) because they report directly to PM/CEO
    if (isTL || isManager || reporting_manager_id == project_manager_id) {
      rmStatus = 'N/A';
      pmStatus = 'Pending';
    }

    // --- PROBATION CHECK (90 Days) ---
    if (joining_date) {
      const joinDate = new Date(joining_date);
      const today = new Date();
      const diffTime = Math.abs(today - joinDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 90 && leave_type !== 'Unpaid Leave' && leave_type !== 'LOP') {
        // NEW: Allow Casual Leave during probation if they have a pre-existing balance
        if (leave_type === 'Casual Leave' && leave_balance >= requestedDays) {
           console.log(`[LEAVE] Allowing Casual Leave during probation for User ${userId} due to existing balance.`);
        } else {
          return res.status(403).json({
            error: 'Probation Period Restriction',
            message: `During your 3-month probation, only Unpaid/LOP leaves are permitted. Other leave types are available after 90 days or if you have an existing balance. Service days: ${diffDays}/90`
          });
        }
      }
    }

    // --- LEAVE BALANCE CHECK: Include PENDING casual leaves ---
    if (leave_type === 'Casual Leave') {
      const pendingRes = await pool.request()
        .input('uId', sql.Int, userId)
        .query(`
          SELECT SUM(CASE WHEN is_half_day = 1 THEN 0.5 ELSE DATEDIFF(day, start_date, end_date) + 1 END) as pending_days
          FROM leaves 
          WHERE user_id = @uId AND leave_type = 'Casual Leave' AND hr_status = 'Pending' AND (rm_status <> 'Rejected' AND pm_status <> 'Rejected')
        `);
      
      const pendingDays = pendingRes.recordset[0]?.pending_days || 0;
      const effectiveBalance = leave_balance - pendingDays;

      if (effectiveBalance < requestedDays) {
        return res.status(400).json({
          error: 'Insufficient Leave Balance',
          message: `Your available balance is ${leave_balance} days, but you have ${pendingDays} days already pending approval. Remaining: ${effectiveBalance} days. You requested ${requestedDays} days.`
        });
      }
    }

    // 4. Secure Insertion into relational [leaves] table
    const insertResult = await pool.request()
      .input('userId', sql.Int, userId)
      .input('employeeName', sql.NVarChar, name)
      .input('managerId', sql.Int, reporting_manager_id || null)
      .input('pmId', sql.Int, project_manager_id || null)
      .input('leaveType', sql.NVarChar, leave_type)
      .input('startDate', sql.Date, start_date)
      .input('endDate', sql.Date, end_date)
      .input('reason', sql.NVarChar(sql.MAX), reason || '')
      .input('rmStatus', sql.NVarChar, rmStatus)
      .input('pmStatus', sql.NVarChar, pmStatus)
      .input('isHalfDay', sql.Bit, is_half_day ? 1 : 0)
      .input('halfDaySlot', sql.NVarChar, half_day_slot || null)
      .query(`
                INSERT INTO leaves (user_id, employee_name, manager_id, pm_id, leave_type, start_date, end_date, reason, rm_status, pm_status, hr_status, status, is_half_day, half_day_slot, created_at, updated_at)
                OUTPUT INSERTED.id
                VALUES (@userId, @employeeName, @managerId, @pmId, @leaveType, @startDate, @endDate, @reason, @rmStatus, @pmStatus, 'Pending', 'Pending', @isHalfDay, @halfDaySlot, DATEADD(MINUTE, 330, GETUTCDATE()), DATEADD(MINUTE, 330, GETUTCDATE()))
            `);

    console.log(`[LEAVE POST SUCCESS] Leave ID ${insertResult.recordset[0].id} generated for User ${userId}`);

    res.status(201).json({
      success: true,
      message: 'Leave request submitted to management matrix successfully!',
      leaveId: insertResult.recordset[0].id,
      requestedDays,
      status: 'Pending'
    });

  } catch (err) {
    console.error('[LEAVE POST CRITICAL ERROR]:', err);
    res.status(500).json({ error: 'Database integrity check failed during leave submission', details: err.message });
  }
});

// 2. Get user's personal leave history (Self-Service View)
app.get('/api/leaves', verifyToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT * FROM leaves WHERE user_id = @userId ORDER BY created_at DESC');

    res.json(result.recordset);
  } catch (err) {
    console.error('[LEAVE HISTORY FETCH ERROR]:', err);
    res.status(500).json({ error: 'Failed to extract leave history from organizational core' });
  }
});

// 3. Get Leave requests for Approval (Managerial Matrix View)
app.get('/api/manager/leaves/:managerId', async (req, res) => {
  const { managerId } = req.params;
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('managerId', sql.Int, managerId)
      .query(`
                SELECT l.*, u.name as employee_name, u.team as employee_team, u.profile_picture
                FROM leaves l
                JOIN users u ON l.user_id = u.id
                WHERE l.manager_id = @managerId
                ORDER BY l.created_at DESC
            `);

    res.json(result.recordset);
  } catch (err) {
    console.error('[MANAGER LEAVE FETCH ERROR]:', err);
    res.status(500).json({ error: 'Failed to extract subordinate leave requests' });
  }
});

// --- ATTENDANCE (TEAM OFFICE) INTEGRATION --- //

// 1. Get today's attendance for the authenticated user
app.get(['/api/attendance', '/api/attendance ', '/api/attendance%20'], verifyToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const pool = await getPool();
    const userResult = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT id, name FROM users WHERE id = @userId');

    if (userResult.recordset.length === 0) {
      return res.status(404).json({ error: 'User not found in system.' });
    }

    // Use the numeric 'id' as the Empcode directly as confirmed by user
    const empCode = userResult.recordset[0].id.toString();

    // Format today's date in IST (UTC+5:30) as dd/mm/yyyy
    const now = new Date();
    const istTime = new Date(now.getTime() + (330 * 60 * 1000));
    const day = String(istTime.getUTCDate()).padStart(2, '0');
    const month = String(istTime.getUTCMonth() + 1).padStart(2, '0');
    const year = istTime.getUTCFullYear();
    const formattedDate = `${day}/${month}/${year}`;

    const baseUrl = process.env.TEAM_OFFICE_BASE_URL || 'https://api.etimeoffice.com/api';
    const authToken = process.env.TEAM_OFFICE_AUTH_TOKEN;

    // Skip API call if not configured to avoid hang
    if (!authToken || authToken === 'YOUR_BASE64_AUTH_TOKEN_HERE') {
      return res.status(503).json({
        error: 'Attendance service temporarily unavailable (Auth Missing).',
        message: 'Contact admin to configure TEAM_OFFICE_AUTH_TOKEN in .env'
      });
    }

    const url = `${baseUrl}/DownloadInOutPunchData?Empcode=${empCode}&FromDate=${formattedDate}&ToDate=${formattedDate}`;

    console.log(`[ATTENDANCE] Syncing logs for ${userResult.recordset[0].name} (ID: ${empCode})`);

    const response = await fetch(url, {
      headers: { 'Authorization': `Basic ${authToken}` }
    });

    if (!response.ok) throw new Error(`External API Failure: ${response.status}`);

    const data = await response.json();
    const apiLog = (data.InOutPunchData && data.InOutPunchData.length > 0) ? data.InOutPunchData[0] : null;

    // --- NEW: PERSISTENT CACHING (UPSERT) --- //
    if (apiLog) {
      await pool.request()
        .input('userId', sql.Int, userId)
        .input('punchDate', sql.Date, istTime) // Date object is fine for DATE column
        .input('inTime', sql.NVarChar, apiLog.INTime)
        .input('outTime', sql.NVarChar, apiLog.OUTTime)
        .input('workTime', sql.NVarChar, apiLog.WorkTime)
        .input('status', sql.NVarChar, apiLog.Status)
        .input('remark', sql.NVarChar, apiLog.Remark)
        .query(`
                    MERGE INTO attendance_logs WITH (HOLDLOCK) AS target
                    USING (SELECT @userId AS user_id, @punchDate AS punch_date) AS source
                    ON (target.user_id = source.user_id AND target.punch_date = source.punch_date)
                    WHEN MATCHED THEN
                        UPDATE SET in_time = @inTime, out_time = @outTime, work_time = @workTime, status = @status, remark = @remark, last_sync = GETDATE()
                    WHEN NOT MATCHED THEN
                        INSERT (user_id, punch_date, in_time, out_time, work_time, status, remark)
                        VALUES (@userId, @punchDate, @inTime, @outTime, @workTime, @status, @remark);
                `);
    }

    res.json({
      success: true,
      date: formattedDate,
      empCode: empCode,
      attendance: apiLog ? {
        inTime: apiLog.INTime,
        outTime: apiLog.OUTTime,
        workTime: apiLog.WorkTime,
        status: apiLog.Status,
        remark: apiLog.Remark
      } : null
    });

  } catch (err) {
    console.error('[ATTENDANCE ERROR]:', err);

    // --- FALLBACK: TRY TO LOAD FROM LOCAL CACHE ON FAILURE --- //
    try {
      const pool = await getPool();
      const now = new Date();
      const istDate = new Date(now.getTime() + (330 * 60 * 1000)).toISOString().split('T')[0];

      const cachedRes = await pool.request()
        .input('userId', sql.Int, userId)
        .input('punchDate', sql.Date, istDate)
        .query('SELECT in_time as inTime, out_time as outTime, work_time as workTime, status, remark FROM attendance_logs WHERE user_id = @userId AND punch_date = @punchDate');

      if (cachedRes.recordset.length > 0) {
        return res.json({
          success: true,
          cached: true,
          attendance: cachedRes.recordset[0]
        });
      }
    } catch (dbErr) {
      console.error('[CACHE FALLBACK FAILED]:', dbErr);
    }

    res.status(500).json({ error: 'Failed to extract biometric logs', details: err.message });
  }
});

// 1b. Get raw historical database backup logs for all synced attendance entries
app.get(['/api/attendance_logs', '/api/attendance logs', '/api/attendance%20logs'], verifyToken, async (req, res) => {
  const { startDate, endDate, team, status, page = 1, limit = 50 } = req.query;
  const userId = sanitizeNumericId(req.query.userId);
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const pool = await getPool();
    let queryStr = `
      SELECT 
        a.id, a.user_id, u.name as user_name, u.team as user_team, a.punch_date, 
        a.in_time, a.out_time, a.work_time, a.status, a.remark, a.last_sync,
        COUNT(*) OVER() as totalCount
      FROM attendance_logs a WITH (NOLOCK)
      INNER JOIN users u WITH (NOLOCK) ON a.user_id = u.id
      WHERE (u.joining_date IS NULL OR a.punch_date >= u.joining_date)
    `;

    const request = pool.request();

    if (startDate) {
      queryStr += ` AND a.punch_date >= @startDate`;
      request.input('startDate', sql.Date, startDate);
    }
    if (endDate) {
      queryStr += ` AND a.punch_date <= @endDate`;
      request.input('endDate', sql.Date, endDate);
    }
    if (team) {
      queryStr += ` AND u.team = @team`;
      request.input('team', sql.NVarChar, team);
    }
    if (status) {
      queryStr += ` AND a.status = @status`;
      request.input('status', sql.NVarChar, status);
    }

    const role = (req.user.role || '').toLowerCase();
    const isManagerial = role.includes('hr') || role.includes('admin') || role.includes('manager') || role.includes('lead') || role.includes('ceo');

    if (!isManagerial) {
      // Force security lock: Employees can ONLY view their own records
      queryStr += ` AND a.user_id = @queryUserId`;
      request.input('queryUserId', sql.Int, req.user.id);
    } else if (userId) {
      // Manager/HR requesting a specific user's logs
      queryStr += ` AND a.user_id = @queryUserId`;
      request.input('queryUserId', sql.Int, userId);
    }

    queryStr += ` ORDER BY a.punch_date DESC, u.name ASC`;
    queryStr += ` OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;

    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, parseInt(limit));

    const result = await request.query(queryStr);

    const totalRecords = result.recordset.length > 0 ? result.recordset[0].totalCount : 0;

    // Map backend snake_case simultaneously to Team Office capitalized formats
    const mappedData = result.recordset.map(log => ({
      // Modern Backend Syntax exactly matching my provided React snippet
      id: log.id,
      user_id: log.user_id,
      user_name: log.user_name,
      punch_date: log.punch_date,
      in_time: log.in_time,
      out_time: log.out_time,
      work_time: log.work_time,
      status: log.status,
      remark: log.remark,

      // Legacy TeamOffice Syntax for backward compatibility
      Empcode: log.user_id ? log.user_id.toString() : '',
      Name: log.user_name,
      PunchDate: log.punch_date,
      INTime: log.in_time || '--:--',
      OUTTime: log.out_time || '--:--',
      WorkTime: log.work_time || '--:--',
      Status: log.status || 'A',
      Remark: log.remark || '--'
    }));

    // Wrap dynamically for UI success mapping
    res.json({
      success: true,
      count: mappedData.length,
      totalRecords: parseInt(totalRecords),
      page: parseInt(page),
      limit: parseInt(limit),
      data: mappedData
    });
  } catch (err) {

    console.error('[ATTENDANCE_LOGS ERROR]:', err.message);
    res.status(500).json({ error: 'Failed to extract database tracking logs.' });
  }
});

// 1c. Get raw historical logs directly from Etime Office (Admin Only)
app.get('/api/admin/etime-logs', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  if (!role.includes('hr') && !role.includes('admin')) {
    return res.status(403).json({ error: 'Unauthorized: High-level clearance required for Etime Office raw logs.' });
  }

  const { fromDate, toDate, empCode } = req.query; // Expecting DD/MM/YYYY
  if (!fromDate || !toDate) {
    return res.status(400).json({ error: 'fromDate and toDate parameters are required (Format: DD/MM/YYYY)' });
  }

  try {
    const baseUrl = process.env.TEAM_OFFICE_BASE_URL || 'https://api.etimeoffice.com/api';
    const authToken = process.env.TEAM_OFFICE_AUTH_TOKEN;
    const finalEmpCode = empCode || 'ALL';

    const url = `${baseUrl}/DownloadInOutPunchData?Empcode=${finalEmpCode}&FromDate=${fromDate}&ToDate=${toDate}`;

    console.log(`[ETIME FETCH] Fetching from: ${url}`);

    const response = await fetch(url, {
      headers: { 'Authorization': `Basic ${authToken}` }
    });

    if (!response.ok) throw new Error(`External API Failure: ${response.status}`);

    const data = await response.json();
    res.json({
      success: true,
      source: 'Etime Office',
      url: url,
      data: data.InOutPunchData || []
    });
  } catch (err) {
    console.error('[ETIME LOG FETCH ERROR]:', err);
    res.status(500).json({ error: 'Failed to fetch logs from Etime Office service.', details: err.message });
  }
});


// 1c. Allow manual web-app punches to fallback directly into the local DB
app.post('/api/attendance_logs/punch', verifyToken, async (req, res) => {
  try {
    const pool = await getPool();

    // --- DYNAMIC ID BRIDGE: AUTO-CORRECT 6-DIGIT SESSIONS (20250X -> 2025X) ---
    const rawUserId = req.user.id;
    const autoCorrectId = (id) => {
      if (!id) return id;
      const strId = String(id);
      if (strId.startsWith('20250') && strId.length === 6) {
        return parseInt(strId.replace('20250', '2025'));
      }
      return parseInt(id);
    };
    const userId = autoCorrectId(rawUserId);

    let { status = 'P', remark = 'WEB_PUNCH', location = 'Web Application' } = req.body || {};


    // Get local date/time natively
    const offsetDate = new Date(new Date().getTime() + (330 * 60000)); // +5:30 IST approx if required
    const punchDateString = offsetDate.toISOString().split('T')[0];

    const hours = String(offsetDate.getUTCHours()).padStart(2, '0');
    const minutes = String(offsetDate.getUTCMinutes()).padStart(2, '0');
    const currentTimeString = `${hours}:${minutes}`;

    // Check if the user already punched in today
    const checkRes = await pool.request()
      .input('userId', require('mssql').Int, userId)
      .input('punchDate', require('mssql').Date, punchDateString)
      .query(`SELECT * FROM attendance_logs WHERE user_id = @userId AND punch_date = @punchDate`);

    if (checkRes.recordset.length === 0) {
      // NO RECORD FOUND: THIS IS A PUNCH IN
      await pool.request()
        .input('userId', require('mssql').Int, userId)
        .input('punchDate', require('mssql').Date, punchDateString)
        .input('inTime', require('mssql').NVarChar, currentTimeString)
        .input('status', require('mssql').NVarChar, status)
        .input('remark', require('mssql').NVarChar, remark)
        .input('location', require('mssql').NVarChar, location)
        .query(`
          INSERT INTO attendance_logs (user_id, punch_date, in_time, status, remark, last_sync, punchin_location)
          VALUES (@userId, @punchDate, @inTime, @status, @remark, GETDATE(), @location)
        `);

      return res.json({ success: true, action: 'PUNCH_IN', time: currentTimeString, message: 'Punched In successfully via Web Application.' });
    } else {
      // RECORD FOUND: THIS IS A PUNCH OUT (or an overwrite punch out)
      const existing = checkRes.recordset[0];
      const inTimeStr = existing.in_time;
      let workTimeStr = existing.work_time || '00:00';

      if (inTimeStr) {
        const [inH, inM] = inTimeStr.split(':').map(Number);
        const [outH, outM] = currentTimeString.split(':').map(Number);

        let diffMins = (outH * 60 + outM) - (inH * 60 + inM);
        if (diffMins < 0) diffMins = 0; // Safety guard

        const workH = Math.floor(diffMins / 60);
        const workM = diffMins % 60;
        workTimeStr = `${String(workH).padStart(2, '0')}:${String(workM).padStart(2, '0')}`;
      }

      await pool.request()
        .input('userId', require('mssql').Int, userId)
        .input('punchDate', require('mssql').Date, punchDateString)
        .input('outTime', require('mssql').NVarChar, currentTimeString)
        .input('workTime', require('mssql').NVarChar, workTimeStr)
        .input('remark', require('mssql').NVarChar, remark)
        .input('location', require('mssql').NVarChar, location)
        .query(`
          UPDATE attendance_logs 
          SET out_time = @outTime, work_time = @workTime, remark = @remark, last_sync = GETDATE(), punchout_location = @location
          WHERE user_id = @userId AND punch_date = @punchDate
        `);

      return res.json({ success: true, action: 'PUNCH_OUT', time: currentTimeString, workTime: workTimeStr, message: 'Punched Out successfully via Web Application.' });
    }
  } catch (err) {
    console.error('[MANUAL PUNCH ERROR]:', err.message);
    res.status(500).json({ error: 'Failed to record web punch natively in DB.' });
  }
});

// 2. Get attendance for ALL employees (Managerial Dashboard View)
app.get('/api/manager/attendance', verifyToken, async (req, res) => {
  // Only allow HR or Managers/Admins to view all attendance
  const role = (req.user.role || '').toLowerCase();
  const isAuthorized = role.includes('hr') || role.includes('admin') || role.includes('manager') || role.includes('lead') || role.includes('ceo');

  if (!isAuthorized) {
    return res.status(403).json({ error: 'Unauthorized: High-level clearance required for attendance matrix.' });
  }

  try {
    const pool = await getPool();
    const now = new Date();
    const istTime = new Date(now.getTime() + (330 * 60 * 1000));
    const istDateOnly = istTime.toISOString().split('T')[0];

    // --- STEP 1: INSTANT DATABASE RETRIEVAL ---
    const result = await pool.request()
      .input('punchDate', sql.Date, istDateOnly)
      .query(`
        SELECT 
          a.user_id as Empcode, 
          u.name as Name, 
          a.punch_date as PunchDate, 
          a.in_time as INTime, 
          a.out_time as OUTTime, 
          a.work_time as WorkTime, 
          a.status as Status, 
          a.remark as Remark
        FROM attendance_logs a
        JOIN users u ON a.user_id = u.id
        WHERE a.punch_date = @punchDate
      `);

    // --- STEP 2: FIRE-AND-FORGET BACKGROUND SYNC ---
    // This allows the response to be sent IMMEDIATELY while the sync runs in the background.
    // We use the existing importAttendance if available, or a local version.
    if (typeof importAttendance === 'function') {
      importAttendance().catch(err => console.error('[BG SYNC ERROR]:', err.message));
    }

    res.json({
      success: true,
      cached: true,
      date: istDateOnly,
      count: result.recordset.length,
      data: result.recordset
    });

  } catch (err) {
    console.error('[MANAGER ATTENDANCE ERROR]:', err);
    res.status(500).json({ error: 'Failed to pull organizational attendance matrix.' });
  }
});

/**
 * 2.1 Alter Punch-In/Out Time (HR & Manager Only)
 */
app.post('/api/attendance/update-punch-time', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  const isAuthorized = role.includes('hr') || role.includes('admin') || role.includes('manager') || role.includes('lead') || role.includes('ceo');

  if (!isAuthorized) {
    return res.status(403).json({ error: 'Unauthorized: Only HR or Managers can alter attendance logs.' });
  }

  console.log('[UPDATE PUNCH TIME INCOMING]:', req.body);

  const targetUserId = req.body.targetUserId || req.body.employeeId || req.body.userId || req.body.user_id;
  const punchDate = req.body.punchDate || req.body.date;
  const newInTime = req.body.newInTime || req.body.inTime || req.body.in_time || req.body.punch_in;
  const newOutTime = req.body.newOutTime || req.body.outTime || req.body.out_time || req.body.punch_out;

  if (!targetUserId || !punchDate) {
    console.error('[UPDATE PUNCH TIME REJECTED] Missing payload:', { targetUserId, punchDate });
    return res.status(400).json({ error: 'targetUserId (or employeeId) and punchDate (or date) are required.' });
  }

  try {
    const pool = await getPool();

    // 1. Fetch existing log
    const checkRes = await pool.request()
      .input('userId', sql.Int, targetUserId)
      .input('punchDate', sql.Date, punchDate)
      .query('SELECT in_time, out_time, work_time, status, remark FROM attendance_logs WHERE user_id = @userId AND punch_date = @punchDate');

    const existing = checkRes.recordset[0];

    // Determine target values
    let finalInTime = newInTime !== undefined ? newInTime : (existing ? existing.in_time : null);
    let finalOutTime = newOutTime !== undefined ? newOutTime : (existing ? existing.out_time : null);

    // Calculate Work Time if both exist
    let finalWorkTime = '00:00';
    if (finalInTime && finalOutTime) {
      const [inH, inM] = finalInTime.split(':').map(Number);
      const [outH, outM] = finalOutTime.split(':').map(Number);
      let diffMins = (outH * 60 + outM) - (inH * 60 + inM);
      if (diffMins < 0) diffMins = 0;
      const h = Math.floor(diffMins / 60);
      const m = diffMins % 60;
      finalWorkTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    const modifierName = req.user.name || 'Admin';
    const auditRemark = `Modified by ${modifierName}${existing?.remark ? ' | ' + existing.remark : ''}`;

    if (existing) {
      // UPDATE
      await pool.request()
        .input('userId', sql.Int, targetUserId)
        .input('punchDate', sql.Date, punchDate)
        .input('inTime', sql.NVarChar, finalInTime)
        .input('outTime', sql.NVarChar, finalOutTime)
        .input('workTime', sql.NVarChar, finalWorkTime)
        .input('remark', sql.NVarChar, auditRemark)
        .query(`
          UPDATE attendance_logs 
          SET in_time = @inTime, out_time = @outTime, work_time = @workTime, status = 'P', remark = @remark, last_sync = GETDATE()
          WHERE user_id = @userId AND punch_date = @punchDate
        `);
    } else {
      // INSERT
      await pool.request()
        .input('userId', sql.Int, targetUserId)
        .input('punchDate', sql.Date, punchDate)
        .input('inTime', sql.NVarChar, finalInTime)
        .input('outTime', sql.NVarChar, finalOutTime)
        .input('workTime', sql.NVarChar, finalWorkTime)
        .input('status', sql.NVarChar, 'P')
        .input('remark', sql.NVarChar, auditRemark)
        .query(`
          INSERT INTO attendance_logs (user_id, punch_date, in_time, out_time, work_time, status, remark, last_sync)
          VALUES (@userId, @punchDate, @inTime, @outTime, @workTime, @status, @remark, GETDATE())
        `);
    }

    res.json({ success: true, message: 'Attendance log updated successfully.', workTime: finalWorkTime });

  } catch (err) {
    console.error('[UPDATE PUNCH TIME ERROR]:', err.message);
    res.status(500).json({ error: 'Failed to update attendance log.' });
  }
});
;

app.post('/api/task-updates', async (req, res) => {
  console.log('RECEIVED TASK PAYLOAD:', req.body);
  const payload = req.body;

  // 1. Precise Extraction (handles userId, user_id, employeeId, employee_id)
  const userId = payload.userId || payload.user_id || payload.employeeId || payload.employee_id;

  if (!userId) {
    return res.status(400).json({ error: 'Valid userId is required for task synchronization' });
  }

  try {
    let pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is currently offline' });
    }

    // 2. Fetch User Metadata
    const userLookup = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT email, team FROM users WHERE id = @userId');

    if (userLookup.recordset.length === 0) return res.status(404).json({ error: 'User mapping not found' });

    const { email, team } = userLookup.recordset[0];

    // 3. Intelligently Normalize Tasks (handles tasks, taskBreakdown, description, content)
    const rawTasks = payload.tasks || payload.taskBreakdown || payload.description || payload.content || payload.details;
    let finalDescription = '[]';

    if (rawTasks !== undefined && rawTasks !== null) {
      // If it's a string from a single input field, wrap it in an array so JSON.parse won't crash later
      const taskArray = Array.isArray(rawTasks) ? rawTasks : [String(rawTasks)];
      finalDescription = JSON.stringify(taskArray);
    }

    const incomingStatus = payload.overallStatus || payload.status || 'PENDING';
    const badge = (incomingStatus.toUpperCase() === 'COMPLETED') ? 'VERIFIED' : 'PENDING';

    // 4. Check if an entry exists for TODAY (IST)
    const checkToday = await pool.request()
      .input('employee_id', sql.Int, userId)
      .query(`
        SELECT id FROM task_updates 
        WHERE employee_id = @employee_id 
        AND CAST(created_at AS DATE) = CAST(DATEADD(minute, 330, GETUTCDATE()) AS DATE)
      `);

    if (checkToday.recordset.length > 0) {
      const existingId = checkToday.recordset[0].id;

      await pool.request()
        .input('id', sql.Int, existingId)
        .input('badge', sql.NVarChar, badge)
        .input('team', sql.NVarChar, team)
        .input('overall_status', sql.NVarChar, incomingStatus)
        .input('description', sql.NVarChar, finalDescription)
        .query(`
        UPDATE task_updates 
        SET overall_status = @overall_status, badge = @badge, team = @team, description = @description,
            created_at = DATEADD(minute, 330, GETUTCDATE())
        WHERE id = @id
        `);

      // 5. Fetch and Return the updated task for frontend state synchronization
      const finalResult = await pool.request()
        .input('id', sql.Int, existingId || (checkToday.recordset.length > 0 ? checkToday.recordset[0].id : null))
        .query(`
          SELECT t.*, u.name as userName, u.role as userRole 
          FROM task_updates t 
          JOIN users u ON u.id = t.employee_id 
          WHERE t.id = (SELECT TOP 1 id FROM task_updates WHERE employee_id = @id ORDER BY created_at DESC)
        `);
      // Note: We'll use a more precise fetch below to ensure we get exactly what was just saved
    } else {
      // 4b. Perform INSERT if no record exists for today
      await pool.request()
        .input('userId', sql.Int, userId)
        .input('email', sql.NVarChar, email)
        .input('team', sql.NVarChar, team)
        .input('badge', sql.NVarChar, badge)
        .input('status', sql.NVarChar, incomingStatus)
        .input('desc', sql.NVarChar, finalDescription)
        .input('categ', sql.NVarChar, payload.taskCategory || payload.category || 'Daily Log')
        .query(`
          INSERT INTO task_updates (employee_id, email, team, badge, overall_status, description, task_category, created_at)
          VALUES (@userId, @email, @team, @badge, @status, @desc, @categ, DATEADD(minute, 330, GETUTCDATE()))
        `);
    }

    // --- REFACTORED RESPONSE LOGIC ---
    // Instead of doing multiple queries, let's just fetch the LATEST task for this user
    const refreshResult = await pool.request()
      .input('employee_id', sql.Int, userId)
      .query(`
        SELECT TOP 1 t.*, u.name as userName, u.role as userRole 
        FROM task_updates t 
        JOIN users u ON u.id = t.employee_id 
        WHERE t.employee_id = @employee_id
        ORDER BY t.created_at DESC
      `);

    const row = refreshResult.recordset[0];

    // Safety: If no record was found even after save/insert, avoid crash
    if (!row) {
      return res.status(200).json({
        message: "Task synchronized successfully",
        task: {
          userId: userId,
          userName: "SYSTEM-SYNC",
          tasks: [],
          overallStatus: 'Pending',
          timestamp: new Date().toISOString()
        }
      });
    }

    let parsedTasks = [];
    try {
      parsedTasks = JSON.parse(row.description);
    } catch (e) {
      parsedTasks = [{ id: row.id, text: row.description, status: row.overall_status }];
    }

    res.status(200).json({
      message: "Task synchronized successfully",
      task: {
        id: row.id,
        userId: row.employee_id,
        employee_id: row.employee_id, // Redundancy
        userName: row.userName,
        user_name: row.userName,
        name: row.userName,
        author: row.userName,
        submittedBy: row.userName,
        userRole: row.userRole,
        team: row.team,
        taskCategory: row.task_category,
        tasks: parsedTasks,
        badge: row.badge,
        overallStatus: row.overall_status || (row.badge === 'VERIFIED' ? 'Completed' : 'Pending'),
        timestamp: row.created_at
      }
    });

  } catch (err) {
    console.error('Task update persistence failed:', err);
    res.status(500).json({ error: 'Database synchronization failed', details: err.message });
  }
});

// Shared Handler for Task Update Fetching
const getTaskUpdatesHandler = async (req, res) => {
  try {
    let pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is currently offline' });
    }

    const { userId, managerId, team, page, limit, startDate, endDate, status, category } = req.query;
    const cleanUserId = parseInt(userId);
    const cleanManagerId = parseInt(managerId);

    // Pagination parameters
    const p = parseInt(page) || 1;
    const l = parseInt(limit) || 10;
    const offset = (p - 1) * l;

    let baseQuery = `
      SELECT t.*, u.name as userName, u.role as userRole, t.team 
      FROM task_updates t 
      JOIN users u ON u.id = t.employee_id 
      WHERE 1=1
    `;

    const request = pool.request();
    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, l);

    if (!isNaN(cleanUserId)) {
      baseQuery += ' AND (t.employee_id = @userId OR u.reporting_manager_id = @userId)';
      request.input('userId', sql.Int, cleanUserId);
    } else if (!isNaN(cleanManagerId)) {
      baseQuery += ' AND u.reporting_manager_id = @managerId';
      request.input('managerId', sql.Int, cleanManagerId);
    } else if (team && team !== 'undefined') {
      baseQuery += ' AND u.team = @team';
      request.input('team', sql.NVarChar, team);
    }

    // Advanced Filtering
    if (startDate) {
      baseQuery += ' AND t.created_at >= @startDate';
      request.input('startDate', sql.DateTime, startDate);
    }
    if (endDate) {
      // Set to end of day if only date is provided
      const finalEndDate = endDate.includes('T') ? endDate : `${endDate} 23:59:59`;
      baseQuery += ' AND t.created_at <= @endDate';
      request.input('endDate', sql.DateTime, finalEndDate);
    }
    if (status) {
      baseQuery += ' AND t.overall_status = @status';
      request.input('status', sql.NVarChar, status);
    }
    if (category) {
      baseQuery += ' AND t.task_category = @category';
      request.input('category', sql.NVarChar, category);
    }

    baseQuery += ' ORDER BY t.created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';

    const result = await request.query(baseQuery);

    const formattedPayloads = result.recordset.map(row => {
      let parsedTasks = [];
      try {
        parsedTasks = JSON.parse(row.description);
      } catch (e) {
        parsedTasks = [{ id: row.id, text: row.description, status: row.overall_status }];
      }
      return {
        id: row.id,
        userId: row.employee_id,
        employee_id: row.employee_id, // Redundancy
        userName: row.userName,
        user_name: row.userName,
        name: row.userName,
        author: row.userName,     // Redundancy for common React patterns
        submittedBy: row.userName, // Redundancy
        userRole: row.userRole,
        team: row.team,
        taskCategory: row.task_category,
        tasks: parsedTasks,
        badge: row.badge,
        overallStatus: row.overall_status || (row.badge === 'VERIFIED' ? 'Completed' : 'Pending'),
        timestamp: row.created_at
      };
    });

    res.json(formattedPayloads);
  } catch (err) {
    console.error('Task fetch error:', err);
    res.status(500).json({ error: 'Failed to securely fetch chronological task updates' });
  }
};

// 6. Unified Task Updates Feed (Hierarchical Filtering)
app.get('/api/tasks', getTaskUpdatesHandler);
app.get('/api/task-updates', getTaskUpdatesHandler);

/**
 * 6b. Get Single Task Update Details
 */
app.get('/api/task-updates/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT t.*, u.name as userName, u.role as userRole 
        FROM task_updates t 
        JOIN users u ON u.id = t.employee_id 
        WHERE t.id = @id
      `);

    if (result.recordset.length === 0) return res.status(404).json({ error: 'Task update not found' });

    const row = result.recordset[0];
    let parsedTasks = [];
    try {
      parsedTasks = JSON.parse(row.description);
    } catch (e) {
      parsedTasks = [{ id: row.id, text: row.description, status: row.overall_status }];
    }

    res.json({
      id: row.id,
      userId: row.employee_id,
      employee_id: row.employee_id, // Redundancy
      userName: row.userName,
      user_name: row.userName,
      name: row.userName,
      author: row.userName,
      submittedBy: row.userName,
      userRole: row.userRole,
      team: row.team,
      taskCategory: row.task_category,
      tasks: parsedTasks,
      badge: row.badge,
      overallStatus: row.overall_status || (row.badge === 'VERIFIED' ? 'Completed' : 'Pending'),
      timestamp: row.created_at
    });
  } catch (err) {
    console.error('[TASK FETCH ERROR]', err);
    res.status(500).json({ error: 'Failed to fetch task update details' });
  }
});


// 7. Corporate Holidays API
// Simple in-memory cache for holidays (1 hour TTL)
let holidaysCache = null;
let lastHolidaysFetch = 0;
const HOLIDAYS_CACHE_DURATION = 3600000;

app.get('/api/holidays', async (req, res) => {
  const now = Date.now();
  if (holidaysCache && (now - lastHolidaysFetch < HOLIDAYS_CACHE_DURATION)) {
    return res.json(holidaysCache);
  }

  try {
    let pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is currently offline' });
    }

    const result = await pool.request().query(`
      SELECT id, name, CONVERT(VARCHAR, holiday_date, 23) AS holiday_date_str, classification, description 
      FROM holidays WITH (NOLOCK)
      ORDER BY holiday_date ASC
    `);

    holidaysCache = result.recordset.map(h => ({
      id: h.id,
      name: h.name,
      title: h.name,
      date: h.holiday_date_str,
      holiday_date: h.holiday_date_str,
      classification: h.classification || 'Public Holiday',
      description: h.description || 'Public Holiday'
    }));

    lastHolidaysFetch = now;
    res.json(holidaysCache);
  } catch (err) {
    console.error('Holidays API failed:', err);
    res.status(500).json({ error: 'Failed to fetch corporate holidays' });
  }
});

// 8. Universal Roster Fetching (Role or Team)
app.get('/api/roster/:type', async (req, res) => {
  const table = req.params.type.toLowerCase();

  // Security Sanitization: Forcefully validate against our known structural sub-tables
  const validTables = [
    'projectmanager', 'hr', 'teamleader', 'employee', 'superadmin',
    'team_navabharatha', 'team_jkdmart_tokensboy', 'team_mlm',
    'team_digital_field_marketing', 'team_testing', 'team_technical_support'
  ];

  if (!validTables.includes(table)) {
    return res.status(400).json({ error: 'Invalid roster type or restricted structural table' });
  }

  try {
    let pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is currently offline' });
    }

    const result = await pool.request().query(`SELECT emp_name, designation, emp_id, team_name FROM ${table} WITH (NOLOCK)`);

    // Camelcase specific field strings natively for the React frontend
    const formatted = result.recordset.map(r => ({
      name: r.emp_name,
      role: r.designation,
      employeeId: r.emp_id,
      team: r.team_name
    }));

    res.json(formatted);
  } catch (err) {
    console.error(`Roster fetch failed for ${table}:`, err);
    res.status(500).json({ error: 'Failed to extract specialized roster array' });
  }
});

// 9. Get Employee Birthdays (Standalone)
const fetchBirthdaysAsJSON = async (req, res) => {
  const origin = req.get('origin') || 'Unknown Origin';
  console.log(`[NETWORK] Connection from: ${origin} -> GET /api/birthdays (Separate Stream)`);

  try {
    let pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is currently offline' });
    }

    const currentYear = new Date().getFullYear();
    const result = await pool.request().query(`
      WITH UserBirthdays AS (
        SELECT id, name, role, team, profile_picture, date_of_birth,
               TRY_CONVERT(DATE, 
                 CASE 
                   WHEN date_of_birth LIKE '%/%/%' THEN date_of_birth 
                   ELSE NULL 
                 END, 103) as dob
        FROM users WITH (NOLOCK)
        WHERE date_of_birth IS NOT NULL AND date_of_birth <> ''
      ),
      NextBirthdays AS (
        SELECT *,
               CASE 
                 WHEN DATEFROMPARTS(${currentYear}, MONTH(dob), DAY(dob)) >= CAST(DATEADD(MINUTE, 330, GETUTCDATE()) AS DATE)
                 THEN DATEFROMPARTS(${currentYear}, MONTH(dob), DAY(dob))
                 ELSE DATEFROMPARTS(${currentYear} + 1, MONTH(dob), DAY(dob))
               END AS nextOccurrence
        FROM UserBirthdays
        WHERE dob IS NOT NULL
      )
      SELECT *, DATEDIFF(day, CAST(DATEADD(MINUTE, 330, GETUTCDATE()) AS DATE), nextOccurrence) as daysUntil
      FROM NextBirthdays
      ORDER BY daysUntil ASC
    `);

    const normalizeImage = (img) => {
      if (!img) return null;
      if (typeof img !== 'string') return img;
      if (img.startsWith('data:') || img.startsWith('http') || img.startsWith('/')) return img;
      if (img.startsWith('GgoAAAANSUhEUg')) return `data:image/png;base64,iVBORw0KGgo${img}`;
      return `data:image/png;base64,${img}`;
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const birthdayList = result.recordset.map(row => {
      const pfp = normalizeImage(row.profile_picture);
      const isToday = row.daysUntil === 0;

      return {
        id: `bday-${row.id}`,
        name: row.name,
        title: row.name,
        date: row.nextOccurrence.toISOString().split('T')[0],
        nextOccurrence: row.nextOccurrence.toISOString().split('T')[0],
        daysUntil: row.daysUntil,
        status: row.daysUntil >= 0 ? 'UPCOMING' : 'PASSED',
        birthday: row.date_of_birth,
        role: row.role,
        team: row.team,
        profilePicture: pfp,
        classification: 'Birthday',
        isToday,
        description: `Celebrating ${row.name}'s Birthday!`
      };
    });

    res.json(birthdayList);
  } catch (err) {
    console.error('Birthdays API failed:', err);
    res.status(500).json({ error: 'Failed to extract birthdays' });
  }
};

app.get('/api/birthdays', fetchBirthdaysAsJSON);
app.get('/api/birthday-list', fetchBirthdaysAsJSON);
app.get('/api/employees/birthdays', fetchBirthdaysAsJSON);

// --- DASHBOARD ANALYTICS ROUTES --- //

// 10. Get All Users (for Metrics)
app.get('/api/users', async (req, res) => {
  try {
    let pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is currently offline' });
    }
    const result = await pool.request().query('SELECT id, name, email, role, team, joining_date FROM users WITH (NOLOCK)');
    res.json(result.recordset);
  } catch (err) {
    console.error('All users fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * 10B. Search Users (for Rewards/Autocomplete)
 */
app.get('/api/users/search', verifyToken, async (req, res) => {
  const query = req.query.q || '';
  if (query.length < 2) return res.json([]);

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('q', sql.NVarChar, `%${query}%`)
      .query(`
        SELECT id, name, role, team, profile_picture 
        FROM users 
        WHERE name LIKE @q OR email LIKE @q
        ORDER BY name ASC
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[USER SEARCH ERROR]:', err);
    res.status(500).json({ error: 'User search service unavailable' });
  }
});

// 11. Get All Teams (Real-Time Users-Based Analytics)
app.get('/api/teams', async (req, res) => {
  try {
    let pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is currently offline' });
    }

    // OPTIMIZED: 2 queries total instead of 2N queries (N+1 eliminated)
    // Query 1: Fetch ALL team members in one shot
    const allUsersResult = await pool.request().query(
      "SELECT name, role, email, team FROM users WITH (NOLOCK) WHERE team IS NOT NULL AND team <> ''"
    );

    // Group by team in JS (avoids N separate DB round-trips)
    const teamMap = {};
    for (const user of allUsersResult.recordset) {
      const t = user.team;
      if (!teamMap[t]) teamMap[t] = [];
      teamMap[t].push({ name: user.name, role: user.role, email: user.email });
    }

    // Query 2: Fetch the best lead per team (single query with ROW_NUMBER)
    const leadResult = await pool.request().query(`
      SELECT team, name, role FROM (
        SELECT team, name, role,
          ROW_NUMBER() OVER (
            PARTITION BY team ORDER BY
              CASE
                WHEN role LIKE '%Superadmin%' THEN 1
                WHEN role LIKE '%Manager%' THEN 2
                WHEN role LIKE '%Lead%' THEN 3
                ELSE 4
              END ASC
          ) AS rn
        FROM users WITH (NOLOCK)
        WHERE team IS NOT NULL AND team <> ''
          AND (role LIKE '%Lead%' OR role LIKE '%Manager%' OR role LIKE '%Superadmin%')
      ) ranked
      WHERE rn = 1
    `);

    const leadMap = {};
    for (const lead of leadResult.recordset) {
      leadMap[lead.team] = { name: lead.name, role: lead.role };
    }

    const teams = Object.keys(teamMap).map(teamName => {
      const membersList = teamMap[teamName];
      const lead = leadMap[teamName];
      return {
        id: teamName.toLowerCase().replace(/\s+/g, '_'),
        name: teamName,
        description: `Active operations team for ${teamName}.`,
        lead: lead ? lead.name : 'Manager',
        leadRole: lead ? lead.role : 'Team Lead',
        members: membersList.length,
        membersList,
        progress: 85,
        pending: 3,
        risk: 'none',
        status: 'On Track'
      };
    });

    res.json(teams);
  } catch (err) {
    console.error('SERVER CRASH in /api/teams:', err);
    res.status(500).json({ error: 'Critical server error while generating team analytics' });
  }
});

/**
 * 11.1 Bulk Rename Team
 * Allows Managers, HR, and Admins to rename a team across all related tables.
 */
app.put('/api/admin/teams/rename', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  const isAuthorized = role.includes('manager') || role.includes('ceo') || role.includes('hr') || role.includes('admin');

  if (!isAuthorized) {
    return res.status(403).json({ error: 'Unauthorized: Only Managers/HR/Admin can rename teams.' });
  }

  const { oldName, newName } = req.body;
  if (!oldName || !newName) {
    return res.status(400).json({ error: 'Both oldName and newName are required.' });
  }

  try {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. Update Users Table
      const userReq = new sql.Request(transaction);
      userReq.input('oldName', sql.NVarChar, oldName);
      userReq.input('newName', sql.NVarChar, newName);
      await userReq.query('UPDATE users SET team = @newName WHERE team = @oldName');

      // 2. Update Leaves Table
      const leaveReq = new sql.Request(transaction);
      leaveReq.input('oldName', sql.NVarChar, oldName);
      leaveReq.input('newName', sql.NVarChar, newName);
      await leaveReq.query('UPDATE leaves SET team = @newName WHERE team = @oldName');

      // 3. Update Task Updates Table
      const taskReq = new sql.Request(transaction);
      taskReq.input('oldName', sql.NVarChar, oldName);
      taskReq.input('newName', sql.NVarChar, newName);
      await taskReq.query('UPDATE task_updates SET team = @newName WHERE team = @oldName');

      await transaction.commit();

      // 4. Refresh Cache & Team-Specific Tables
      await syncSpecificTeamTable(pool, null, newName);

      Log.success('Team Management', `Team "${oldName}" successfully renamed to "${newName}" by ${req.user.name}`);
      res.json({
        success: true,
        message: `Team successfully renamed from "${oldName}" to "${newName}".`,
        details: 'Changes applied to Users, Leaves, and Task records.'
      });
    } catch (err) {
      if (transaction) await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('[TEAM RENAME ERROR]:', err);
    res.status(500).json({ error: 'Failed to rename team', message: err.message });
  }
});

// --- DYNAMIC TASK DELEGATION SYSTEM --- //

app.post(['/api/assign-task', '/api/tasks'], async (req, res) => {
  const {
    assignerId, assigneeId, task_name, taskName, title, project_name, description,
    attachment_data, attachment_name,
    deadline
  } = req.body;

  const finalTaskName = task_name || taskName || title;

  // --- DYNAMIC ID BRIDGE: AUTO-CORRECT 6-DIGIT SESSIONS (20250X -> 2025X) --- //
  const autoCorrectId = (id) => {
    if (!id) return id;
    const strId = String(id);
    // If we detect the 'legacy' 6-digit pattern with an unnecessary zero, we bridge them.
    if (strId.startsWith('20250') && strId.length === 6) {
      return parseInt(strId.replace('20250', '2025'));
    }
    return parseInt(id);
  };

  const finalAssignerId = autoCorrectId(assignerId);
  const finalAssigneeId = autoCorrectId(assigneeId);

  if (!finalAssignerId || !finalAssigneeId || !finalTaskName) {
    return res.status(400).json({ error: 'Assigner, Assignee, and Task Name are mandatory' });
  }

  try {
    let pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is currently offline' });
    }

    await pool.request()
      .input('assignerId', sql.Int, finalAssignerId)
      .input('assigneeId', sql.Int, finalAssigneeId)
      .input('taskName', sql.NVarChar, finalTaskName)
      .input('description', sql.NVarChar(sql.MAX), description || null)
      .input('attachment_data', sql.NVarChar(sql.MAX), attachment_data || null)
      .input('attachment_name', sql.NVarChar(255), attachment_name || null)
      .input('deadline', sql.NVarChar, deadline || null)
      .input('taskReview', sql.NVarChar(sql.MAX), null)
      .query(`
        INSERT INTO master_tasks (type, title, description, owner_id, assignee_id, attachment_data, attachment_name, deadline, task_review, created_at, updated_at)
        VALUES ('TASK', @taskName, @description, @assignerId, @assigneeId, @attachment_data, @attachment_name, @deadline, @taskReview, DATEADD(MINUTE, 330, GETUTCDATE()), DATEADD(MINUTE, 330, GETUTCDATE()))
      `);

    console.log('âœ… Task Stored in Database (ID Migration Bridge Applied)!');
    res.json({ success: true, message: 'Saved successfully!' });
  } catch (err) {

    console.error('âŒ SQL ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 13. Get ALL Assigned Tasks (Global Management View)
app.get('/api/tasks/all-assigned', async (req, res) => {
  // Disable caching to prevent browser-side ERR_CACHE_WRITE_FAILURE (common with large task payloads)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    let pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is currently offline' });
    }

    const result = await pool.request().query(`
      SELECT 
        at.id, 
        at.title as task_name,
        at.title as taskName,
        at.title as title, 
        at.description,
        at.attachment_name,
        CASE WHEN at.attachment_data IS NOT NULL THEN 1 ELSE 0 END as has_attachment,
        at.task_review,
        at.task_review as taskReview,
        at.owner_id, at.assignee_id, at.status, at.progress, at.deadline,
        u.name as assigner_name,
        u.profile_picture as assigner_picture,
        at.created_at as created_at,
        at.updated_at as updated_at
      FROM master_tasks at WITH (NOLOCK)
      LEFT JOIN users u WITH (NOLOCK) ON at.owner_id = u.id
      WHERE at.type = 'TASK'
      ORDER BY at.created_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('âŒ SQL ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 13.2 Get Specific Master Task Details (Aliased for Task Updates Compatibility)
app.get('/api/master-task/:id', async (req, res) => {
  const { id } = req.params;

  try {
    let pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is currently offline' });
    }

    // --- STEP 1: Attempt to find in task_updates (The most common source of 404s for IDs 20-29+) ---
    const updateRes = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT t.*, u.name as userName, u.role as userRole 
        FROM task_updates t 
        JOIN users u ON u.id = t.employee_id 
        WHERE t.id = @id
      `);

    if (updateRes.recordset.length > 0) {
      const row = updateRes.recordset[0];
      let parsedTasks = [];
      try { parsedTasks = JSON.parse(row.description); } catch (e) {
        parsedTasks = [{ id: row.id, text: row.description, status: row.overall_status }];
      }
      return res.json({
        id: row.id,
        userId: row.employee_id,
        userName: row.userName,
        user_name: row.userName,
        name: row.userName,
        author: row.userName,
        submittedBy: row.userName,
        userRole: row.userRole,
        tasks: parsedTasks,
        badge: row.badge,
        overallStatus: row.overall_status || (row.badge === 'VERIFIED' ? 'Completed' : 'Pending'),
        timestamp: row.created_at
      });
    }

    // --- STEP 2: Fallback to master_tasks table ---
    const masterRes = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT t.*, u.name as assigner_name, u.profile_picture as assigner_picture
        FROM master_tasks t WITH (NOLOCK)
        LEFT JOIN users u WITH (NOLOCK) ON t.owner_id = u.id
        WHERE t.id = @id
      `);

    if (masterRes.recordset.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(masterRes.recordset[0]);
  } catch (err) {
    console.error(`[MASTER TASK ERROR] ID ${id}:`, err.message);
    res.status(500).json({ error: 'Failed to extract specific objective details' });
  }
});

// 14. Get Assigned Tasks for a specific user (Targeted Stream)
app.get('/api/tasks/assigned/:userId', async (req, res) => {
  const userId = sanitizeNumericId(req.params.userId);

  // Disable caching for stability
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    let pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is currently offline' });
    }

    const request = pool.request();
    request.requestTimeout = 60000; // Explicitly override for this sensitive stream

    const result = await request
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
        t.id, t.title, t.description, t.status, t.progress, t.deadline,
        t.attachment_name,
        CASE WHEN t.attachment_data IS NOT NULL THEN 1 ELSE 0 END as has_attachment,
        t.task_review,
        t.created_at,
        u.name as assigner_name
      FROM master_tasks t WITH (NOLOCK)
      LEFT JOIN users u WITH (NOLOCK) ON t.owner_id = u.id
        WHERE t.assignee_id = @userId AND t.type = 'TASK'
        ORDER BY t.created_at DESC
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error('Failed to fetch assigned tasks:', err);
    res.status(500).json({ error: 'Failed to extract delegated objectives' });
  }
});

// 14.2 Submit Task Review (Manager Feedback)
app.put(['/api/assign-task/review/:id', '/api/assigned-task/review/:id'], async (req, res) => {
  const { id } = req.params;
  const { task_review, taskReview, review } = req.body;
  const finalReview = task_review || taskReview || review;

  console.log(`[TASK REVIEW] Request for ID: ${id} | Data: "${finalReview}"`);

  try {
    const pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is currently offline' });
    }

    let query = 'UPDATE master_tasks SET updated_at = DATEADD(MINUTE, 330, GETUTCDATE())';
    const request = pool.request().input('id', sql.Int, id);

    if (finalReview !== undefined) {
      query += ', task_review = @taskReview';
      request.input('taskReview', sql.NVarChar(sql.MAX), finalReview);
    }

    query += ' WHERE id = @id';
    const result = await request.query(query);

    if (result.rowsAffected[0] === 0) {
      console.warn(`[TASK REVIEW] No task found with ID: ${id}`);
      return res.status(404).json({ error: 'Task not found' });
    }

    console.log(`âœ… [TASK REVIEW] Successfully updated task ${id}`);
    res.json({ success: true, message: 'Review successfully submitted! âœ…' });
  } catch (err) {
    console.error('[TASK REVIEW UPDATE ERROR]:', err);
    res.status(500).json({ error: 'Failed to process task evaluation' });
  }
});

// 15. Get Tasks for a Manager's Team (Subordinates + Self) - Daily Status Updates
app.get('/api/tasks/manager/:managerId', async (req, res) => {
  const { managerId } = req.params;

  try {
    let pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is currently offline' });
    }

    const result = await pool.request()
      .input('managerId', sql.Int, managerId)
      .query(`
        SELECT t.*, u.name as employee_name, u.role as employee_role
        FROM master_tasks t WITH (NOLOCK)
        JOIN users u WITH (NOLOCK) ON t.assignee_id = u.id
        WHERE t.owner_id = @managerId AND t.type = 'TASK'
        ORDER BY t.updated_at DESC
      `);

    const formattedPayloads = result.recordset.map(row => {
      let parsedTasks = [];
      try {
        parsedTasks = JSON.parse(row.description);
      } catch (e) {
        parsedTasks = [{ id: row.id, text: row.description, status: row.status }];
      }
      return {
        userId: row.assignee_id,
        userName: row.employee_name,
        userRole: row.employee_role,
        tasks: parsedTasks,
        overallStatus: row.status || 'Pending',
        timestamp: row.updated_at
      };
    });

    res.json(formattedPayloads);
  } catch (err) {
    console.error('Failed to fetch team daily updates:', err);
    res.status(500).json({ error: 'Failed to extract team activity feed' });
  }
});


// 16. Get Tasks by Team Name (Collective View) - Daily Status Updates
app.get('/api/tasks/team/:teamName', async (req, res) => {
  const { teamName } = req.params;

  try {
    let pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is currently offline' });
    }

    const result = await pool.request()
      .input('teamName', sql.NVarChar, teamName)
      .query(`
        SELECT t.*, u.name as employee_name, u.role as employee_role
        FROM master_tasks t WITH (NOLOCK)
        JOIN users u WITH (NOLOCK) ON t.assignee_id = u.id
        WHERE u.team = @teamName AND t.type = 'TASK'
        ORDER BY t.updated_at DESC
      `);

    const formattedPayloads = result.recordset.map(row => {
      let parsedTasks = [];
      try {
        parsedTasks = JSON.parse(row.description);
      } catch (e) {
        parsedTasks = [{ id: row.id, text: row.description, status: row.status }];
      }
      return {
        userId: row.assignee_id,
        userName: row.employee_name,
        userRole: row.employee_role,
        tasks: parsedTasks,
        overallStatus: row.status || 'Pending',
        timestamp: row.updated_at
      };
    });

    res.json(formattedPayloads);
  } catch (err) {
    console.error('Failed to fetch team-wide updates:', err);
    res.status(500).json({ error: 'Failed to extract team-wide status' });
  }
});


// 17. Update Task Properties (General Endpoint for Status, Progress, Verify, etc.)
app.put(['/api/tasks/:id', '/api/tasks/status/:taskId', '/api/task-updates/:id'], async (req, res) => {
  const rawId = req.params.id || req.params.taskId;
  const taskId = parseInt(rawId); // Handles "2:1" or similar by taking only the first integer
  const { status, progress, verify, title, description, deadline } = req.body;

  try {
    let pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is currently offline' });
    }

    const request = pool.request().input('taskId', sql.Int, taskId);
    let query = 'UPDATE master_tasks SET updated_at = DATEADD(MINUTE, 330, GETUTCDATE())';

    if (status !== undefined) {
      query += ', status = @status';
      request.input('status', sql.NVarChar, status);
    }
    if (progress !== undefined) {
      query += ', progress = @progress';
      request.input('progress', sql.Int, progress);
    }
    if (verify !== undefined) {
      query += ', verify = @verify';
      request.input('verify', sql.NVarChar, verify);
    }
    if (title !== undefined) {
      query += ', title = @title';
      request.input('title', sql.NVarChar, title);
    }
    if (description !== undefined) {
      query += ', description = @description';
      request.input('description', sql.NVarChar(sql.MAX), description);
    }
    if (deadline !== undefined) {
      query += ', deadline = @deadline';
      request.input('deadline', sql.NVarChar, deadline);
    }

    query += ' WHERE id = @taskId';
    await request.query(query);

    res.json({ success: true, message: 'Task synchronization successful' });
  } catch (err) {
    console.error('Task update failed:', err);
    res.status(500).json({ error: 'Failed to synchronize task state' });
  }
});

// --- LEGACY FRONTEND COMPATIBILITY ALIASES --- //

// 12. Alias for employees (some frontend components use this)
app.get('/api/employees', async (req, res) => {
  try {
    let pool = await getPool();
    if (!pool || typeof pool.request !== 'function') {
      return res.status(503).json({ error: 'Database is currently offline' });
    }
    const result = await pool.request().query('SELECT id, name, email, role, team FROM users');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch employees roster' });
  }
});

// --- SOCIAL THREADS SYSTEM (Instagram-style) --- //

// 1. Create a new Social Thread (Post)
app.post('/api/threads', async (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Invalid or empty payload' });
  }
  console.log('[THREAD POST] Payload incoming:', Object.keys(payload));

  // Determine user ID (fallback across common names)
  const userId = payload.userId || payload.user_id || payload.employee_id;

  // Determine Content & Media URLs (fallback across common names)
  const content = payload.content || payload.text || payload.description;
  const mediaUrl = payload.mediaUrl || payload.media_url || payload.image || payload.media;
  const mediaType = payload.mediaType || payload.type || (mediaUrl ? 'image' : null);

  if (!userId) {
    console.warn('[THREAD POST] Blocked: No identifier found (userId/user_id)');
    return res.status(400).json({ error: 'User ID is required to post' });
  }

  try {
    const pool = await getPool();

    // FETCH THE POSTER'S METADATA from the users table automatically
    const userResult = await pool.request()
      .input('uId', sql.Int, userId)
      .query('SELECT name, role FROM users WHERE id = @uId');

    const employeeName = userResult.recordset.length > 0 ? userResult.recordset[0].name : 'Unknown User';
    const postRole = userResult.recordset.length > 0 ? userResult.recordset[0].role : 'employee';

    await pool.request()
      .input('userId', sql.Int, userId)
      .input('name', sql.NVarChar, employeeName)
      .input('role', sql.NVarChar, postRole)
      .input('content', sql.NVarChar(sql.MAX), content || null)
      .input('mediaUrl', sql.NVarChar(sql.MAX), mediaUrl || null)
      .input('mediaType', sql.NVarChar(50), mediaType || 'image')
      .query(`
        INSERT INTO threads (user_id, employee_name, role, content, media_url, media_type, created_at)
        VALUES (@userId, @name, @role, @content, @mediaUrl, @mediaType, DATEADD(MINUTE, 330, GETUTCDATE()))
      `);

    console.log(`[THREAD POST] Success: Post created for ${employeeName} (${postRole}) with media: ${mediaUrl ? 'YES' : 'NO'}`);
    res.status(201).json({ message: 'Thread published successfully' });
  } catch (err) {
    console.error('[THREAD POST ERROR]:', err);
    res.status(500).json({ error: 'Failed to publish thread' });
  }
});

// 2. Fetch all Threads (Unified Social Feed - Migrated to Infinite Load)
app.get('/api/threads', async (req, res) => {
  // Enhanced viewer detection: Try query params first, then fallback to JWT token
  const authHeader = req.headers['authorization'];
  let tokenViewerId = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');
      tokenViewerId = decoded.id;
    } catch (e) {
      // Token expired or invalid - proceed as guest
    }
  }

  const viewerId = sanitizeNumericId(req.query.userId || req.query.user_id || req.query.viewerId || tokenViewerId);
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, limit);

    let query = `
      WITH PagedThreads AS (
        SELECT t.id, t.user_id, t.employee_name, t.role, t.tagline, t.content, t.media_url, t.media_type, t.created_at,
               t.likes_count as likes, t.heart_count as heartCount, t.thumbsup_count as thumbsupCount, 
               t.shocked_count as shockedCount, t.laugh_count as laughCount, t.fire_count as fireCount, 
               t.clap_count as clapCount, t.cake_count as cakeCount, t.comments_count as comments,
               u.name as uName, u.role as uRole
        FROM threads t WITH (NOLOCK)
        JOIN users u WITH (NOLOCK) ON t.user_id = u.id
        ORDER BY t.created_at DESC
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      )
      SELECT pt.*,
             ISNULL(pt.employee_name, pt.uName) as authorName, 
             ISNULL(pt.role, pt.uRole) as authorRole,
             (SELECT STRING_AGG(employee_name, ', ') FROM (SELECT TOP 3 employee_name FROM thread_reactions WITH (NOLOCK) WHERE thread_id = pt.id ORDER BY created_at DESC) as r) as recentReactors
    `;

    if (viewerId) {
      query += `, (SELECT STRING_AGG(reaction_type, ',') FROM thread_reactions WITH (NOLOCK) WHERE thread_id = pt.id AND user_id = @viewerId) as userReactionTypes `;
      request.input('viewerId', sql.Int, viewerId);
    }

    query += ` FROM PagedThreads pt ORDER BY pt.created_at DESC `;

    const result = await request.query(query);

    // Using shared normalizeImage utility

    const feed = result.recordset.map(row => {
      // Lazy load URL instead of 6MB base64 blob
      const pfp = `/api/users/${row.user_id}/photo`;
      const userTypes = row.userReactionTypes ? row.userReactionTypes.split(',') : [];

      const totalReactions = (row.heartCount || 0) + (row.thumbsupCount || 0) + (row.shockedCount || 0) +
        (row.laughCount || 0) + (row.fireCount || 0) + (row.clapCount || 0) +
        (row.cakeCount || 0) + (row.likes || 0);

      const reactions = {
        total: totalReactions,
        heart: row.heartCount || 0,
        thumbsup: row.thumbsupCount || 0,
        shocked: row.shockedCount || 0,
        laugh: row.laughCount || 0,
        fire: row.fireCount || 0,
        clap: row.clapCount || 0,
        cake: row.cakeCount || 0,
        like: row.likes || 0
      };

      // Create emoji-mapped objects for standard frontend compatibility
      const emojiReactions = {};
      const emojiUserReactions = {};
      Object.keys(emojiMap).forEach(key => {
        const emoji = emojiMap[key];
        emojiReactions[emoji] = reactions[key] || 0;
        emojiUserReactions[emoji] = userTypes.includes(key);
      });

      return {
        id: row.id,
        userId: row.user_id,
        content: row.content,
        // Lazy load Thread Media URL instead of 3MB base64 blob
        media_url: row.media_url ? `/api/threads/${row.id}/media` : null,
        media_type: row.media_type,
        media: row.media_url ? { url: `/api/threads/${row.id}/media`, type: row.media_type } : null,
        timestamp: row.created_at,
        createdAt: row.created_at,
        time: row.created_at,
        created_at: row.created_at,
        author: {
          id: row.user_id,
          name: row.authorName,
          role: row.authorRole,
          picture: pfp
        },
        // Legacy compatibility fields (top-level)
        name: row.authorName,
        userName: row.authorName,
        displayName: row.authorName,
        designation: row.authorRole,
        role: row.authorRole,
        profilePicture: pfp,
        profile_picture: pfp,
        profile_image: pfp,
        avatar: pfp,
        tagline: row.tagline,
        reactions: { ...emojiReactions, total: totalReactions },
        user_reactions: emojiUserReactions,
        likeCount: row.likes || 0,
        totalReactions: totalReactions,
        likes_count: row.likes || 0,
        heart_count: row.heartCount || 0,
        thumbsup_count: row.thumbsupCount || 0,
        shocked_count: row.shockedCount || 0,
        laugh_count: row.laughCount || 0,
        fire_count: row.fireCount || 0,
        clap_count: row.clapCount || 0,
        cake_count: row.cakeCount || 0,
        comments: row.comments,
        recentReactors: row.recentReactors,
        userHasLiked: userTypes.includes('like'),
        userReaction: userTypes[0] || null,
        userReactionTypes: userTypes,
        rawReactions: reactions
      };
    });

    res.json(feed);
  } catch (err) {
    console.error('Feed fetch failed:', err);
    res.status(500).json({ error: 'Failed to extract social feed' });
  }
});


// 3. React to a Thread (Switch or Toggle Reaction)
const handleReaction = async (req, res) => {
  const { id } = req.params;
  const payload = req.body;

  // 1. Robust User ID Extraction (Payload -> Query -> JWT Token)
  const authHeader = req.headers['authorization'];
  let tokenUserId = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');
      tokenUserId = decoded.id;
    } catch (e) { }
  }

  const userId = payload.userId || payload.user_id || payload.employeeId || payload.employee_id || req.query.userId || tokenUserId;

  // 2. Normalizing Reaction Type (Emoji to Text Mapping)
  const rawType = payload.reactionType || payload.reaction_type || payload.type || payload.reaction || payload.icon || payload.label || req.query.reactionType;

  console.log(`[REACTIONS DEBUG] Thread: ${id}, User: ${userId}, RawType: ${rawType}`);

  if (!userId) return res.status(400).json({ error: 'User ID required for social interaction' });

  // Map literal emojis OR common names to standardized database strings
  const reactionMap = {
    '❤️': 'heart', 'heart': 'heart', 'love': 'heart',
    '👍': 'like', 'thumbsup': 'like', 'thumb': 'like', 'like': 'like',
    '😮': 'shocked', 'shocked': 'shocked', 'wow': 'shocked',
    '😂': 'laugh', 'laugh': 'laugh', 'haha': 'laugh',
    '🔥': 'fire', 'fire': 'fire', 'lit': 'fire',
    '👏': 'clap', 'clap': 'clap', 'clapping': 'clap',
    '🎂': 'cake', 'cake': 'cake', 'birthday': 'cake'
  };

  const rType = reactionMap[rawType] || rawType || 'heart';

  // Map standardized reaction types to their respective database column names
  const columnMap = {
    heart: 'heart_count',
    like: 'likes_count',
    shocked: 'shocked_count',
    laugh: 'laugh_count',
    fire: 'fire_count',
    clap: 'clap_count',
    cake: 'cake_count'
  };

  const targetColumn = columnMap[rType];

  try {
    const pool = await getPool();

    // FETCH THE REACTOR'S METADATA (checking both tables)
    let employeeName = 'Unknown User';
    let userRole = 'employee';

    const userResult = await pool.request()
      .input('uId', sql.Int, userId)
      .query('SELECT name, role FROM users WHERE id = @uId');

    if (userResult.recordset.length > 0) {
      employeeName = userResult.recordset[0].name;
      userRole = userResult.recordset[0].role;
    } else {
      const joineeResult = await pool.request()
        .input('uId', sql.Int, userId)
        .query('SELECT name, role FROM new_joinees WHERE id = @uId');
      if (joineeResult.recordset.length > 0) {
        employeeName = joineeResult.recordset[0].name;
        userRole = joineeResult.recordset[0].role;
      }
    }

    // 1. Check if user already has THIS EXACT reaction on this thread
    const check = await pool.request()
      .input('threadId', sql.Int, id)
      .input('userId', sql.Int, userId)
      .input('type', sql.NVarChar(50), rType)
      .query('SELECT id FROM thread_reactions WHERE thread_id = @threadId AND user_id = @userId AND reaction_type = @type');

    if (check.recordset.length > 0) {
      // Toggle Off
      await pool.request()
        .input('threadId', sql.Int, id)
        .input('userId', sql.Int, userId)
        .input('type', sql.NVarChar(50), rType)
        .query('DELETE FROM thread_reactions WHERE thread_id = @threadId AND user_id = @userId AND reaction_type = @type');

      if (targetColumn) {
        await pool.request()
          .input('threadId', sql.Int, id)
          .query(`UPDATE threads SET ${targetColumn} = CASE WHEN ${targetColumn} > 0 THEN ${targetColumn} - 1 ELSE 0 END WHERE id = @threadId`);
      }

      const countRes = await pool.request()
        .input('threadId', sql.Int, id)
        .input('type', sql.NVarChar(50), rType)
        .query('SELECT COUNT(*) as count FROM thread_reactions WHERE thread_id = @threadId AND reaction_type = @type');

      const threadRes = await pool.request()
        .input('tid', sql.Int, id)
        .query('SELECT likes_count, heart_count, thumbsup_count, shocked_count, laugh_count, fire_count, clap_count, cake_count FROM threads WHERE id = @tid');

      const t = threadRes.recordset[0];
      const newTotal = (t.likes_count || 0) + (t.heart_count || 0) + (t.thumbsup_count || 0) + (t.shocked_count || 0) + (t.laugh_count || 0) + (t.fire_count || 0) + (t.clap_count || 0) + (t.cake_count || 0);

      console.log(`[REACTION] User ${userId} unliked ${rType} on thread ${id}`);
      return res.json({
        message: 'Reaction removed',
        type: 'removed',
        reactionType: rType,
        count: countRes.recordset[0].count,
        totalCount: newTotal,
        userHasLiked: false
      });
    } else {
      // Toggle On
      await pool.request()
        .input('threadId', sql.Int, id)
        .input('userId', sql.Int, userId)
        .input('name', sql.NVarChar, employeeName)
        .input('role', sql.NVarChar, userRole)
        .input('type', sql.NVarChar(50), rType)
        .query('INSERT INTO thread_reactions (thread_id, user_id, employee_name, role, reaction_type, created_at) VALUES (@threadId, @userId, @name, @role, @type, DATEADD(MINUTE, 330, GETUTCDATE()))');

      if (targetColumn) {
        await pool.request()
          .input('threadId', sql.Int, id)
          .query(`UPDATE threads SET ${targetColumn} = ${targetColumn} + 1 WHERE id = @threadId`);
      }

      const countRes = await pool.request()
        .input('threadId', sql.Int, id)
        .input('type', sql.NVarChar(50), rType)
        .query('SELECT COUNT(*) as count FROM thread_reactions WHERE thread_id = @threadId AND reaction_type = @type');

      const threadRes = await pool.request()
        .input('tid', sql.Int, id)
        .query('SELECT likes_count, heart_count, thumbsup_count, shocked_count, laugh_count, fire_count, clap_count, cake_count FROM threads WHERE id = @tid');

      const t = threadRes.recordset[0];
      const newTotal = (t.likes_count || 0) + (t.heart_count || 0) + (t.thumbsup_count || 0) + (t.shocked_count || 0) + (t.laugh_count || 0) + (t.fire_count || 0) + (t.clap_count || 0) + (t.cake_count || 0);

      console.log(`[REACTION] User ${userId} reacted with ${rType} on thread ${id}`);
      return res.json({
        message: 'Thread reacted',
        type: rType,
        reactionType: rType,
        count: countRes.recordset[0].count,
        totalCount: newTotal,
        userHasLiked: true
      });
    }
  } catch (err) {
    console.error('Social reaction failure:', err);
    res.status(500).json({ error: 'Failed to process community interaction' });
  }
};



app.post('/api/threads/:id/react', handleReaction);
app.put('/api/threads/:id/react', handleReaction);
app.post('/api/threads/:id/like', handleReaction);
app.put('/api/threads/:id/like', handleReaction);

// 4. Add Comment to a Thread
app.post('/api/threads/:id/comment', async (req, res) => {
  const { id } = req.params;
  const userId = req.body.userId || req.body.user_id;
  const commentText = req.body.comment || req.body.text || req.body.content;

  if (!userId || !commentText) return res.status(400).json({ error: 'User ID and comment text are required' });

  try {
    const pool = await getPool();

    // FETCH THE COMMENTER'S METADATA automatically (checking both tables)
    let employeeName = 'Unknown User';
    let userRole = 'employee';

    const userResult = await pool.request()
      .input('uId', sql.Int, userId)
      .query('SELECT name, role FROM users WHERE id = @uId');

    if (userResult.recordset.length > 0) {
      employeeName = userResult.recordset[0].name;
      userRole = userResult.recordset[0].role;
    } else {
      // Fallback: Check new_joinees table
      const joineeResult = await pool.request()
        .input('uId', sql.Int, userId)
        .query('SELECT name, role FROM new_joinees WHERE id = @uId');
      if (joineeResult.recordset.length > 0) {
        employeeName = joineeResult.recordset[0].name;
        userRole = joineeResult.recordset[0].role;
      }
    }

    await pool.request()
      .input('threadId', sql.Int, id)
      .input('userId', sql.Int, userId)
      .input('name', sql.NVarChar, employeeName)
      .input('role', sql.NVarChar, userRole)
      .input('comment', sql.NVarChar(sql.MAX), commentText)
      .query('INSERT INTO thread_comments (thread_id, user_id, employee_name, role, comment, created_at) VALUES (@threadId, @userId, @name, @role, @comment, DATEADD(MINUTE, 330, GETUTCDATE()))');

    // Atomic increment of comments_count
    await pool.request().input('tid', sql.Int, id).query('UPDATE threads SET comments_count = comments_count + 1 WHERE id = @tid');
    res.status(201).json({ message: 'Comment posted successfully' });
  } catch (err) {
    console.error('Comment failed:', err);
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

// 5. Get Comments for a specific Thread
app.get('/api/threads/:id/comments', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('threadId', sql.Int, id)
      .query(`
      SELECT c.id, c.comment, 
             c.created_at as created_at, 
             ISNULL(c.employee_name, u.name) as userName, 
             ISNULL(c.role, u.role) as userRole,
             e.designation as userDesignation,
             u.profile_picture as userPicture
      FROM thread_comments c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN employee e ON u.id = e.user_id
      WHERE c.thread_id = @threadId
      ORDER BY c.created_at ASC
    `);

    const mappedComments = result.recordset.map(row => {
      const pfp = normalizeImage(row.userPicture);
      return {
        ...row,
        designation: row.userRole || row.userDesignation || 'employee',
        role: row.userRole || row.userDesignation || 'employee',
        profilePicture: pfp,
        profile_picture: pfp,
        profile_image: pfp,
        avatar: pfp
      };
    });
    res.json(mappedComments);
  } catch (err) {
    console.error('Fetch comments failed:', err);
    res.status(500).json({ error: 'Failed to fetch comment stream' });
  }
});

// 5.1 Edit a Comment
app.put('/api/threads/:threadId/comments/:commentId', async (req, res) => {
  const { threadId, commentId } = req.params;
  const userId = req.body.userId || req.body.user_id || req.body.employeeId || req.body.employee_id;
  const commentText = req.body.comment || req.body.text || req.body.content;

  if (!userId || !commentText) return res.status(400).json({ error: 'User ID and comment text are required' });

  try {
    const pool = await getPool();
    // Verify ownership
    const checkResult = await pool.request()
      .input('id', sql.Int, commentId)
      .query('SELECT user_id FROM thread_comments WHERE id = @id');

    if (checkResult.recordset.length === 0) return res.status(404).json({ error: 'Comment not found' });
    if (checkResult.recordset[0].user_id.toString() !== String(userId)) {
      return res.status(403).json({ error: 'Unauthorized: Can only modify your own comments' });
    }

    await pool.request()
      .input('id', sql.Int, commentId)
      .input('comment', sql.NVarChar(sql.MAX), commentText)
      .query('UPDATE thread_comments SET comment = @comment WHERE id = @id');

    res.json({ message: 'Comment updated successfully' });
  } catch (err) {
    console.error('Comment update failed:', err);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

// 5.2 Delete a Comment
app.delete('/api/threads/:threadId/comments/:commentId', async (req, res) => {
  const { threadId, commentId } = req.params;
  const userId = req.body.userId || req.body.user_id || req.query.userId || req.query.user_id;

  if (!userId) return res.status(400).json({ error: 'User ID is required to verify ownership' });

  try {
    const pool = await getPool();
    // Verify ownership
    const checkResult = await pool.request()
      .input('id', sql.Int, commentId)
      .query('SELECT user_id FROM thread_comments WHERE id = @id');

    if (checkResult.recordset.length === 0) return res.status(404).json({ error: 'Comment not found' });
    if (checkResult.recordset[0].user_id.toString() !== String(userId)) {
      return res.status(403).json({ error: 'Unauthorized: Can only delete your own comments' });
    }

    await pool.request()
      .input('id', sql.Int, commentId)
      .query('DELETE FROM thread_comments WHERE id = @id');

    // Atomic decrement of comments_count
    await pool.request().input('tid', sql.Int, threadId).query('UPDATE threads SET comments_count = CASE WHEN comments_count > 0 THEN comments_count - 1 ELSE 0 END WHERE id = @tid');

    res.json({ message: 'Comment deleted successfully' });
  } catch (err) {
    console.error('Comment deletion failed:', err);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// 6. Fetch a Single Thread (Deep-link view)
app.get('/api/threads/:id', async (req, res) => {
  const { id } = req.params;

  // Enhanced viewer detection: Try query params first, then fallback to JWT token
  const authHeader = req.headers['authorization'];
  let tokenViewerId = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');
      tokenViewerId = decoded.id;
    } catch (e) { }
  }
  const viewerId = sanitizeNumericId(req.query.userId || req.query.user_id || req.query.viewerId || tokenViewerId);

  try {
    const pool = await getPool();
    const request = pool.request().input('threadId', sql.Int, id);

    let query = `
        SELECT t.*, 
               t.created_at as created_at,
               ISNULL(t.employee_name, u.name) as authorName, 
               ISNULL(t.role, u.role) as authorRole,
               u.role as dbRole,
               t.likes_count as likes, 
               t.heart_count as heartCount, 
               t.thumbsup_count as thumbsupCount, 
               t.shocked_count as shockedCount, 
               t.laugh_count as laughCount, 
               t.fire_count as fireCount, 
               t.clap_count as clapCount, 
               t.cake_count as cakeCount,
               t.comments_count as comments
    `;

    if (viewerId) {
      query += `, (SELECT STRING_AGG(reaction_type, ',') FROM thread_reactions WHERE thread_id = t.id AND user_id = @viewerId) as userReactionTypes `;
      request.input('viewerId', sql.Int, viewerId);
    }

    query += `
        FROM threads t
        JOIN users u ON t.user_id = u.id
        WHERE t.id = @threadId
    `;

    const result = await request.query(query);

    if (result.recordset.length === 0) return res.status(404).json({ error: 'Thread not found' });

    // Fetch detailed reactor list for this specific thread
    const reactorResult = await pool.request()
      .input('threadId', sql.Int, id)
      .query(`
        SELECT DISTINCT user_id, employee_name as name, role, reaction_type as type 
        FROM thread_reactions 
        WHERE thread_id = @threadId 
        ORDER BY name ASC
      `);

    // Aggregate metadata
    const thread = result.recordset[0];
    // Lazy load URL instead of large blob
    const pfp = `/api/users/${thread.user_id}/photo`;
    const userTypes = thread.userReactionTypes ? thread.userReactionTypes.split(',') : [];

    const totalReactions = (thread.heartCount || 0) + (thread.thumbsupCount || 0) + (thread.shockedCount || 0) +
      (thread.laughCount || 0) + (thread.fireCount || 0) + (thread.clapCount || 0) +
      (thread.cakeCount || 0) + (thread.likes || 0);

    const baseReactions = {
      total: totalReactions,
      heart: thread.heartCount || 0,
      thumbsup: thread.thumbsupCount || 0,
      shocked: thread.shockedCount || 0,
      laugh: thread.laughCount || 0,
      fire: thread.fireCount || 0,
      clap: thread.clapCount || 0,
      cake: thread.cakeCount || 0,
      like: thread.likes || 0
    };

    const emojiReactions = {};
    const emojiUserReactions = {};
    Object.keys(emojiMap).forEach(key => {
      const emoji = emojiMap[key];
      emojiReactions[emoji] = baseReactions[key] || 0;
      emojiUserReactions[emoji] = userTypes.includes(key);
    });

    res.json({
      id: thread.id,
      userId: thread.user_id,
      content: thread.content,
      // Lazy load Thread Media URL instead of 3MB base64 blob
      media_url: thread.media_url ? `/api/threads/${thread.id}/media` : null,
      media_type: thread.media_type,
      media: thread.media_url ? { url: `/api/threads/${thread.id}/media`, type: thread.media_type } : null,
      timestamp: thread.created_at,
      author: {
        id: thread.user_id,
        name: thread.authorName,
        role: thread.authorRole,
        picture: pfp
      },
      // Legacy compatibility fields (top-level)
      name: thread.authorName,
      userName: thread.authorName,
      displayName: thread.authorName,
      designation: thread.authorRole,
      role: thread.authorRole,
      profilePicture: pfp,
      profile_picture: pfp,
      profile_image: pfp,
      avatar: pfp,
      tagline: thread.tagline,
      reactions: { ...emojiReactions, total: totalReactions },
      user_reactions: emojiUserReactions,
      likeCount: thread.likes || 0,
      totalReactions: totalReactions,
      likes_count: thread.likes || 0,
      heart_count: thread.heartCount || 0,
      thumbsup_count: thread.thumbsupCount || 0,
      shocked_count: thread.shockedCount || 0,
      laugh_count: thread.laughCount || 0,
      fire_count: thread.fireCount || 0,
      clap_count: thread.clapCount || 0,
      cake_count: thread.cakeCount || 0,
      comments: thread.comments,
      userHasLiked: userTypes.includes('like'),
      userReaction: userTypes[0] || null,
      userReactionTypes: userTypes,
      reactorList: reactorResult.recordset,
      rawReactions: baseReactions
    });
  } catch (err) {
    console.error('Single thread fetch failed:', err);
    res.status(500).json({ error: 'Failed to retrieve project record' });
  }
});


// 6B. Fetch Reactor List (by specific type)
app.get('/api/threads/:id/reactors', async (req, res) => {
  const { id } = req.params;
  const rawType = req.query.type || req.query.reaction;

  if (!id) return res.status(400).json({ error: 'Thread ID required' });

  // Reaction normalization map (consistent with handleReaction)
  const reactionMap = {
    'â¤ï¸': 'heart', 'heart': 'heart', 'love': 'heart',
    'ðŸ‘': 'like', 'thumbsup': 'like', 'thumb': 'like', 'like': 'like',
    'ðŸ˜®': 'shocked', 'shocked': 'shocked', 'wow': 'shocked',
    'ðŸ˜‚': 'laugh', 'laugh': 'laugh', 'haha': 'laugh',
    'ðŸ”¥': 'fire', 'fire': 'fire', 'lit': 'fire',
    'ðŸ‘': 'clap', 'clap': 'clap', 'clapping': 'clap',
    'ðŸŽ‚': 'cake', 'cake': 'cake', 'birthday': 'cake'
  };

  const normalizedType = rawType ? (reactionMap[rawType] || rawType) : null;

  try {
    const pool = await getPool();
    const request = pool.request().input('threadId', sql.Int, id);

    let query = `
      SELECT DISTINCT u.id, u.name, u.role, u.profile_picture
      FROM thread_reactions r
      JOIN users u ON r.user_id = u.id
      WHERE r.thread_id = @threadId
    `;

    if (normalizedType) {
      query += ` AND r.reaction_type = @type`;
      request.input('type', sql.NVarChar, normalizedType);
    }

    query += ` ORDER BY u.name ASC`;

    const result = await request.query(query);

    const normalizeImage = (img) => {
      if (!img) return null;
      if (typeof img !== 'string') return img;
      if (img.startsWith('data:') || img.startsWith('http') || img.startsWith('/')) return img;
      if (img.startsWith('GgoAAAANSUhEUg')) return `data:image/png;base64,iVBORw0KGgo${img}`;
      return `data:image/png;base64,${img}`;
    };

    const formattedReactors = result.recordset.map(r => ({
      id: r.id,
      name: r.name,
      role: r.role,
      profile_image: normalizeImage(r.profile_picture),
      profile_picture: normalizeImage(r.profile_picture),
      profilePicture: normalizeImage(r.profile_picture)
    }));

    res.json(formattedReactors);
  } catch (err) {
    console.error('Reactor list fetch failed:', err);
    res.status(500).json({ error: 'Failed to retrieve reactor list' });
  }
});

// 7. Fetch all threads posted by a specific user (Profile Feed)
app.get('/api/threads/user/:userId', async (req, res) => {
  const userId = sanitizeNumericId(req.params.userId);
  const viewerId = sanitizeNumericId(req.query.viewerId || req.query.userId || req.query.user_id);

  try {
    const pool = await getPool();
    const request = pool.request().input('userId', sql.Int, userId);

    let query = `
        SELECT t.id, t.content, t.media_url, t.media_type, 
               t.created_at as created_at, t.tagline,
               ISNULL(t.employee_name, u.name) as authorName, 
               ISNULL(t.role, u.role) as authorRole,
               u.profile_picture as authorPicture,
               (SELECT COUNT(*) FROM thread_reactions WHERE thread_id = t.id AND reaction_type = 'like') as likes,
               (SELECT COUNT(*) FROM thread_reactions WHERE thread_id = t.id AND reaction_type = 'heart') as heartCount,
               (SELECT COUNT(*) FROM thread_reactions WHERE thread_id = t.id AND reaction_type = 'thumbsup') as thumbsupCount,
               (SELECT COUNT(*) FROM thread_reactions WHERE thread_id = t.id AND reaction_type = 'shocked') as shockedCount,
               (SELECT COUNT(*) FROM thread_reactions WHERE thread_id = t.id AND reaction_type = 'laugh') as laughCount,
               (SELECT COUNT(*) FROM thread_reactions WHERE thread_id = t.id AND reaction_type = 'fire') as fireCount,
               (SELECT COUNT(*) FROM thread_reactions WHERE thread_id = t.id AND reaction_type = 'clap') as clapCount,
               (SELECT COUNT(*) FROM thread_reactions WHERE thread_id = t.id AND reaction_type = 'cake') as cakeCount,
               (SELECT COUNT(*) FROM thread_comments WHERE thread_id = t.id) as comments
    `;

    if (viewerId) {
      query += `, (SELECT STRING_AGG(reaction_type, ',') FROM thread_reactions WHERE thread_id = t.id AND user_id = @viewerId) as userReactionTypes `;
      request.input('viewerId', sql.Int, viewerId);
    }

    query += `
        FROM threads t
        JOIN users u ON t.user_id = u.id
        WHERE t.user_id = @userId
        ORDER BY t.created_at DESC
    `;

    const result = await request.query(query);

    // Using shared normalizeImage utility

    const userPosts = result.recordset.map(row => {
      const pfp = normalizeImage(row.authorPicture);
      const userTypes = row.userReactionTypes ? row.userReactionTypes.split(',') : [];

      const baseReactions = {
        total: row.heartCount + row.thumbsupCount + row.shockedCount + row.laughCount + row.fireCount + row.clapCount + row.cakeCount + row.likes,
        heart: row.heartCount,
        thumbsup: row.thumbsupCount,
        shocked: row.shockedCount,
        laugh: row.laughCount,
        fire: row.fireCount,
        clap: row.clapCount,
        cake: row.cakeCount,
        like: row.likes
      };

      const emojiReactions = {};
      const emojiUserReactions = {};
      Object.keys(emojiMap).forEach(key => {
        const emoji = emojiMap[key];
        emojiReactions[emoji] = baseReactions[key] || 0;
        emojiUserReactions[emoji] = userTypes.includes(key);
      });

      return {
        ...row,
        name: row.authorName,
        userName: row.authorName,
        displayName: row.authorName,
        designation: row.authorRole,
        role: row.authorRole,
        profilePicture: pfp,
        profile_picture: pfp,
        profile_image: pfp,
        avatar: pfp,
        tagline: row.tagline,
        likeCount: row.likes,
        userHasLiked: userTypes.includes('like'),
        userReaction: userTypes[0] || null,
        userReactionTypes: userTypes,
        reactions: emojiReactions,
        user_reactions: emojiUserReactions,
        rawReactions: baseReactions
      };
    });
    res.json(userPosts);
  } catch (err) {
    console.error('User thread fetch failed:', err);
    res.status(500).json({ error: 'Failed to extract personal community feed' });
  }
});


// 7.1 Edit a Thread
app.put('/api/threads/:id', memoryUpload.single('media'), async (req, res) => {
  const { id } = req.params;
  const userId = req.body.userId || req.body.user_id || req.body.employeeId || req.body.employee_id;
  const content = req.body.content || req.body.text || req.body.description;
  const tagline = req.body.tagline || '';

  if (!userId) return res.status(400).json({ error: 'User ID is required to verify ownership before editing' });

  try {
    const pool = await getPool();
    // 1. Verify ownership before editing
    const checkResult = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT user_id, media_url, media_type FROM threads WHERE id = @id');

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    if (checkResult.recordset[0].user_id.toString() !== String(userId)) {
      return res.status(403).json({ error: 'Unauthorized: Can only modify your own threads' });
    }

    let mediaUrl = checkResult.recordset[0].media_url;
    let mediaType = checkResult.recordset[0].media_type;

    if (req.file) {
      // MIGRATE: Upload to Google Drive instead of local disk
      mediaUrl = await safeUploadToDrive(req.file);
      mediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
    } else if (req.body.mediaUrl) {
      mediaUrl = req.body.mediaUrl;
      mediaType = req.body.mediaType || 'image';
    }

    await pool.request()
      .input('threadId', sql.Int, id)
      .input('content', sql.NVarChar(sql.MAX), content || '')
      .input('tagline', sql.NVarChar, tagline)
      .input('mediaUrl', sql.NVarChar(sql.MAX), mediaUrl)
      .input('mediaType', sql.NVarChar(50), mediaType)
      .query('UPDATE threads SET content = @content, tagline = @tagline, media_url = @mediaUrl, media_type = @mediaType WHERE id = @threadId');

    res.json({ success: true, message: 'Thread updated successfully', mediaUrl, mediaType });
  } catch (err) {
    console.error('Thread update failed:', err);
    res.status(500).json({ error: 'Failed to synchronize update request' });
  }
});

// 8. Delete a Thread (Self-management)
app.delete('/api/threads/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.body.userId || req.body.user_id || req.query.userId || req.query.user_id;

  if (!userId) return res.status(400).json({ error: 'User ID is required to verify ownership before deletion' });

  try {
    const pool = await getPool();

    // 1. Verify ownership before deletion
    const checkResult = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT user_id FROM threads WHERE id = @id');

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    if (checkResult.recordset[0].user_id.toString() !== String(userId)) {
      return res.status(403).json({ error: 'Unauthorized: Can only delete your own threads' });
    }

    await pool.request()
      .input('threadId', sql.Int, id)
      .query('DELETE FROM threads WHERE id = @threadId');
    res.json({ success: true, message: 'Thread removed from the matrix' });
  } catch (err) {
    console.error('Deletion failed:', err);
    res.status(500).json({ error: 'Failed to synchronize deletion request' });
  }
});

// --- END SOCIAL THREADS SYSTEM --- //
// 25. New Joinee Onboarding System (Migrated to Infinite Load)
app.get('/api/new-joinees', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, limit)
      .query(`
        SELECT id, name, role, email_id, hired_by, password, joining_date, course_completion, is_blocked, block_reason, created_at 
        FROM new_joinees WITH (NOLOCK) 
        ORDER BY joining_date DESC
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('New joinee fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch new joinees' });
  }
});

app.post('/api/new-joinees', async (req, res) => {
  const { name, role, email, emailId, email_id, joiningDate, courseCompletion, hiredBy, hired_by, password } = req.body;
  const finalEmail = email || emailId || email_id || req.body.Email || null;
  const finalHiredBy = hiredBy || hired_by || null;
  const finalPassword = password || 'Nbt@123';
  try {
    const pool = await getPool();
    await pool.request()
      .input('name', sql.NVarChar, name)
      .input('role', sql.NVarChar, role)
      .input('emailId', sql.NVarChar, finalEmail)
      .input('joiningDate', sql.Date, joiningDate)
      .input('courseCompletion', sql.Int, courseCompletion)
      .input('hiredBy', sql.NVarChar, finalHiredBy)
      .input('password', sql.NVarChar, finalPassword)
      .query('INSERT INTO new_joinees (name, role, email_id, joining_date, course_completion, hired_by, password) VALUES (@name, @role, @emailId, @joiningDate, @courseCompletion, @hiredBy, @password)');
    res.json({ message: 'New joinee recorded successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add new joinee' });
  }
});

// GET: Fetch detailed profile for a specific joinee
app.get('/api/new-joinees/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT *, (SELECT COUNT(*) FROM newjoinee_courses WITH (NOLOCK)) as total_courses FROM new_joinees WITH (NOLOCK) WHERE id = @id');

    if (result.recordset.length === 0) return res.status(404).json({ error: 'Joinee not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to extract joinee profile details' });
  }
});

// Helper Function: Re-calculate and update joinee course completion status
const syncJoineeOnboardingProgress = async (joineeId) => {
  try {
    const pool = await getPool();
    const statsResult = await pool.request()
      .input('jid', sql.Int, joineeId)
      .query(`
        DECLARE @totalCourses INT = (SELECT COUNT(*) FROM newjoinee_courses WITH (NOLOCK));
        DECLARE @completedCourses INT = (
          SELECT COUNT(*) FROM joinee_course_progress WITH (NOLOCK) 
          WHERE joinee_id = @jid AND is_completed = 1
        );
        SELECT @totalCourses as total, @completedCourses as completed;
      `);

    const { total, completed } = statsResult.recordset[0];
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    await pool.request()
      .input('jid', sql.Int, joineeId)
      .input('perc', sql.Int, percentage)
      .query('UPDATE new_joinees SET course_completion = @perc WHERE id = @jid');

    console.log(`[SYNC] Joinee ${joineeId} progress updated to ${percentage}%`);
    return percentage;
  } catch (err) {
    console.error(`[SYNC ERROR] Failed to update progress for joinee ${joineeId}:`, err);
    throw err;
  }
};

// POST: Trigger manual synchronization of progress for a joinee
app.post('/api/new-joinees/sync-progress/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const newPerc = await syncJoineeOnboardingProgress(id);
    res.json({ success: true, message: 'Sync complete', new_percentage: newPerc });
  } catch (err) {
    res.status(500).json({ error: 'Synchronization failed', details: err.message });
  }
});

// Helper Function: Audit a joinee for deadline compliance
const auditJoineeCompliance = async (joineeId) => {
  try {
    const pool = await getPool();

    // 1. Fetch Joinee Context (Joining Date, Current Progress, and Block Status)
    const joineeStatusResult = await pool.request()
      .input('jid', sql.Int, joineeId)
      .query('SELECT joining_date, course_completion, is_blocked FROM new_joinees WITH (NOLOCK) WHERE id = @jid');

    if (joineeStatusResult.recordset.length === 0) return { error: 'Joinee not found' };

    const { joining_date, course_completion, is_blocked: wasAlreadyBlocked } = joineeStatusResult.recordset[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const joiningDate = new Date(joining_date);
    joiningDate.setHours(0, 0, 0, 0);

    // Calculate Grace Period Expiry (Joining Date + 10 Days)
    const gracePeriodExpiry = new Date(joiningDate);
    gracePeriodExpiry.setDate(gracePeriodExpiry.getDate() + 10);

    let isOverdue = false;
    let reason = '';

    // RULE: If more than 10 days since joining and progress is less than 100% -> BLOCK
    if (today > gracePeriodExpiry && course_completion < 100) {
      isOverdue = true;
      reason = `Blocked: 10-day onboarding window expired (Joined on ${joiningDate.toISOString().split('T')[0]}, required completion by ${gracePeriodExpiry.toISOString().split('T')[0]}). Progress: ${course_completion}%`;
    }
    // FALLBACK: Also check for any individual course deadlines that have passed (Secondary safety check)
    else {
      const overdueCoursesResult = await pool.request()
        .input('jid', sql.Int, joineeId)
        .query(`
          SELECT COUNT(*) as count 
          FROM newjoinee_courses c WITH (NOLOCK)
          WHERE c.deadline < CAST(DATEADD(MINUTE, 330, GETUTCDATE()) AS DATE)
            AND NOT EXISTS (
              SELECT 1 FROM joinee_course_progress p WITH (NOLOCK)
              WHERE p.course_id = c.id AND p.joinee_id = @jid AND p.is_completed = 1
            )
        `);

      const count = overdueCoursesResult.recordset[0].count;
      if (count > 0) {
        isOverdue = true;
        reason = `Blocked due to ${count} specific course(s) passing their individual deadlines.`;
      }
    }

    if (isOverdue) {
      await pool.request()
        .input('jid', sql.Int, joineeId)
        .input('reason', sql.NVarChar, reason)
        .query('UPDATE new_joinees SET is_blocked = 1, block_reason = @reason WHERE id = @jid');

      console.log(`[COMPLIANCE] Joinee ${joineeId} has been BLOCKED. Reason: ${reason}`);

      // TRIGGER NOTIFICATIONS if newly blocked
      if (!wasAlreadyBlocked) {
        await createComplianceNotification(joineeId, reason);
      }
      return { blocked: true, reason };
    } else {
      return { blocked: false, count: 0 };
    }
  } catch (err) {
    console.error(`[AUDIT ERROR] Joinee ${joineeId}:`, err);
    throw err;
  }
};

// Helper: Create notifications for HR, Admins and Manager (OPTIMIZED: Batch INSERT)
const createComplianceNotification = async (joineeId, reason) => {
  try {
    const pool = await getPool();
    // Single query: Fetch joinee info + HR users + Manager in one go
    const joineeResult = await pool.request().input('id', sql.Int, joineeId).query('SELECT name, hired_by FROM new_joinees WITH (NOLOCK) WHERE id = @id');
    if (joineeResult.recordset.length === 0) return;

    const joineeName = joineeResult.recordset[0].name;
    const hiredBy = joineeResult.recordset[0].hired_by;
    const alertMessage = `URGENT: New Joinee ${joineeName} (ID: ${joineeId}) has been BLOCKED. Reason: ${reason}`;

    // Collect all unique recipient IDs in a Set
    const recipientIds = new Set();
    recipientIds.add(202501);
    recipientIds.add(202515);

    // Fetch HR users + manager in a single query
    const request = pool.request();
    let lookupQuery = "SELECT id FROM users WITH (NOLOCK) WHERE LOWER(role) = 'hr'";
    if (hiredBy) {
      lookupQuery += " UNION SELECT id FROM users WITH (NOLOCK) WHERE name = @val OR CAST(id AS NVARCHAR) = @val";
      request.input('val', sql.NVarChar, hiredBy);
    }
    const lookupResult = await request.query(lookupQuery);
    for (const row of lookupResult.recordset) recipientIds.add(row.id);

    // Batch INSERT all notifications in a single query
    if (recipientIds.size > 0) {
      const valuesClauses = Array.from(recipientIds).map((_, i) => `(@uid${i}, @msg, 'COMPLIANCE_BLOCK')`);
      const batchRequest = pool.request().input('msg', sql.NVarChar, alertMessage);
      Array.from(recipientIds).forEach((rid, i) => batchRequest.input(`uid${i}`, sql.Int, rid));
      await batchRequest.query(`INSERT INTO notifications (target_user_id, message, type) VALUES ${valuesClauses.join(', ')}`);
    }

    console.log(`[NOTIFICATION] Compliance alerts broadcasted to ${recipientIds.size} recipients for joinee ${joineeName}`);
  } catch (err) {
    console.error('[NOTIFICATION ERROR]:', err);
  }
};

// GET: Fetch notifications for a user (Supports both path and query parameters)
app.get(['/api/notifications', '/api/notifications/:userId'], async (req, res) => {
  const userId = sanitizeNumericId(req.params.userId || req.query.userId || req.query.user_id);
  if (!userId) return res.status(400).json({ error: 'User ID required' });

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('uid', sql.Int, userId)
      .query('SELECT * FROM notifications WITH (NOLOCK) WHERE target_user_id = @uid ORDER BY created_at DESC');
    res.json(result.recordset);
  } catch (err) {
    console.error('[NOTIFICATIONS FETCH ERROR]', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// PUT: Mark notification as read
app.put('/api/notifications/:id/read', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .query('UPDATE notifications SET is_read = 1 WHERE id = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// POST: Global compliance audit for all joinees
app.post('/api/new-joinees/audit-compliance', async (req, res) => {
  try {
    const pool = await getPool();
    const joineesResult = await pool.request().query('SELECT id FROM new_joinees WITH (NOLOCK)');
    const auditResults = [];

    for (const joinee of joineesResult.recordset) {
      const status = await auditJoineeCompliance(joinee.id);
      if (status.blocked) auditResults.push({ id: joinee.id, status: 'BLOCKED' });
    }

    res.json({ message: 'Compliance audit finished', blocked_count: auditResults.length, details: auditResults });
  } catch (err) {
    res.status(500).json({ error: 'Global compliance audit failed' });
  }
});

/**
 * 25.4 Bulk Unblock: Restore access for all compliance-blocked joinees
 * SECURED: HR/Admin/CEO only
 */
app.post('/api/admin/new-joinees/unblock-all', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  const isAdmin = role.includes('hr') || role.includes('admin') || role.includes('ceo');

  if (!isAdmin) {
    Log.auth(`Unauthorized bulk unblock attempt by ${req.user.name}`, 'Action requires elevated privileges');
    return res.status(403).json({ error: 'Unauthorized: Admin or HR access required' });
  }

  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`
        UPDATE new_joinees 
        SET is_blocked = 0, block_reason = NULL 
        WHERE is_blocked = 1 AND (block_reason LIKE '%onboarding window%' OR block_reason LIKE '%course%')
      `);

    Log.success('Compliance', `Bulk unblock executed by ${req.user.name}. ${result.rowsAffected[0]} joinees restored.`);
    res.json({
      success: true,
      count: result.rowsAffected[0],
      message: `${result.rowsAffected[0]} compliance-related blocks have been lifted.`
    });
  } catch (err) {
    console.error('[BULK UNBLOCK ERROR]', err);
    res.status(500).json({ error: 'Failed to perform bulk unblock' });
  }
});

/**
 * 25.5 Individual Unblock (Admin Utility)
 * Supports lookup by ID or Email
 */
app.post('/api/admin/new-joinees/unblock', verifyToken, async (req, res) => {
  const { id, email } = req.body;
  const role = (req.user.role || '').toLowerCase();
  const isAdmin = role.includes('hr') || role.includes('admin') || role.includes('ceo');

  if (!isAdmin) return res.status(403).json({ error: 'Unauthorized: Admin access required' });

  try {
    const pool = await getPool();
    const request = pool.request();
    let query = 'UPDATE new_joinees SET is_blocked = 0, block_reason = NULL WHERE ';

    if (id) {
      query += 'id = @target';
      request.input('target', sql.Int, id);
    } else if (email) {
      query += 'email_id = @target';
      request.input('target', sql.NVarChar, email);
    } else {
      return res.status(400).json({ error: 'Please provide either an "id" or "email" to unblock.' });
    }

    const result = await request.query(query);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'No matching joinee found to unblock.' });
    }

    Log.success('Compliance', `Individual unblock executed for ${id || email} by ${req.user.name}`);
    res.json({ success: true, message: `Access restored for ${id ? 'ID ' + id : email}` });
  } catch (err) {
    console.error('[INDIVIDUAL UNBLOCK ERROR]', err);
    res.status(500).json({ error: 'Failed to restore access for the individual' });
  }
});

// PUT: Manual unblock for a joinee (Secured: HR and Managers only)
app.put(['/api/new-joinees/:id/unblock', '/api/admin/new-joinees/:id/unblock'], verifyToken, async (req, res) => {
  const { id } = req.params;
  const userRole = (req.user.role || '').toLowerCase();
  const userName = req.user.name;
  const userId = req.user.id;

  try {
    const pool = await getPool();

    // 1. Fetch joinee info to check hired_by manager
    const joineeResult = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT hired_by FROM new_joinees WITH (NOLOCK) WHERE id = @id');

    if (joineeResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Joinee not found' });
    }

    const hiredBy = joineeResult.recordset[0].hired_by;

    // 2. Authorization check: HR, Admins, CEO, Managers, or the Specific hiring person
    const isAuthorized = userRole.includes('hr') || userRole.includes('admin') || userRole.includes('ceo') || userRole.includes('manager') || userRole.includes('lead');
    const isDirectManager = hiredBy && (userName === hiredBy || userId.toString() === hiredBy);

    if (!isAuthorized && !isDirectManager) {
      Log.auth(`Unauthorized unblock attempt on joinee ${id} by user ${userName}`, 'Action requires HR or direct Manager privileges.');
      return res.status(403).json({ error: 'Unauthorized: Only HR or the assigned Manager can unblock this joinee.' });
    }

    await pool.request()
      .input('id', sql.Int, id)
      .query('UPDATE new_joinees SET is_blocked = 0, block_reason = NULL WHERE id = @id');

    Log.success('Compliance', `Joinee ${id} successfully UNBLOCKED by ${userName} (${isAuthorized ? 'Managerial/HR' : 'Direct Hiring Person'})`);
    res.json({ success: true, message: 'Access restored for joinee' });
  } catch (err) {
    console.error('[UNBLOCK ERROR]', err);
    res.status(500).json({ error: 'Failed to restore access' });
  }
});

app.put('/api/new-joinees/:id', async (req, res) => {
  const { id } = req.params;
  const { role, email, emailId, email_id, courseCompletion, hiredBy, hired_by, password } = req.body;
  const finalEmail = email || emailId || email_id || req.body.Email;
  const finalHiredBy = hiredBy || hired_by;
  try {
    const pool = await getPool();
    const request = pool.request()
      .input('id', sql.Int, id)
      .input('role', sql.NVarChar, role)
      .input('courseCompletion', sql.Int, courseCompletion);

    let query = 'UPDATE new_joinees SET role = ISNULL(@role, role), course_completion = ISNULL(@courseCompletion, course_completion)';

    if (finalEmail !== undefined) {
      query += ', email_id = @emailId';
      request.input('emailId', sql.NVarChar, finalEmail);
    }

    if (finalHiredBy !== undefined) {
      query += ', hired_by = @hiredBy';
      request.input('hiredBy', sql.NVarChar, finalHiredBy);
    }

    if (password !== undefined) {
      query += ', password = @password';
      request.input('password', sql.NVarChar, password);
    }

    query += ' WHERE id = @id';
    await request.query(query);
    res.json({ message: 'Onboarding record updated' });
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

app.delete('/api/new-joinees/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM new_joinees WHERE id = @id');
    res.json({ message: 'Record deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Deletion failed' });
  }
});

// --- 25.1 INTERN MANAGEMENT SYSTEM ---

// GET: All interns with Reporting Manager joining
app.get('/api/interns', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT i.*, u.name as manager_name 
      FROM interns i
      LEFT JOIN users u ON i.reporting_manager_id = u.id
      ORDER BY i.created_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch interns' });
  }
});

// GET: Fetch single intern by ID
app.get('/api/interns/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT i.*, u.name as manager_name 
        FROM interns i
        LEFT JOIN users u ON i.reporting_manager_id = u.id
        WHERE i.id = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Intern not found' });
    }
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch intern details' });
  }
});

// POST: Add new intern
app.post('/api/interns', async (req, res) => {
  const { name, email, password, role, joining_date, stipend, reporting_manager_id, duration_months, intern_id, personal_email, phone_number } = req.body;

  if (!name || !email || !password || !joining_date) {
    return res.status(400).json({ error: 'Name, Email, Password, and Joining Date are required' });
  }

  try {
    const pool = await getPool();

    // 1. Validate reporting manager exists in users table and get name
    let managerName = null;
    if (reporting_manager_id) {
      const managerCheck = await pool.request()
        .input('mid', sql.Int, reporting_manager_id)
        .query('SELECT id, name FROM users WHERE id = @mid');

      if (managerCheck.recordset.length === 0) {
        return res.status(400).json({ error: 'Invalid Reporting Manager ID. Manager must exist in the Users table.' });
      }
      managerName = managerCheck.recordset[0].name;
    }

    // 2. Insert Intern
    await pool.request()
      .input('name', sql.NVarChar, name)
      .input('email', sql.NVarChar, email)
      .input('password', sql.NVarChar, password)
      .input('role', sql.NVarChar, role || 'Intern')
      .input('joiningDate', sql.Date, joining_date)
      .input('stipend', sql.Decimal(18, 2), stipend || 0)
      .input('reportingManagerId', sql.Int, reporting_manager_id || null)
      .input('durationMonths', sql.Int, duration_months || 2)
      .input('internId', sql.NVarChar, intern_id || null)
      .input('personalEmail', sql.NVarChar, personal_email || null)
      .input('phoneNumber', sql.NVarChar, phone_number || null)
      .input('rmName', sql.NVarChar, managerName)
      .query(`
        INSERT INTO interns (name, email, password, role, joining_date, stipend, reporting_manager_id, duration_months, intern_id, personal_email, phone_number, reporting_manager_name, rm_name)
        VALUES (@name, @email, @password, @role, @joiningDate, @stipend, @reportingManagerId, @durationMonths, @internId, @personalEmail, @phoneNumber, @rmName, @rmName)
      `);

    res.json({ success: true, message: 'Intern added successfully' });
  } catch (err) {
    if (err.message.includes('UNIQUE KEY')) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Add intern error:', err);
    res.status(500).json({ error: 'Failed to add intern' });
  }
});

// POST: Promote Intern to Full Employee
app.post('/api/interns/promote/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { emp_id, team_name } = req.body; // Explicitly passed during promotion

  try {
    const pool = await getPool();

    // 1. Fetch Intern Details
    const internRes = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM interns WHERE id = @id');

    if (internRes.recordset.length === 0) {
      return res.status(404).json({ error: 'Intern not found' });
    }

    const intern = internRes.recordset[0];

    // 2. Start Transactional Move
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 3. Create User record
      const userResult = await transaction.request()
        .input('name', sql.NVarChar, intern.name)
        .input('email', sql.NVarChar, intern.email)
        .input('password', sql.NVarChar, intern.password)
        .input('role', sql.NVarChar, 'Employee')
        .input('joiningDate', sql.Date, intern.joining_date)
        .input('managerId', sql.Int, intern.reporting_manager_id)
        .input('phone', sql.NVarChar, intern.phone_number)
        .query(`
          INSERT INTO users (name, email, password, role, joining_date, reporting_manager_id, phone_number)
          OUTPUT INSERTED.id
          VALUES (@name, @email, @password, @role, @joiningDate, @managerId, @phone)
        `);

      const newUserId = userResult.recordset[0].id;

      // 4. Create Employee record
      await transaction.request()
        .input('userId', sql.Int, newUserId)
        .input('empName', sql.NVarChar, intern.name)
        .input('designation', sql.NVarChar, intern.role)
        .input('empId', sql.Int, emp_id || Math.floor(10000 + Math.random() * 90000))
        .input('team', sql.NVarChar, team_name || 'Development')
        .query(`
          INSERT INTO employee (user_id, emp_name, designation, emp_id, team_name)
          VALUES (@userId, @empName, @designation, @empId, @team)
        `);

      // 5. Create Initial Profile
      await transaction.request()
        .input('userId', sql.Int, newUserId)
        .input('personalEmail', sql.NVarChar, intern.personal_email)
        .input('contactNo', sql.NVarChar, intern.phone_number)
        .query('INSERT INTO employee_profiles (employee_id, personal_email_id, contact_no) VALUES (@userId, @personalEmail, @contactNo)');

      // 6. Delete from Interns
      await transaction.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM interns WHERE id = @id');

      await transaction.commit();
      res.json({ success: true, message: 'Intern promoted successfully', newUserId });

    } catch (err) {
      await transaction.rollback();
      throw err;
    }

  } catch (err) {
    console.error('Promotion error:', err);
    res.status(500).json({ error: 'Promotion failed', details: err.message });
  }
});

// PUT: Update intern details
app.put('/api/interns/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, password, role, joining_date, stipend, reporting_manager_id, duration_months, intern_id, personal_email, phone_number } = req.body;

  try {
    const pool = await getPool();
    const request = pool.request().input('id', sql.Int, id);

    let query = 'UPDATE interns SET ';
    const updates = [];

    // Auto-update names if reporting_manager_id is changed
    if (reporting_manager_id !== undefined) {
      let managerName = null;
      if (reporting_manager_id) {
        const managerResult = await pool.request()
          .input('mid', sql.Int, reporting_manager_id)
          .query('SELECT name FROM users WHERE id = @mid');
        if (managerResult.recordset.length > 0) {
          managerName = managerResult.recordset[0].name;
        }
      }
      updates.push('reporting_manager_id = @reportingManagerId');
      request.input('reportingManagerId', sql.Int, reporting_manager_id);

      updates.push('reporting_manager_name = @rmName');
      updates.push('rm_name = @rmName');
      request.input('rmName', sql.NVarChar, managerName);
    }

    if (name !== undefined) { updates.push('name = @name'); request.input('name', sql.NVarChar, name); }
    if (email !== undefined) { updates.push('email = @email'); request.input('email', sql.NVarChar, email); }
    if (password !== undefined) { updates.push('password = @password'); request.input('password', sql.NVarChar, password); }
    if (role !== undefined) { updates.push('role = @role'); request.input('role', sql.NVarChar, role); }
    if (joining_date !== undefined) { updates.push('joining_date = @joiningDate'); request.input('joiningDate', sql.Date, joining_date); }
    if (stipend !== undefined) { updates.push('stipend = @stipend'); request.input('stipend', sql.Decimal(18, 2), stipend); }
    if (duration_months !== undefined) { updates.push('duration_months = @durationMonths'); request.input('durationMonths', sql.Int, duration_months); }
    if (intern_id !== undefined) { updates.push('intern_id = @internId'); request.input('internId', sql.NVarChar, intern_id); }
    if (personal_email !== undefined) { updates.push('personal_email = @personalEmail'); request.input('personalEmail', sql.NVarChar, personal_email); }
    if (phone_number !== undefined) { updates.push('phone_number = @phoneNumber'); request.input('phoneNumber', sql.NVarChar, phone_number); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields provided for update' });
    }

    query += updates.join(', ') + ' WHERE id = @id';

    await request.query(query);
    res.json({ success: true, message: 'Intern record updated successfully' });
  } catch (err) {
    if (err.message.includes('UNIQUE KEY')) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Update intern error:', err);
    res.status(500).json({ error: 'Failed to update intern' });
  }
});

app.delete('/api/interns/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM interns WHERE id = @id');
    res.json({ success: true, message: 'Intern record removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove intern' });
  }
});

// 26. Support Tickets System
// GET: All tickets for a user (including assigned agent details)
app.get('/api/support-tickets', async (req, res) => {
  const { userId } = req.query;
  try {
    const pool = await getPool();
    const request = pool.request();
    let query = `
       SELECT t.*, 
              u.name as creatorName, u.email as creatorEmail,
              t.created_at as created_at, 
              t.updated_at as updated_at,
              sa.agent_name as assignedAgent
       FROM support_tickets t
       LEFT JOIN support_agents sa ON t.department = sa.department
       LEFT JOIN users u ON t.user_id = u.id
    `;
    if (userId) {
      query += ' WHERE t.user_id = @userId';
      request.input('userId', sql.Int, userId);
    }
    query += ' ORDER BY t.created_at DESC';
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error('Failed to fetch tickets:', err);
    res.status(500).json({ error: 'Failed to retrieve support tickets' });
  }
});

// GET: Fetch available support agents/departments for the UI
app.get('/api/support-agents', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT department, agent_name FROM support_agents');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch support categories' });
  }
});

// POST: Submit a new support ticket (Auto-routes based on department)
app.post('/api/support-tickets', async (req, res) => {
  const userId = req.body.userId || req.body.user_id || req.body.employeeId || req.body.employee_id;
  const { subject, description, priority, department } = req.body;

  if (!subject) return res.status(400).json({ error: 'Issue subject is required' });

  const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
  const finalPriority = validPriorities.includes(priority) ? priority : 'Medium';

  // Custom Overrides: Infrastructure -> HR
  let routingDept = department || 'HR';
  if (routingDept === 'Infrastructure') routingDept = 'HR';
  if (routingDept === 'General') routingDept = 'HR'; // General is removed, default to HR

  try {
    const pool = await getPool();
    let agentId = null;

    // 1. Technical Routing: Query the team_technical_support table directly
    if (routingDept === 'Technical') {
      const techResult = await pool.request()
        .query('SELECT TOP 1 user_id FROM team_technical_support');
      if (techResult.recordset.length > 0) {
        agentId = techResult.recordset[0].user_id;
      }
    } else {
      // 2. Normal Department Routing (HR, Infrastructure mapped to @routingDept)
      const agentResult = await pool.request()
        .input('dept', sql.NVarChar, routingDept)
        .query('SELECT agent_user_id FROM support_agents WHERE department = @dept');

      agentId = agentResult.recordset.length > 0 ? agentResult.recordset[0].agent_user_id : null;
    }

    // Lookup creator name if not provided but userId is present
    let creatorName = req.body.name || req.body.userName || req.body.employeeName;
    if (!creatorName && userId) {
      const userResult = await pool.request()
        .input('uid', sql.Int, userId)
        .query('SELECT name FROM users WHERE id = @uid');
      if (userResult.recordset.length > 0) {
        creatorName = userResult.recordset[0].name;
      }
    }

    // 3. Insert the ticket with the mapped department, agent, and creator name
    const result = await pool.request()
      .input('userId', sql.Int, userId || null)
      .input('subject', sql.NVarChar, subject)
      .input('description', sql.NVarChar(sql.MAX), description || '')
      .input('priority', sql.NVarChar, finalPriority)
      .input('department', sql.NVarChar, routingDept)
      .input('agentId', sql.Int, agentId)
      .input('name', sql.NVarChar, creatorName || 'Anonymous')
      .query(`
        INSERT INTO support_tickets (user_id, subject, description, priority, department, assigned_agent_id, status, name)
        OUTPUT INSERTED.id, INSERTED.ticket_number, INSERTED.status, INSERTED.created_at, INSERTED.department, INSERTED.name
        VALUES (@userId, @subject, @description, @priority, @department, @agentId, 'Open', @name)
      `);

    const ticket = result.recordset[0];
    res.status(201).json({ message: 'Ticket submitted successfully and routed to ' + routingDept, ticket });
  } catch (err) {
    console.error('Ticket submission failed:', err);
    res.status(500).json({ error: 'Failed to submit support ticket' });
  }
});

// PUT: Update ticket status (e.g., Open -> Resolved by HR/Admin)
app.put('/api/support-tickets/:id', async (req, res) => {
  const { id } = req.params;
  const { status, verify, action, assignee } = req.body;
  const validStatuses = ['Open', 'In Progress', 'Resolved', 'Closed'];

  try {
    const pool = await getPool();
    let query = 'UPDATE support_tickets SET updated_at = DATEADD(MINUTE, 330, GETUTCDATE())';
    const request = pool.request().input('id', sql.Int, id);

    if (status) {
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }
      query += ', status = @status';
      request.input('status', sql.NVarChar, status);
    }

    if (verify !== undefined) {
      query += ', verify = @verify';
      request.input('verify', sql.NVarChar, verify);
    }

    if (action !== undefined) {
      query += ', action = @action';
      request.input('action', sql.NVarChar(sql.MAX), action);
    }

    if (assignee !== undefined) {
      query += ', assignee = @assignee';
      request.input('assignee', sql.NVarChar(255), assignee);
    }

    query += ' WHERE id = @id';
    await request.query(query);
    res.json({ message: 'Ticket updated successfully' });
  } catch (err) {
    console.error('Ticket update failed:', err);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// 27. Course Delivery System (Migrated to Infinite Load)
// GET: Fetch all courses (optionally filtered by assignee or uploader)
app.get('/api/courses', async (req, res) => {
  const { assignedTo, uploadedBy, page, limit } = req.query;
  const p = parseInt(page) || 1;
  const l = parseInt(limit) || 10;
  const offset = (p - 1) * l;

  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, l);

    let query = `
      SELECT c.id, c.title, c.description, c.category, c.pdf_data, c.pdf_name, c.video_url, c.video_data,
             c.pdf_url,
             c.deadline, c.assigned_to, c.uploaded_by, c.completed, 
             c.created_at as created_at, 
             u1.name as assigneeName, u2.name as uploaderName 
      FROM courses c WITH (NOLOCK)
      LEFT JOIN users u1 WITH (NOLOCK) ON c.assigned_to = u1.id
      LEFT JOIN users u2 WITH (NOLOCK) ON c.uploaded_by = u2.id
      WHERE 1=1
    `;

    if (assignedTo) {
      query += ' AND c.assigned_to = @assignedTo';
      request.input('assignedTo', sql.Int, parseInt(assignedTo));
    }
    if (uploadedBy) {
      query += ' AND c.uploaded_by = @uploadedBy';
      request.input('uploadedBy', sql.Int, parseInt(uploadedBy));
    }

    query += ' ORDER BY c.created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch academic catalog' });
  }
});

// 26.2 Add a new course (Google Drive Cloud Storage Native)
app.post('/api/courses', memoryUpload.fields([{ name: 'pdf', maxCount: 1 }, { name: 'video', maxCount: 1 }]), async (req, res) => {
  const {
    title, description, category, deadline,
    assignedTo, assigned_to,
    uploadedBy, uploaded_by,
    pdf_data, pdf_name, video_url, video_data, pdf_url
  } = req.body || {};

  if (!title) return res.status(400).json({ error: 'Course title is required' });

  // Normalize inputs
  const finalDeadline = (deadline && String(deadline).trim() !== '') ? deadline : null;
  const rawAssignedTo = assignedTo !== undefined ? assignedTo : assigned_to;
  const finalAssignedTo = (rawAssignedTo && String(rawAssignedTo).trim() !== '') ? parseInt(rawAssignedTo) : null;
  const rawUploadedBy = uploadedBy !== undefined ? uploadedBy : uploaded_by;
  const finalUploadedBy = (rawUploadedBy && String(rawUploadedBy).trim() !== '') ? parseInt(rawUploadedBy) : null;

  // Handle uploaded files if any (Migrated to Google Drive)
  let finalPdf = pdf_url;
  if (req.files && req.files['pdf']) {
    finalPdf = await safeUploadToDrive(req.files['pdf'][0]);
  }

  let finalVideo = video_url;
  if (req.files && req.files['video']) {
    finalVideo = await safeUploadToDrive(req.files['video'][0]);
  }

  try {
    const pool = await getPool();
    await pool.request()
      .input('title', sql.NVarChar, title)
      .input('description', sql.NVarChar(sql.MAX), description || '')
      .input('category', sql.NVarChar, category || 'General')
      .input('pdf_url', sql.NVarChar(sql.MAX), finalPdf || null)
      .input('pdf_data', sql.NVarChar(sql.MAX), pdf_data || null)
      .input('pdf_name', sql.NVarChar(255), pdf_name || null)
      .input('video_url', sql.NVarChar(sql.MAX), finalVideo || null)
      .input('video_data', sql.NVarChar(sql.MAX), video_data || null)
      .input('deadline', sql.Date, finalDeadline)
      .input('assignedTo', sql.Int, finalAssignedTo)
      .input('uploadedBy', sql.Int, finalUploadedBy)
      .query(`
        INSERT INTO courses (
          title, description, category, pdf_url, pdf_data, pdf_name, video_url, video_data, 
          deadline, assigned_to, uploaded_by, created_at, updated_at
        ) VALUES (
          @title, @description, @category, @pdf_url, @pdf_data, @pdf_name, @video_url, @video_data, 
          @deadline, @assignedTo, @uploadedBy, DATEADD(MINUTE, 330, GETUTCDATE()), DATEADD(MINUTE, 330, GETUTCDATE())
        )
      `);
    res.status(201).json({ message: 'Course successfully published to academic catalog' });
  } catch (err) {
    console.error('Course creation error:', err);
    res.status(500).json({ error: 'Failed to synchronize course data', details: err.message });
  }
});

// PUT: Update Course status (e.g. mark as completed or update metadata)
app.put('/api/courses/:id', upload.fields([{ name: 'pdf', maxCount: 1 }, { name: 'video', maxCount: 1 }]), async (req, res) => {
  const { id } = req.params;
  const {
    title,
    description,
    category,
    pdf_url, pdfUrl,
    video_url, videoUrl,
    completed,
    deadline,
    assignedTo, assigned_to
  } = req.body || {};

  try {
    const pool = await getPool();
    let query = 'UPDATE courses SET updated_at = DATEADD(MINUTE, 330, GETUTCDATE())';
    const request = pool.request().input('id', sql.Int, id);

    if (title !== undefined) {
      query += ', title = @title';
      request.input('title', sql.NVarChar, title);
    }
    if (description !== undefined) {
      query += ', description = @description';
      request.input('description', sql.NVarChar(sql.MAX), description);
    }
    if (category !== undefined) {
      query += ', category = @category';
      request.input('category', sql.NVarChar, category);
    }

    // Handle file uploads (Multipart) OR explicit URLs (JSON)
    let finalPdf = pdf_url !== undefined ? pdf_url : pdfUrl;
    if (req.files && req.files['pdf']) {
      finalPdf = `/uploads/${req.files['pdf'][0].filename}`;
    }

    if (finalPdf !== undefined) {
      query += ', pdf_url = @pdf_url';
      request.input('pdf_url', sql.NVarChar(sql.MAX), finalPdf);
    }

    let finalVideo = video_url !== undefined ? video_url : videoUrl;
    if (req.files && req.files['video']) {
      finalVideo = `/uploads/${req.files['video'][0].filename}`;
    }

    if (finalVideo !== undefined) {
      query += ', video_url = @video_url';
      request.input('video_url', sql.NVarChar(sql.MAX), finalVideo);
    }

    if (completed !== undefined) {
      query += ', completed = @completed';
      request.input('completed', sql.Bit, completed ? 1 : 0);
    }

    if (deadline !== undefined) {
      query += ', deadline = @deadline';
      const d = (deadline && String(deadline).trim() !== '') ? deadline : null;
      request.input('deadline', sql.Date, d);
    }

    // Support both camelCase and snake_case for assigned ID (INT field)
    const rawAssignedToValue = assignedTo !== undefined ? assignedTo : assigned_to;
    if (rawAssignedToValue !== undefined) {
      query += ', assigned_to = @assignedTo';
      const a = (rawAssignedToValue && String(rawAssignedToValue).trim() !== '') ? parseInt(rawAssignedToValue) : null;
      request.input('assignedTo', sql.Int, a);
    }

    query += ' WHERE id = @id';
    await request.query(query);
    res.json({ message: 'Course metadata and tracking successfully updated' });
  } catch (err) {
    console.error('Course update error:', err);
    res.status(500).json({ error: 'Failed to update course tracking data', details: err.message });
  }
});

// 28. MASTER Project Sprint Status API (Aggregated view of all active sprints)
app.get(['/api/project-sprints', '/api/sprints-status'], async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        ps.id, ps.title as project_name, ps.assignee_id as team_leader_id, 
        ps.status as sprint_status, ps.progress as progress_percentage, ps.updated_at,
        u.name AS team_leader_name,
        u.role AS team_leader_role,
        u.profile_picture AS team_leader_picture
      FROM master_tasks ps WITH (NOLOCK)
      JOIN users u WITH (NOLOCK) ON ps.assignee_id = u.id
      WHERE ps.type = 'SPRINT' OR ps.progress > 0 -- Show active work on Dashboard
      ORDER BY ps.updated_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[SPRINT FETCH ERROR]:', err);
    res.status(500).json({ error: 'Failed to extract organizational project status' });
  }
});

// 29. New Joinee Course Management System
// GET: Fetch courses for new joinees
app.get('/api/newjoinee-courses', async (req, res) => {
  const { joineeId, uploadedBy } = req.query; // Use joineeId to fetch individual progress
  try {
    const pool = await getPool();
    const request = pool.request();
    let query = `
      SELECT c.*, u.name as uploaderName, 
             ISNULL(p.is_completed, 0) as completed,
             ISNULL(p.status, 'Not Started') as status
      FROM newjoinee_courses c WITH (NOLOCK)
      LEFT JOIN users u WITH (NOLOCK) ON c.uploaded_by = u.id
      LEFT JOIN joinee_course_progress p WITH (NOLOCK) ON c.id = p.course_id AND p.joinee_id = @joineeId
      WHERE 1=1
    `;

    // Ensure we always have a joinee context for progress, even if it's 0
    request.input('joineeId', sql.Int, joineeId || 0);

    if (uploadedBy) {
      query += ' AND c.uploaded_by = @uploadedBy';
      request.input('uploadedBy', sql.Int, uploadedBy);
    }

    query += ' ORDER BY c.created_at DESC';
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error('Fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch global onboarding curriculum' });
  }
});

// GET: Fetch details for a specific onboarding course
app.get('/api/newjoinee-courses/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM newjoinee_courses WITH (NOLOCK) WHERE id = @id');

    if (result.recordset.length === 0) return res.status(404).json({ error: 'Onboarding resource not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to extract organizational training data' });
  }
});

// POST: Upload course for new joinee
// 28.1 Add a new course to the global onboarding curriculum (Google Drive Migrated)
app.post('/api/newjoinee-courses', memoryUpload.fields([{ name: 'pdf', maxCount: 1 }, { name: 'video', maxCount: 1 }]), async (req, res) => {
  const {
    title, description, category, deadline,
    assignedTo, assigned_to,
    uploadedBy, uploaded_by,
    pdf_url, pdf_data, pdf_name, video_url, video_data
  } = req.body || {};

  if (!title) return res.status(400).json({ error: 'Course title is required' });

  // Normalize inputs
  const finalDeadline = (deadline && String(deadline).trim() !== '') ? deadline : null;
  const rawAssignedTo = assignedTo !== undefined ? assignedTo : assigned_to;
  const finalAssignedTo = (rawAssignedTo && String(rawAssignedTo).trim() !== '') ? parseInt(rawAssignedTo) : null;
  const rawUploadedBy = uploadedBy !== undefined ? uploadedBy : uploaded_by;
  const finalUploadedBy = (rawUploadedBy && String(rawUploadedBy).trim() !== '') ? parseInt(rawUploadedBy) : null;

  // Handle uploaded files if any (Migrated to Google Drive)
  let finalPdf = pdf_url;
  if (req.files && req.files['pdf']) {
    finalPdf = await safeUploadToDrive(req.files['pdf'][0]);
  }

  let finalVideo = video_url;
  if (req.files && req.files['video']) {
    finalVideo = await safeUploadToDrive(req.files['video'][0]);
  }

  try {
    const pool = await getPool();
    await pool.request()
      .input('title', sql.NVarChar, title)
      .input('description', sql.NVarChar(sql.MAX), description || '')
      .input('category', sql.NVarChar, category || 'General')
      .input('pdf_url', sql.NVarChar(sql.MAX), finalPdf || null)
      .input('pdf_data', sql.NVarChar(sql.MAX), pdf_data || null)
      .input('pdf_name', sql.NVarChar(255), pdf_name || null)
      .input('video_url', sql.NVarChar(sql.MAX), finalVideo || null)
      .input('video_data', sql.NVarChar(sql.MAX), video_data || null)
      .input('deadline', sql.Date, finalDeadline)
      .input('uploadedBy', sql.Int, finalUploadedBy)
      .query(`
        INSERT INTO newjoinee_courses (
          title, description, category, pdf_url, pdf_data, pdf_name, video_url, video_data, 
          deadline, uploaded_by, created_at, updated_at
        ) VALUES (
          @title, @description, @category, @pdf_url, @pdf_data, @pdf_name, @video_url, @video_data, 
          @deadline, @uploadedBy, DATEADD(MINUTE, 330, GETUTCDATE()), DATEADD(MINUTE, 330, GETUTCDATE())
        )
      `);
    res.status(201).json({ message: 'Course successfully added to global onboarding curriculum' });
  } catch (err) {
    console.error('Creation error:', err);
    res.status(500).json({ error: 'Failed to assign course to new joinee', details: err.message });
  }
});

// PUT: Update joinee course metadata or status (Migrated to Google Drive)
app.put('/api/newjoinee-courses/:id', memoryUpload.fields([{ name: 'pdf', maxCount: 1 }, { name: 'video', maxCount: 1 }]), async (req, res) => {
  const { id } = req.params;
  const { title, description, category, completed, deadline, pdf_url, video_url, joineeId, status } = req.body || {};

  try {
    const pool = await getPool();

    // 1. Admin Metadata Update (if fields provided)
    if (title || description || category || deadline || req.files) {
      let query = 'UPDATE newjoinee_courses SET updated_at = DATEADD(MINUTE, 330, GETUTCDATE())';
      const request = pool.request().input('id', sql.Int, id);

      if (title !== undefined) { query += ', title = @title'; request.input('title', sql.NVarChar, title); }
      if (description !== undefined) { query += ', description = @description'; request.input('description', sql.NVarChar(sql.MAX), description); }
      if (category !== undefined) { query += ', category = @category'; request.input('category', sql.NVarChar, category); }
      if (deadline !== undefined) { query += ', deadline = @deadline'; request.input('deadline', sql.Date, deadline); }

      // Handle file uploads (Migrated to Google Drive)
      if (req.files && req.files['pdf']) {
        const drivePdfUrl = await safeUploadToDrive(req.files['pdf'][0]);
        query += ', pdf_url = @pdf_url';
        request.input('pdf_url', sql.NVarChar(sql.MAX), drivePdfUrl);
      }
      else if (pdf_url !== undefined) { query += ', pdf_url = @pdf_url'; request.input('pdf_url', sql.NVarChar(sql.MAX), pdf_url); }

      if (req.files && req.files['video']) {
        const driveVideoUrl = await safeUploadToDrive(req.files['video'][0]);
        query += ', video_url = @video_url';
        request.input('video_url', sql.NVarChar(sql.MAX), driveVideoUrl);
      }
      else if (video_url !== undefined) { query += ', video_url = @video_url'; request.input('video_url', sql.NVarChar(sql.MAX), video_url); }

      query += ' WHERE id = @id';
      await request.query(query);
    }

    // 2. Personal Progress Update (if joineeId provided)
    if (joineeId && (completed !== undefined || status !== undefined)) {
      // VALIDATION: Ensure joinee exists to prevent FK constraint conflict
      const joineeExists = await pool.request()
        .input('jid', sql.Int, joineeId)
        .query('SELECT 1 FROM new_joinees WITH (NOLOCK) WHERE id = @jid');

      if (joineeExists.recordset.length === 0) {
        return res.status(404).json({ error: 'Joinee profile not found. Progress cannot be updated.' });
      }

      // If status is "Completed", force isCompleted to true
      let isCompleted = completed === true || completed === 'true' || completed === 1 ? 1 : 0;
      if (status === 'Completed') isCompleted = 1;

      const finalStatus = status || (isCompleted ? 'Completed' : 'In Progress');

      await pool.request()
        .input('jid', sql.Int, joineeId)
        .input('cid', sql.Int, id)
        .input('comp', sql.Bit, isCompleted)
        .input('status', sql.NVarChar, finalStatus)
        .query(`
          IF EXISTS (SELECT 1 FROM joinee_course_progress WHERE joinee_id = @jid AND course_id = @cid)
            UPDATE joinee_course_progress SET is_completed = @comp, status = @status, updated_at = DATEADD(MINUTE, 330, GETUTCDATE()) WHERE joinee_id = @jid AND course_id = @cid
          ELSE
            INSERT INTO joinee_course_progress (joinee_id, course_id, is_completed, status) VALUES (@jid, @cid, @comp, @status)
        `);

      await syncJoineeOnboardingProgress(joineeId);
      await auditJoineeCompliance(joineeId);

      return res.json({
        success: true,
        message: 'Onboarding progress synchronized',
        courseCompleted: !!isCompleted,
        courseStatus: finalStatus
      });
    }

    res.json({ success: true, message: 'Onboarding data metadata updated' });
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ error: 'Failed to update global onboarding data', details: err.message });
  }
});

// DELETE: Remove joinee course
app.delete('/api/newjoinee-courses/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, id).query('DELETE FROM newjoinee_courses WHERE id = @id');
    res.json({ message: 'Course successfully removed from joinee onboarding' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete course' });
  }
});

// --- LEAVE MANAGEMENT SYSTEM --- //

/**
 * 30.5 Get Leave Request (GET Alias)
 * Some frontend versions might call this to fetch leave status for a user
 */
app.get('/api/leaves/request', verifyToken, async (req, res) => {
  const { userId, user_id, employee_id } = req.query;
  const targetId = userId || user_id || employee_id || req.user.id;

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('uid', sql.Int, targetId)
      .query(`
        SELECT l.*, u.name as employee_name, u.team as employee_team
        FROM leaves l
        JOIN users u ON l.user_id = u.id
        WHERE l.user_id = @uid
        ORDER BY l.created_at DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leave request data' });
  }
});

/**
 * 30. Request Leave (POST)
 * Logic: Auto-detects manager and notifies Manager + HR + CEO
 */
app.post('/api/leaves/request', verifyToken, async (req, res) => {
  const leaveType = req.body.leaveType || req.body.leave_type;
  const startDate = req.body.startDate || req.body.start_date;
  const endDate = req.body.endDate || req.body.end_date;
  const reason = req.body.reason;
  const isHalfDay = req.body.isHalfDay ?? req.body.is_half_day;
  const halfDaySlot = req.body.halfDaySlot || req.body.half_day_slot;

  const userId = req.user.id;

  if (!startDate || !endDate || !leaveType) {
    return res.status(400).json({ error: 'Incomplete leave request parameters', received: { leaveType, startDate, endDate } });
  }

  try {
    const pool = await getPool();

    // 1. Fetch employee details, their reporting manager, and detect PM via hierarchy
    const userResult = await pool.request()
      .input('id', sql.Int, userId)
      .query(`
        SELECT u.name, u.role, u.reporting_manager_id, ISNULL(ls.leaves_available, 0) as leave_balance, u.joining_date, u.team,
               m.reporting_manager_id as hierarchy_pm_id
        FROM users u
        LEFT JOIN users m ON u.reporting_manager_id = m.id
        LEFT JOIN leave_stats ls ON u.id = ls.employee_id 
             AND ls.month = MONTH(DATEADD(MINUTE, 330, GETUTCDATE())) 
             AND ls.year = YEAR(DATEADD(MINUTE, 330, GETUTCDATE()))
        WHERE u.id = @id
      `);

    if (userResult.recordset.length === 0) return res.status(404).json({ error: 'Employee not found' });

    const employee = userResult.recordset[0];

    // 1.5 Calculate requested days (handling half-day logic)
    const requestedDays = isHalfDay ? 0.5 : (Math.ceil(Math.abs(new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1);

    // 1.6 LEAVE BALANCE CHECK: Include PENDING casual leaves in the calculation
    if (leaveType === 'Casual Leave') {
      // Calculate total days already "locked" in pending casual leave requests
      const pendingRes = await pool.request()
        .input('uId', sql.Int, userId)
        .query(`
          SELECT 
            SUM(CASE WHEN is_half_day = 1 THEN 0.5 ELSE DATEDIFF(day, start_date, end_date) + 1 END) as pending_days
          FROM leaves 
          WHERE user_id = @uId 
          AND leave_type = 'Casual Leave' 
          AND hr_status = 'Pending' 
          AND (rm_status <> 'Rejected' AND pm_status <> 'Rejected')
        `);
      
      const pendingDays = pendingRes.recordset[0]?.pending_days || 0;
      const effectiveBalance = employee.leave_balance - pendingDays;

      if (effectiveBalance < requestedDays) {
        return res.status(400).json({
          error: 'Insufficient Leave Balance',
          message: `Your available balance is ${employee.leave_balance} days, but you have ${pendingDays} days already pending approval. Remaining: ${effectiveBalance} days. You requested ${requestedDays} days.`
        });
      }
    }

    // DUPLICATE CHECK: Prevent multiple active requests for the same user on the same date
    const duplicateCheck = await pool.request()
      .input('uId', sql.Int, userId)
      .input('sDate', sql.Date, startDate)
      .query("SELECT id FROM leaves WITH (NOLOCK) WHERE user_id = @uId AND start_date = @sDate AND (rm_status <> 'Rejected' AND pm_status <> 'Rejected' AND hr_status <> 'Rejected')");
    
    if (duplicateCheck.recordset.length > 0) {
      return res.status(409).json({ 
        error: 'Duplicate Request', 
        message: `You already have an active leave request starting on ${startDate}. Please check your history.` 
      });
    }

    const normalizedRole = (employee.role || '').toLowerCase();
    const isTL = normalizedRole.includes('lead') || normalizedRole.includes('tl');
    const isManager = normalizedRole.includes('manager');
    const isHR = normalizedRole.includes('hr');

    // HIERARCHY LOGIC:
    // If Manager or HR: Reports directly to CEO (20250)
    // If Lead: PM is their direct RM
    // If Member: PM is their RM's RM
    const managerId = employee.reporting_manager_id;
    let projectManagerId = isTL ? managerId : (employee.hierarchy_pm_id || 20251);
    
    if (isManager || isHR) {
      projectManagerId = 20250; // Set CEO as their direct PM/Approver
    }

    // Initial Statuses
    // If TL, Manager, or HR: RM stage is skipped (N/A) because they report directly to PM/CEO
    const initialRMStatus = (isTL || isManager || isHR || managerId == projectManagerId) ? 'N/A' : 'Pending';

    // --- PROBATION CHECK (3 Months / 90 Days) ---
    if (employee.joining_date) {
      const joinDate = new Date(employee.joining_date);
      const today = new Date();
      const diffTime = Math.abs(today - joinDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 90 && leaveType.toUpperCase() !== 'LOP') {
        // NEW: Allow Casual Leave during probation if they have a pre-existing balance (e.g. manually credited)
        if (leaveType === 'Casual Leave' && employee.leave_balance >= requestedDays) {
          console.log(`[LEAVE] Allowing Casual Leave during probation for ${employee.name} due to existing balance.`);
        } else {
          return res.status(403).json({
            error: 'Probation Period Restriction',
            message: `During your 3-month probation, only LOP (Loss of Pay) leaves are permitted. Other leave types are available after 90 days or if you have an existing balance. Service days: ${diffDays}/90`,
            joiningDate: employee.joining_date
          });
        }
      }
    }

    // 2. Insert Leave Request
    const leaveResult = await pool.request()
      .input('userId', sql.Int, userId)
      .input('managerId', sql.Int, managerId)
      .input('pmId', sql.Int, projectManagerId)
      .input('employeeName', sql.NVarChar, employee.name)
      .input('team', sql.NVarChar, employee.team)
      .input('leaveType', sql.NVarChar, leaveType)
      .input('startDate', sql.Date, startDate)
      .input('endDate', sql.Date, endDate)
      .input('reason', sql.NVarChar, reason)
      .input('rmStatus', sql.NVarChar, initialRMStatus)
      .input('isHalfDay', sql.Bit, isHalfDay ? 1 : 0)
      .input('halfDaySlot', sql.NVarChar, halfDaySlot || null)
      .query(`
        INSERT INTO leaves (
          user_id, manager_id, pm_id, employee_name, team, leave_type, 
          start_date, end_date, reason, rm_status, pm_status, hr_status, status, is_half_day, half_day_slot
        )
        VALUES (
          @userId, @managerId, @pmId, @employeeName, @team, @leaveType, 
          @startDate, @endDate, @reason, @rmStatus, 'Pending', 'Pending', 'Pending', @isHalfDay, @halfDaySlot
        );
        SELECT SCOPE_IDENTITY() AS id;
      `);

    const leaveId = leaveResult.recordset[0].id;
    console.log(`[LEAVE SUCCESS] User ${userId} successfully requested ${leaveType} (ID: ${leaveId})`);

    // 3. Automated Notifications (Manager + HR + CEO)
    // Find HR and CEO IDs
    const authResult = await pool.request().query("SELECT id, role FROM users WHERE role IN ('HR', 'Founder & CEO')");
    const ccIds = authResult.recordset.map(u => u.id);

    const allNotifierIds = Array.from(new Set([managerId, ...ccIds])).filter(id => id && id !== userId);

    for (const notifierId of allNotifierIds) {
      await pool.request()
        .input('targetId', sql.Int, notifierId)
        .input('msg', sql.NVarChar, `New Leave Request from ${employee.name} (${leaveType}): ${startDate} to ${endDate}`)
        .query('INSERT INTO notifications (target_user_id, message, is_read, created_at) VALUES (@targetId, @msg, 0, DATEADD(MINUTE, 330, GETUTCDATE()))');
    }

    res.json({ success: true, message: 'Leave application submitted and authorities notified', leaveId });
  } catch (err) {
    console.error('[LEAVE ERROR]', err);
    res.status(500).json({ error: 'Failed to process leave application' });
  }
});

/**
 * 31. Fetch My Leave History
 */
app.get('/api/leaves/my', verifyToken, async (req, res) => {
  const userId = sanitizeNumericId(req.query.userId || req.user.id);
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT l.id, l.user_id, l.leave_type, l.start_date, l.end_date, l.reason, l.created_at,
               l.rm_status, l.pm_status, l.hr_status, l.rm_remarks, l.pm_remarks, l.hr_remarks,
               l.is_half_day, l.half_day_slot,
        CASE 
          WHEN l.rm_status = 'Rejected' OR l.pm_status = 'Rejected' OR l.hr_status = 'Rejected' THEN 'Rejected'
          WHEN l.hr_status = 'Approved' THEN 'Approved'
          ELSE 'Pending'
        END as status
        FROM leaves l
        WHERE l.user_id = @userId 
        ORDER BY l.created_at DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leave history' });
  }
});

/**
 * 32. Pending Approvals (For Managers & HR)
 */
app.get('/api/leaves/pending', verifyToken, async (req, res) => {
  const approverId = req.user.id;
  const userRole = (req.user.role || '').toLowerCase();
  const isHR = userRole.includes('hr') || userRole.includes('ceo') || userRole.includes('admin');

  try {
    const pool = await getPool();
    let query = `
      SELECT l.*, u.name as employeeName, u.role as employeeRole,
      CASE 
        WHEN l.rm_status = 'Rejected' OR l.pm_status = 'Rejected' OR l.hr_status = 'Rejected' THEN 'Rejected'
        WHEN l.hr_status = 'Approved' THEN 'Approved'
        ELSE 'Pending'
      END as status
      FROM leaves l WITH (NOLOCK)
      JOIN users u WITH (NOLOCK) ON l.user_id = u.id
      WHERE (l.rm_status <> 'Rejected' AND l.pm_status <> 'Rejected' AND l.hr_status <> 'Rejected' AND l.hr_status <> 'Approved')
    `;

    const request = pool.request();

    if (isHR) {
      // HR sees requests that have passed PM approval
      query += " AND l.pm_status = 'Approved' AND l.hr_status = 'Pending'";
    } else {
      // Managers see their current turn in the sequence
      query += `
        AND (
          (l.manager_id = @approverId AND l.rm_status = 'Pending')
          OR 
          (l.pm_id = @approverId AND l.pm_status = 'Pending' AND (l.rm_status = 'Approved' OR l.rm_status = 'N/A'))
        )
      `;
      request.input('approverId', sql.Int, approverId);
    }

    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error('[PENDING FETCH ERROR]', err);
    res.status(500).json({ error: 'Failed to fetch pending requests' });
  }
});

/**
 * 32c. CEO Exclusive: Leave Requests from Managers & HR
 * Fetches all leave applications submitted by high-level staff for CEO review.
 */
app.get('/api/ceo/leaves', verifyToken, async (req, res) => {
  const userRole = (req.user.role || '').toLowerCase();
  if (!userRole.includes('ceo')) {
    return res.status(403).json({ error: 'Unauthorized: CEO access only.' });
  }

  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`
        SELECT l.*, u.name as employeeName, u.role as employeeRole, u.team as employeeTeam
        FROM leaves l
        JOIN users u ON l.user_id = u.id
        WHERE (u.role LIKE '%Manager%' OR u.role LIKE '%HR%')
        ORDER BY l.created_at DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[CEO LEAVES FETCH ERROR]', err);
    res.status(500).json({ error: 'Failed to fetch manager/HR leave requests' });
  }
});

// 32b. Master Leave List (Approved + Rejected + Pending)
// Optimized for Managers & HR with Advanced Filtering
const masterLeaveListHandler = async (req, res) => {
  // Support userId override from query or headers for impersonation/debugging
  const overrideId = sanitizeNumericId(req.query.userId || req.query.employeeId || req.headers['x-user-id']);
  const currentUserId = overrideId || req.user.id;

  const userRole = (req.user.role || '').toLowerCase();
  const isHR = userRole.includes('hr') || userRole.includes('ceo') || userRole.includes('admin');

  // Extract Query Parameters
  const {
    status,
    userId,
    team,
    startDate,
    endDate,
    search,
    page = 1,
    limit = 10
  } = req.query;

  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

  try {
    const pool = await getPool();

    // 1. Fetch Current User's Team (for Manager Authorization)
    let currentUserTeam = '';
    if (!isHR) {
      const userRes = await pool.request()
        .input('id', sql.Int, currentUserId)
        .query('SELECT team FROM users WHERE id = @id');
      currentUserTeam = userRes.recordset[0]?.team || '';
    }

    let queryStr = `
      SELECT l.*, u.name as employeeName, u.role as employeeRole, u.team as employeeTeam,
      CASE 
        WHEN l.rm_status = 'Rejected' OR l.pm_status = 'Rejected' OR l.hr_status = 'Rejected' THEN 'Rejected'
        WHEN l.hr_status = 'Approved' THEN 'Approved'
        ELSE 'Pending'
      END as status,
      COUNT(*) OVER() as totalCount
      FROM leaves l WITH (NOLOCK)
      JOIN users u WITH (NOLOCK) ON l.user_id = u.id
      WHERE 1=1
    `;

    const request = pool.request();

    // --- AUTHORIZATION SCOPE ---
    if (!isHR) {
      // Managers see: Directly assigned RM/PM requests OR anyone in their team
      queryStr += ` AND (l.manager_id = @currentUserId OR l.pm_id = @currentUserId OR u.team = @currentUserTeam)`;
      request.input('currentUserId', sql.Int, currentUserId);
      request.input('currentUserTeam', sql.NVarChar, currentUserTeam);
    }

    // --- FILTERS ---
    if (status) {
      if (status === 'Approved') {
        queryStr += " AND l.hr_status = 'Approved'";
      } else if (status === 'Rejected') {
        queryStr += " AND (l.rm_status = 'Rejected' OR l.pm_status = 'Rejected' OR l.hr_status = 'Rejected')";
      } else if (status === 'Pending') {
        queryStr += " AND (l.rm_status <> 'Rejected' AND l.pm_status <> 'Rejected' AND l.hr_status <> 'Rejected' AND l.hr_status <> 'Approved')";
      }
    }

    if (userId) {
      queryStr += ' AND l.user_id = @targetUserId';
      request.input('targetUserId', sql.Int, userId);
    }

    if (team) {
      queryStr += ' AND u.team = @filterTeam';
      request.input('filterTeam', sql.NVarChar, team);
    }

    if (startDate) {
      queryStr += ' AND l.start_date >= @filterStart';
      request.input('filterStart', sql.Date, startDate);
    }

    if (endDate) {
      queryStr += ' AND l.start_date <= @filterEnd';
      request.input('filterEnd', sql.Date, endDate);
    }

    if (search) {
      queryStr += ' AND (u.name LIKE @searchTerm OR l.leave_type LIKE @searchTerm)';
      request.input('searchTerm', sql.NVarChar, `%${search}%`);
    }

    // --- ORDERING & PAGINATION ---
    queryStr += ` ORDER BY l.created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, parseInt(limit));

    const result = await request.query(queryStr);

    const totalCount = result.recordset.length > 0 ? result.recordset[0].totalCount : 0;

    res.json({
      success: true,
      data: result.recordset,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(totalCount / parseInt(limit))
      }
    });

  } catch (err) {
    res.status(500).json({ error: 'Failed to extract complete leave history.' });
  }
};

app.get('/api/leaves/all', verifyToken, masterLeaveListHandler);
app.get('/api/admin/leaves', verifyToken, masterLeaveListHandler);
app.get('/api/admin/leaves/all', verifyToken, masterLeaveListHandler);
app.get('/api/leaves/team', verifyToken, masterLeaveListHandler);

/**
 * 32.5 Get Monthly Leave Stats
 * Allows filtering by employee, month, and year.
 */
app.get('/api/admin/leaves/stats', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  const isAdmin = role.includes('hr') || role.includes('admin') || role.includes('ceo') || role.includes('manager') || role.includes('lead') || role.includes('tl');

  console.log(`[GET /api/admin/leaves/stats] Accessed by user ${req.user.id} (Role: ${req.user.role}, isAdmin: ${isAdmin})`);

  if (!isAdmin) {
    console.log(`[GET /api/admin/leaves/stats] 403 Forbidden for user ${req.user.id}`);
    return res.status(403).json({ error: 'Unauthorized: Management access required.' });
  }

  let { employeeId, month, year } = req.query;

  // Handle YYYY-MM format in month parameter (e.g., ?month=2026-04)
  if (month && typeof month === 'string' && month.includes('-')) {
    const parts = month.split('-');
    if (parts.length === 2) {
      year = parts[0];
      month = parts[1];
    }
  }

  try {
    const pool = await getPool();
    const request = pool.request();
    let query = `
      SELECT ls.*, u.name as employee_name, u.team, u.email as employee_email
      FROM leave_stats ls
      JOIN users u ON ls.employee_id = u.id
      WHERE 1=1
    `;

    if (employeeId) {
      request.input('empId', sql.Int, employeeId);
      query += ' AND ls.employee_id = @empId';
    }
    if (month) {
      request.input('month', sql.Int, parseInt(month));
      query += ' AND ls.month = @month';
    }
    if (year) {
      request.input('year', sql.Int, parseInt(year));
      query += ' AND ls.year = @year';
    }

    query += ' ORDER BY ls.year DESC, ls.month DESC';

    const result = await request.query(query);
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const enrichedData = result.recordset.map(row => ({
      ...row,
      takenLeaves: row.leaves_taken,
      availableLeaves: row.leaves_available,
      leaveBalance: row.leaves_available,
      halfDays: row.half_days || 0,
      monthName: monthNames[row.month - 1] || 'Unknown',
      month_name: monthNames[row.month - 1] || 'Unknown'
    }));

    res.json(enrichedData);
  } catch (err) {
    console.error('[LEAVE STATS ERROR]:', err);
    res.status(500).json({ error: 'Failed to fetch leave statistics' });
  }
});

/**
 * 32.5a Update Leave Stats
 * Allows HR/Admin to manually adjust leave balances.
 */
app.put('/api/admin/leaves/stats', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  const isAdmin = role.includes('hr') || role.includes('admin') || role.includes('ceo') || role.includes('manager') || role.includes('lead') || role.includes('tl');

  if (!isAdmin) {
    return res.status(403).json({ error: 'Unauthorized: Admin/HR access required to modify stats.' });
  }

  const { employeeId, month, year, leaves_available, leaves_taken, LOP, half_days } = req.body;

  if (!employeeId || !month || !year) {
    return res.status(400).json({ error: 'employeeId, month, and year are required.' });
  }

  try {
    const pool = await getPool();
    
    // Check if record exists
    const checkRes = await pool.request()
      .input('eid', sql.Int, employeeId)
      .input('m', sql.Int, month)
      .input('y', sql.Int, year)
      .query('SELECT id FROM leave_stats WHERE employee_id = @eid AND month = @m AND year = @y');

    if (checkRes.recordset.length === 0) {
      await pool.request()
        .input('eid', sql.Int, employeeId)
        .input('m', sql.Int, month)
        .input('y', sql.Int, year)
        .input('av', sql.Decimal(5, 2), leaves_available || 0)
        .input('tk', sql.Decimal(5, 2), leaves_taken || 0)
        .input('lop', sql.Decimal(5, 2), LOP || 0)
        .input('hd', sql.Int, half_days || 0)
        .query(`
          INSERT INTO leave_stats (employee_id, month, year, leaves_available, leaves_taken, LOP, half_days, updated_at)
          VALUES (@eid, @m, @y, @av, @tk, @lop, @hd, DATEADD(MINUTE, 330, GETUTCDATE()))
        `);
      return res.json({ success: true, message: 'Leave stats record created.' });
    } else {
      await pool.request()
        .input('eid', sql.Int, employeeId)
        .input('m', sql.Int, month)
        .input('y', sql.Int, year)
        .input('av', sql.Decimal(5, 2), leaves_available)
        .input('tk', sql.Decimal(5, 2), leaves_taken)
        .input('lop', sql.Decimal(5, 2), LOP)
        .input('hd', sql.Int, half_days)
        .query(`
          UPDATE leave_stats 
          SET 
            leaves_available = COALESCE(@av, leaves_available),
            leaves_taken = COALESCE(@tk, leaves_taken),
            LOP = COALESCE(@lop, LOP),
            half_days = COALESCE(@hd, half_days),
            updated_at = DATEADD(MINUTE, 330, GETUTCDATE())
          WHERE employee_id = @eid AND month = @m AND year = @y
        `);
      return res.json({ success: true, message: 'Leave stats updated successfully.' });
    }
  } catch (err) {
    console.error('[STATS UPDATE ERROR]', err);
    res.status(500).json({ error: 'Failed to update leave stats.' });
  }
});

/**
 * 32.5b Get Leave Stats (Universal Endpoint)
 * Supports: /api/leave-stats?userId=...
 */
app.get('/api/leave-stats', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  const isAdmin = role.includes('hr') || role.includes('admin') || role.includes('ceo') || role.includes('manager') || role.includes('lead') || role.includes('tl');

  let { userId, employeeId, month, year } = req.query;
  const targetId = userId || employeeId;

  console.log(`[GET /api/leave-stats] Accessed by user ${req.user.id} (Role: ${req.user.role}, isAdmin: ${isAdmin}), targetId: ${targetId}`);

  // Authorization: Admins can see any, users can only see their own
  if (!isAdmin && targetId && targetId != req.user.id) {
    console.log(`[GET /api/leave-stats] 403 Forbidden for user ${req.user.id}`);
    return res.status(403).json({ error: 'Unauthorized: Access denied.' });
  }

  try {
    const pool = await getPool();
    const request = pool.request();
    let query = `
      SELECT ls.*, u.name as employee_name, u.team, u.email as employee_email
      FROM leave_stats ls
      JOIN users u ON ls.employee_id = u.id
      WHERE 1=1
    `;

    if (targetId) {
      request.input('empId', sql.Int, targetId);
      query += ' AND ls.employee_id = @empId';
    }
    if (month && !isNaN(parseInt(month))) {
      request.input('month', sql.Int, parseInt(month));
      query += ' AND ls.month = @month';
    }
    if (year && !isNaN(parseInt(year))) {
      request.input('year', sql.Int, parseInt(year));
      query += ' AND ls.year = @year';
    }

    query += ' ORDER BY ls.year DESC, ls.month DESC';

    const result = await request.query(query);
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const enrichedData = result.recordset.map(row => ({
      ...row,
      takenLeaves: row.leaves_taken,
      availableLeaves: row.leaves_available,
      leaveBalance: row.leaves_available,
      halfDays: row.half_days || 0,
      monthName: monthNames[row.month - 1] || 'Unknown',
      month_name: monthNames[row.month - 1] || 'Unknown'
    }));

    res.json(enrichedData);
  } catch (err) {
    console.error('[LEAVE STATS ALIAS ERROR]:', err);
    res.status(500).json({ error: 'Failed to fetch leave statistics' });
  }
});

/**
 * 32.6 Get My Monthly Leave Stats
 */
app.get('/api/leaves/stats/my', verifyToken, async (req, res) => {
  const userId = req.user.id;
  let { month, year } = req.query;

  // Handle YYYY-MM format in month parameter (e.g., ?month=2026-04)
  if (month && typeof month === 'string' && month.includes('-')) {
    const parts = month.split('-');
    if (parts.length === 2) {
      year = parts[0].trim();
      month = parts[1].trim();
    }
  }

  try {
    const pool = await getPool();
    const request = pool.request().input('userId', sql.Int, userId);
    let query = 'SELECT employee_id, month, year, leaves_taken, leaves_available, LOP FROM leave_stats WITH (NOLOCK) WHERE employee_id = @userId';

    if (month && !isNaN(parseInt(month))) {
      request.input('month', sql.Int, parseInt(month));
      query += ' AND month = @month';
    }
    if (year && !isNaN(parseInt(year))) {
      request.input('year', sql.Int, parseInt(year));
      query += ' AND year = @year';
    }

    query += ' ORDER BY year DESC, month DESC';
    const result = await request.query(query);

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const enrichedData = result.recordset.map(row => ({
      ...row,
      takenLeaves: row.leaves_taken,
      totalTaken: row.leaves_taken,
      availableLeaves: row.leaves_available,
      leaveBalance: row.leaves_available,
      availableBalance: row.leaves_available,
      halfDays: row.half_days || 0,
      monthName: monthNames[row.month - 1] || 'Unknown',
      month_name: monthNames[row.month - 1] || 'Unknown',
      month_str: monthNames[row.month - 1] || 'Unknown'
    }));

    res.json(enrichedData);
  } catch (err) {
    console.error('[MY LEAVE STATS ERROR]:', err);
    res.status(500).json({ error: 'Failed to fetch your leave statistics' });
  }
});

/**
 * 33. Update Leave Status (Approve/Reject)
 * Logic: Deducts leave balance on Approval
 */
app.put(['/api/leaves/:id/status', '/api/ceo/leaves/:id/status'], verifyToken, async (req, res) => {
  const { id } = req.params;
  const { status, remarks } = req.body; // status: 'Approved' or 'Rejected'
  const approverId = req.user.id;
  const userRole = (req.user.role || '').toLowerCase();

  try {
    const pool = await getPool();

    // 1. Get Leave Details (Including Stage Statuses)
    const leaveCheck = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT l.*, u.role FROM leaves l JOIN users u ON l.user_id = u.id WHERE l.id = @id');

    if (leaveCheck.recordset.length === 0) return res.status(404).json({ error: 'Leave record not found' });
    const leave = leaveCheck.recordset[0];

    // Identify Approver Slot (Use loose equality for ID matching to handle string/number mismatches)
    const isRM = approverId == leave.manager_id;
    const isPM = approverId == leave.pm_id;
    const isHR = userRole.includes('hr') || userRole.includes('ceo') || userRole.includes('admin');

    // Capture normalized statuses for easier logic
    const curRMStatus = (leave.rm_status || 'Pending').trim();
    const curPMStatus = (leave.pm_status || 'Pending').trim();
    const curHRStatus = (leave.hr_status || 'Pending').trim();

    // 2. Determine which roles the user is acting as for this approval
    let actingRoles = [];
    if (isRM && curRMStatus === 'Pending') actingRoles.push('RM');
    if (isPM && curPMStatus === 'Pending') actingRoles.push('PM');
    if (isHR && curHRStatus === 'Pending') actingRoles.push('HR');

    if (leave.status === 'Rejected') {
      return res.status(400).json({ error: 'This request has already been rejected and cannot be processed further.' });
    }

    if (actingRoles.length === 0) {
      if (leave.status === 'Approved') return res.status(400).json({ error: 'This request is fully processed and approved.' });
      
      const isAlreadyApprovedByThisApprover = (isRM && curRMStatus !== 'Pending' && curRMStatus !== 'N/A') || 
                                             (isPM && curPMStatus !== 'Pending' && curPMStatus !== 'N/A') || 
                                             (isHR && curHRStatus !== 'Pending');
      if (isAlreadyApprovedByThisApprover) {
        return res.status(400).json({ error: 'You have already processed this stage of the request.' });
      }

      if (isRM && curRMStatus === 'N/A' && !isPM && !isHR) return res.status(400).json({ error: 'RM approval is not required for this request.' });
      if (isPM && curPMStatus === 'N/A' && !isRM && !isHR) return res.status(400).json({ error: 'PM approval is not required for this request.' });

      return res.status(403).json({ error: 'Unauthorized: You have no pending approval actions for this leave.' });
    }

    console.log(`[LEAVE STATUS DEBUG] id: ${id}, approver: ${approverId}, roles acting as: ${actingRoles.join(', ')}`);

    // 3. Sequential Validation & Update Logic
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      let finalStatus = 'Pending';
      let updateQuery = '';
      const request = transaction.request().input('id', sql.Int, id).input('remarks', sql.NVarChar, remarks);

      if (status === 'Rejected') {
        finalStatus = 'Rejected';
        let setClauses = [];
        if (actingRoles.includes('RM')) { setClauses.push("rm_status = 'Rejected'"); setClauses.push("rm_remarks = @remarks"); }
        if (actingRoles.includes('PM')) { setClauses.push("pm_status = 'Rejected'"); setClauses.push("pm_remarks = @remarks"); }
        if (actingRoles.includes('HR')) { setClauses.push("hr_status = 'Rejected'"); setClauses.push("hr_remarks = @remarks"); }
        
        updateQuery = `UPDATE leaves SET ${setClauses.join(', ')}, status = 'Rejected' WHERE id = @id`;
      } else {
        // APPROVAL FLOW
        let setClauses = [];
        const requesterRole = (leave.role || '').toLowerCase();

        let autoApproveHR = false;
        // If CEO (20250) is approving for a Manager or HR via PM role, make it final
        if (actingRoles.includes('PM') && approverId == 20250 && (requesterRole.includes('manager') || requesterRole.includes('hr'))) {
          autoApproveHR = true;
        }

        if (actingRoles.includes('RM')) {
          setClauses.push("rm_status = 'Approved'");
          setClauses.push("rm_remarks = @remarks");
        }
        if (actingRoles.includes('PM')) {
          setClauses.push("pm_status = 'Approved'");
          setClauses.push("pm_remarks = @remarks");
        }
        if (actingRoles.includes('HR') || autoApproveHR) {
          setClauses.push("hr_status = 'Approved'");
          if (autoApproveHR && !actingRoles.includes('HR')) {
            setClauses.push("hr_remarks = 'Auto-approved by CEO'");
          } else {
            setClauses.push("hr_remarks = @remarks");
          }
          setClauses.push("status = 'Approved'");
          finalStatus = 'Approved';
        }

        updateQuery = `UPDATE leaves SET ${setClauses.join(', ')} WHERE id = @id`;
      }

      if (!updateQuery) throw new Error('Invalid approval state');
      await request.query(updateQuery);

      // 3. Deduction Logic (Only on FINAL HR Approval)
      if (finalStatus === 'Approved') {
        let diffDays = Math.ceil(Math.abs(new Date(leave.end_date) - new Date(leave.start_date)) / (1000 * 60 * 60 * 24)) + 1;
        if (leave.is_half_day) diffDays = 0.5;

        // Fetch old balance from leave_stats to calculate LOP correctly
        const userRes = await transaction.request()
          .input('uid', sql.Int, leave.user_id)
          .query(`
            SELECT leaves_available 
            FROM leave_stats 
            WHERE employee_id = @uid 
            AND month = MONTH(DATEADD(MINUTE, 330, GETUTCDATE())) 
            AND year = YEAR(DATEADD(MINUTE, 330, GETUTCDATE()))
          `);
        const oldBalance = userRes.recordset[0]?.leaves_available || 0;

        let lopDays = 0;
        if (leave.leave_type === 'LOP' || leave.leave_type === 'Unpaid Leave') {
          lopDays = diffDays;
        } else if (oldBalance <= 0) {
          lopDays = diffDays;
        } else if (oldBalance < diffDays) {
          lopDays = diffDays - oldBalance;
        }

        // NEW: Record taken days, deduct balance, and update LOP/Half-Days in leave_stats table
        const startDate = new Date(leave.start_date);
        await transaction.request()
          .input('empId', sql.Int, leave.user_id)
          .input('month', sql.Int, startDate.getMonth() + 1)
          .input('year', sql.Int, startDate.getFullYear())
          .input('takenDays', sql.Decimal(5, 2), diffDays)
          .input('lopDays', sql.Decimal(5, 2), lopDays)
          .input('isHalfDay', sql.Int, leave.is_half_day ? 1 : 0)
          .query(`
            IF EXISTS (SELECT 1 FROM leave_stats WHERE employee_id = @empId AND month = @month AND year = @year)
            BEGIN
              UPDATE leave_stats 
              SET leaves_taken = leaves_taken + @takenDays, 
                  leaves_available = leaves_available - (@takenDays - @lopDays),
                  LOP = LOP + @lopDays,
                  half_days = half_days + @isHalfDay,
                  updated_at = GETDATE()
              WHERE employee_id = @empId AND month = @month AND year = @year
            END
            ELSE
            BEGIN
              -- Fallback for mismatching month/missing record: 
              -- Note: In a healthy system, the record is created via carry-forward or accrual.
              INSERT INTO leave_stats (employee_id, month, year, leaves_taken, leaves_available, LOP, half_days, updated_at)
              VALUES (@empId, @month, @year, @takenDays, -(@takenDays - @lopDays), @lopDays, @isHalfDay, GETDATE())
            END
          `);
      }

      await transaction.commit();

      // 4. Notifications
      const notifMsg = finalStatus === 'Pending'
        ? `Leave status updated by ${isRM ? 'RM' : isPM ? 'PM' : 'HR'}. Currently: ${status}`
        : `Your leave request from ${leave.start_date} to ${leave.end_date} has been ${finalStatus}.`;

      await pool.request()
        .input('userId', sql.Int, leave.user_id)
        .input('msg', sql.NVarChar, notifMsg)
        .query('INSERT INTO notifications (target_user_id, message, is_read, created_at) VALUES (@userId, @msg, 0, DATEADD(MINUTE, 330, GETUTCDATE()))');

      res.json({ success: true, message: `Leave ${status} successfully by ${isRM ? 'RM' : isPM ? 'PM' : 'HR'}`, finalStatus });
    } catch (innerErr) {
      if (transaction) await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    console.error('[STATUS UPDATE ERROR]', err);
    res.status(500).json({ error: err.message || 'Failed to update leave status' });
  }
});


/**
 * 34. Get Leave Balance
 */
app.get('/api/leaves/balance/:userId', async (req, res) => {
  const userId = sanitizeNumericId(req.params.userId);
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, userId)
      .query(`
        SELECT ISNULL(ls.leaves_available, 0) as leave_balance, u.name, u.joining_date 
        FROM users u
        LEFT JOIN leave_stats ls ON u.id = ls.employee_id 
             AND ls.month = MONTH(DATEADD(MINUTE, 330, GETUTCDATE())) 
             AND ls.year = YEAR(DATEADD(MINUTE, 330, GETUTCDATE()))
        WHERE u.id = @id
      `);

    if (result.recordset.length === 0) return res.status(404).json({ error: 'User not found' });

    let balanceData = result.recordset[0];
    let isProbation = false;

    // Probation Check (90 Days)
    if (balanceData.joining_date) {
      const joinDate = new Date(balanceData.joining_date);
      const today = new Date();
      const diffTime = Math.abs(today - joinDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 90) {
        isProbation = true;
        balanceData.leave_balance = 0; // Mask balance during probation
      }
    }

    res.json({
      ...balanceData,
      isProbation
    });
  } catch (err) {
    console.error('[BALANCE FETCH ERROR]', err);
    res.status(500).json({ error: 'Failed to fetch leave balance' });
  }
});

const { reconcileAttendance } = require('./scripts/reconcile-attendance');

/**
 * 35. Get Attendance Gaps (View unverified absences)
 * Helps employees/managers understand why leave balance was deducted.
 */
app.get('/api/attendance/gaps/:userId', verifyToken, async (req, res) => {
  const userId = sanitizeNumericId(req.params.userId);
  const lookback = parseInt(req.query.days) || 30;

  try {
    const pool = await getPool();
    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - lookback);

    // Fetch dependencies
    const holidays = (await pool.request().query('SELECT holiday_date FROM holidays')).recordset.map(h => h.holiday_date.toISOString().split('T')[0]);
    const leaves = (await pool.request().input('uid', sql.Int, userId).query("SELECT start_date, end_date FROM leaves WHERE user_id = @uid AND hr_status = 'Approved'")).recordset;
    const logs = (await pool.request().input('uid', sql.Int, userId).input('startDate', sql.Date, startDate).query('SELECT punch_date FROM attendance_logs WHERE user_id = @uid AND punch_date >= @startDate')).recordset.map(l => l.punch_date.toISOString().split('T')[0]);
    const user = (await pool.request().input('uid', sql.Int, userId).query('SELECT joining_date FROM users WHERE id = @uid')).recordset[0];

    if (!user) return res.status(404).json({ error: 'User not found' });

    const gaps = [];
    const joinDate = new Date(user.joining_date);

    for (let d = new Date(startDate); d < today; d.setDate(d.getDate() + 1)) {
      if (d < joinDate) continue;
      if (d.getDay() === 0) continue; // Sunday

      const dateStr = d.toISOString().split('T')[0];
      if (holidays.includes(dateStr)) continue;
      if (logs.includes(dateStr)) continue;

      const hasLeave = leaves.some(l => {
        const lStart = new Date(l.start_date);
        const lEnd = new Date(l.end_date);
        return d >= lStart && d <= lEnd;
      });

      if (!hasLeave) gaps.push(dateStr);
    }

    res.json({ userId, gaps, count: gaps.length });
  } catch (err) {
    console.error('[GAPS FETCH ERROR]', err);
    res.status(500).json({ error: 'Failed to identify attendance gaps' });
  }
});

/**
 * 36. Trigger Global Attendance Reconciliation (Admin Only)
 */
app.post('/api/admin/attendance/reconcile-all', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  if (!role.includes('hr') && !role.includes('admin')) {
    return res.status(403).json({ error: 'Unauthorized: Admin access required' });
  }

  try {
    const totalSynchronized = await reconcileAttendance(null);
    res.json({ success: true, message: `Full Audit complete. Synchronized ${totalSynchronized} users.`, synchronizedUsers: totalSynchronized });
  } catch (err) {
    res.status(500).json({ error: 'Full Audit process failed', details: err.message });
  }
});

/**
 * 37. High-Precision Full Audit Trigger (Admin Only)
 * Alternative naming for clarity.
 */
app.post('/api/admin/attendance/full-audit', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  if (!role.includes('hr') && !role.includes('admin')) {
    return res.status(403).json({ error: 'Unauthorized: Admin access required' });
  }

  try {
    const totalSynchronized = await reconcileAttendance(null);
    res.json({ success: true, message: `High-Precision Audit complete. Synchronized ${totalSynchronized} users.`, synchronizedUsers: totalSynchronized });
  } catch (err) {
    res.status(500).json({ error: 'Full Audit failed', details: err.message });
  }
});

/**
 * 38. Manually Update Monthly Leave Stats (Admin/HR)
 */
app.post(['/api/leaves/balance/update', '/api/leaves/stats/update'], verifyToken, async (req, res) => {
  const { userId, newBalance, leavesAvailable, leavesTaken, lop, halfDays, reason, month, year } = req.body;
  const userRole = (req.user.role || '').toLowerCase();
  const isAdmin = userRole.includes('hr') || userRole.includes('admin') || userRole.includes('ceo');

  if (!isAdmin) return res.status(403).json({ error: 'Unauthorized: Admin access required.' });

  if (userId === undefined) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const targetMonth = month || (new Date().getMonth() + 1);
  const targetYear = year || new Date().getFullYear();

  try {
    const pool = await getPool();

    // Build dynamic update query
    let updates = [];
    const request = pool.request()
      .input('id', sql.Int, userId)
      .input('month', sql.Int, targetMonth)
      .input('year', sql.Int, targetYear);

    const balanceValue = newBalance !== undefined ? newBalance : leavesAvailable;
    if (balanceValue !== undefined) {
      request.input('bal', sql.Decimal(5, 2), balanceValue);
      updates.push("leaves_available = @bal");
    }
    if (leavesTaken !== undefined) {
      request.input('taken', sql.Decimal(5, 2), leavesTaken);
      updates.push("leaves_taken = @taken");
    }
    if (lop !== undefined) {
      request.input('lop', sql.Decimal(5, 2), lop);
      updates.push("LOP = @lop");
    }
    if (halfDays !== undefined) {
      request.input('half', sql.Int, halfDays);
      updates.push("half_days = @half");
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update provided' });

    await request.query(`
      UPDATE leave_stats 
      SET ${updates.join(', ')}, updated_at = GETDATE()
      WHERE employee_id = @id AND month = @month AND year = @year
    `);

    // Log this change in notifications for the user
    const logMsg = `Your monthly leave stats for ${targetMonth}/${targetYear} have been manually updated. Reason: ${reason || 'Administrative adjustment'}`;
    await pool.request()
      .input('id', sql.Int, userId)
      .input('msg', sql.NVarChar, logMsg)
      .query('INSERT INTO notifications (target_user_id, message, is_read, created_at) VALUES (@id, @msg, 0, DATEADD(MINUTE, 330, GETUTCDATE()))');

    res.json({ success: true, message: 'Monthly stats updated successfully' });
  } catch (err) {
    console.error('[BALANCE UPDATE ERROR]', err);
    res.status(500).json({ error: 'Failed to update leave balance' });
  }
});


/**
 * 36. Automated Attendance Sync (Biometric Bridge)
 * Scheduled to run three times daily: 10:00 AM, 10:30 AM, and 06:30 PM IST.
 */
const triggerAttendanceSync = async (timeLabel) => {
  console.log(`[SCHEDULED TASK - ${timeLabel}] Triggering Biometric Attendance Sync...`);
  try {
    await importAttendance();
    console.log(`[SCHEDULED TASK - ${timeLabel}] Biometric Sync Successful.`);
  } catch (err) {
    console.error(`[SCHEDULED TASK ERROR - ${timeLabel}] Biometric Sync Failed:`, err.message);
  }
};

// 09:35 AM IST
cron.schedule('35 9 * * *', () => triggerAttendanceSync('09:35 AM IST'), { timezone: "Asia/Kolkata" });
// 09:40 AM IST
cron.schedule('40 9 * * *', () => triggerAttendanceSync('09:40 AM IST'), { timezone: "Asia/Kolkata" });
// 10:00 AM IST
cron.schedule('0 10 * * *', () => triggerAttendanceSync('10:00 AM IST'), { timezone: "Asia/Kolkata" });
// 01:35 PM IST
cron.schedule('35 13 * * *', () => triggerAttendanceSync('01:35 PM IST'), { timezone: "Asia/Kolkata" });
// 02:15 PM IST
cron.schedule('15 14 * * *', () => triggerAttendanceSync('02:15 PM IST'), { timezone: "Asia/Kolkata" });
// 02:30 PM IST
cron.schedule('30 14 * * *', () => triggerAttendanceSync('02:30 PM IST'), { timezone: "Asia/Kolkata" });
// 06:05 PM IST
cron.schedule('5 18 * * *', () => triggerAttendanceSync('06:05 PM IST'), { timezone: "Asia/Kolkata" });
// 06:30 PM IST
cron.schedule('30 18 * * *', () => triggerAttendanceSync('06:30 PM IST'), { timezone: "Asia/Kolkata" });
// 08:00 PM IST
cron.schedule('0 20 * * *', () => triggerAttendanceSync('08:00 PM IST'), { timezone: "Asia/Kolkata" });

/**
 * 36b. Automated Birthday Wishes
 * Runs daily at 09:00 AM IST
 */
const autoPostBirthdays = async () => {
  console.log('[BIRTHDAY SYSTEM] Checking for birthdays today...');
  try {
    const pool = await getPool();

    // 1. Fetch users celebrating today (IST adjusted)
    const birthdayBoys = await pool.request().query(`
      SELECT id, name, role FROM users 
      WHERE date_of_birth IS NOT NULL
      AND MONTH(date_of_birth) = MONTH(DATEADD(MINUTE, 330, GETUTCDATE()))
      AND DAY(date_of_birth) = DAY(DATEADD(MINUTE, 330, GETUTCDATE()))
    `);

    if (birthdayBoys.recordset.length === 0) {
      console.log('[BIRTHDAY SYSTEM] No birthdays found for today.');
      return;
    }

    const systemId = 20251; // Use CEO ID for DB consistency, but override display name
    const systemName = 'NBT HUB';
    const systemRole = 'System';

    for (const user of birthdayBoys.recordset) {
      // 2. Check if we already posted for this user today to avoid duplicates
      const checkResult = await pool.request()
        .input('uid', sql.Int, user.id)
        .input('contentPart', sql.NVarChar, `%Happy Birthday ${user.name}%`)
        .query(`
          SELECT 1 FROM threads 
          WHERE content LIKE @contentPart 
          AND CAST(DATEADD(MINUTE, 330, created_at) AS DATE) = CAST(DATEADD(MINUTE, 330, GETUTCDATE()) AS DATE)
        `);

      if (checkResult.recordset.length === 0) {
        const wishMessage = `Happy Birthday ${user.name} from Navabharath Technologies Mysuru! 🎂🎉 Wish you a great year ahead!`;

        await pool.request()
          .input('userId', sql.Int, systemId)
          .input('name', sql.NVarChar, systemName)
          .input('role', sql.NVarChar, systemRole)
          .input('content', sql.NVarChar, wishMessage)
          .query(`
            INSERT INTO threads (user_id, employee_name, role, content, media_url, media_type, created_at)
            VALUES (@userId, @name, @role, @content, NULL, 'text', DATEADD(MINUTE, 330, GETUTCDATE()))
          `);

        console.log(`[BIRTHDAY SYSTEM] Posted wish for ${user.name} as ${systemName}`);
      }
    }
  } catch (err) {
    console.error('[BIRTHDAY SYSTEM ERROR]:', err);
  }
};

// Schedule it
cron.schedule('0 9 * * *', autoPostBirthdays, { timezone: "Asia/Kolkata" });

/**
 * 37. Manual Attendance Sync Trigger (Admin)
 */
app.get('/api/attendance/sync/now', async (req, res) => {
  console.log('[API TRIGGER] Manual Biometric Sync Requested.');
  try {
    await importAttendance();
    res.json({ success: true, message: 'Biometric sync completed successfully!' });
  } catch (err) {
    console.error('[API TRIGGER ERROR] Biometric Sync Failed:', err.message);
    res.status(500).json({ error: 'Manual sync failed', details: err.message });
  }
});

/**
 * 38. Automated Monthly Casual Leave Accrual
 * Runs on the 1st of every month at 00:01 IST
 * Credits 1 day to every active employee correctly mirroring tenure.
 */
cron.schedule('1 0 1 * *', async () => {
  console.log('[SCHEDULED TASK] Executing Monthly Casual Leave Accrual...');
  try {
    const pool = await getPool();
    // 1. Accrue leaves in leave_stats for the current month
    const result = await pool.request().query(`
      UPDATE leave_stats 
      SET leaves_available = leaves_available + 1, updated_at = GETDATE()
      WHERE month = MONTH(DATEADD(MINUTE, 330, GETUTCDATE())) 
      AND year = YEAR(DATEADD(MINUTE, 330, GETUTCDATE()))
      AND employee_id IN (
        SELECT id FROM users 
        WHERE joining_date IS NOT NULL 
        AND DATEADD(day, 90, joining_date) <= DATEADD(MINUTE, 330, GETUTCDATE())
      )
    `);
    console.log(`[SCHEDULED TASK] Successfully credited ${result.rowsAffected[0]} users with monthly leave in leave_stats.`);

    // 2. Capture Snapshot / Carry Forward for the new month if missing
    await pool.request().query(`
      INSERT INTO leave_stats (employee_id, month, year, leaves_taken, leaves_available, LOP, updated_at)
      SELECT employee_id, 
             MONTH(DATEADD(MINUTE, 330, GETUTCDATE())), 
             YEAR(DATEADD(MINUTE, 330, GETUTCDATE())), 
             0, 
             leaves_available, 
             0, 
             GETDATE()
      FROM leave_stats prev
      WHERE prev.month = MONTH(DATEADD(MONTH, -1, DATEADD(MINUTE, 330, GETUTCDATE())))
      AND prev.year = YEAR(DATEADD(MONTH, -1, DATEADD(MINUTE, 330, GETUTCDATE())))
      AND NOT EXISTS (
        SELECT 1 FROM leave_stats curr 
        WHERE curr.employee_id = prev.employee_id 
        AND curr.month = MONTH(DATEADD(MINUTE, 330, GETUTCDATE()))
        AND curr.year = YEAR(DATEADD(MINUTE, 330, GETUTCDATE()))
      )
    `);
    console.log('[SCHEDULED TASK] Monthly leave stats snapshots updated with carry-forward.');
  } catch (err) {
    console.error('[SCHEDULED ERROR] Monthly Accrual Failed:', err.message);
  }
});

/**
 * 39. Manual Accrual Trigger (Admin/HR)
 * Allows HR to manually trigger the monthly increment if needed.
 */
app.get('/api/admin/leaves/accrue-now', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  if (!role.includes('hr') && !role.includes('ceo') && !role.includes('admin')) {
    return res.status(403).json({ error: 'Unauthorized: Only Admin/HR can trigger global accrual.' });
  }

  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      UPDATE users 
      SET leave_balance = leave_balance + 1 
      WHERE joining_date IS NOT NULL 
      AND DATEADD(day, 90, joining_date) <= DATEADD(MINUTE, 330, GETUTCDATE())
    `);
    res.json({ success: true, message: `Successfully credited ${result.rowsAffected[0]} users with 1 additional leave day.`, affectedRows: result.rowsAffected[0] });
  } catch (err) {
    console.error('[ADMIN TRIGGER ERROR] Manual Accrual Failed:', err);
    res.status(500).json({ error: 'Failed to execute manual accrual', details: err.message });
  }
});

// --- PAY SLIP MANAGEMENT SYSTEM --- //

const monthNames = [
  "", "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December"
];

/**
 * 40. Generate/Create Pay Slip (Admin/HR only)
 * Logic: Supports both initial creation and updates for a specific month/year.
 */
app.post(['/api/admin/pay-slips', '/api/pay_slip'], verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  if (!role.includes('hr') && !role.includes('ceo') && !role.includes('admin')) {
    return res.status(403).json({ error: 'Unauthorized: Only Admin/HR can generate pay slips.' });
  }

  const {
    month, year, emp_name, department, designation,
    total_present, total_weekly_off, total_holidays, total_leaves, total_absent,
    total_work_ot, total_ot_hours, basic_salary, bonus_ref_amt,
    pf_deduction, esi_deduction, pt_deduction,
    hra, conveyance, special_allowance, lwf, income_tax,
    performance_incentive, yearly_incentive
  } = req.body;

  const employee_id = sanitizeNumericId(req.body.employee_id);

  if (!employee_id || !month || !year) {
    return res.status(400).json({ error: 'employee_id, month, and year are mandatory' });
  }

  try {
    const pool = await getPool();

    // Calculate totals automatically to ensure data integrity
    const totalIncentive = parseFloat(performance_incentive || 0) + parseFloat(yearly_incentive || 0);
    const earnings = parseFloat(basic_salary || 0) + parseFloat(bonus_ref_amt || 0) + parseFloat(hra || 0) + parseFloat(conveyance || 0) + parseFloat(special_allowance || 0) + totalIncentive;
    const deductions = parseFloat(pf_deduction || 0) + parseFloat(esi_deduction || 0) + parseFloat(pt_deduction || 0) + parseFloat(lwf || 0) + parseFloat(income_tax || 0);
    const netPayable = earnings - deductions;

    await pool.request()
      .input('employee_id', sql.Int, employee_id)
      .input('month', sql.Int, month)
      .input('year', sql.Int, year)
      .input('emp_name', sql.NVarChar, emp_name || '')
      .input('department', sql.NVarChar, department || '')
      .input('designation', sql.NVarChar, designation || '')
      .input('total_present', sql.Decimal(5, 2), total_present || 0)
      .input('total_weekly_off', sql.Int, total_weekly_off || 0)
      .input('total_holidays', sql.Int, total_holidays || 0)
      .input('total_leaves', sql.Decimal(5, 2), total_leaves || 0)
      .input('total_absent', sql.Decimal(5, 2), total_absent || 0)
      .input('total_work_ot', sql.NVarChar, total_work_ot || '0:00')
      .input('total_ot_hours', sql.NVarChar, total_ot_hours || '0:00')
      .input('basic_salary', sql.Decimal(18, 2), basic_salary || 0)
      .input('hra', sql.Decimal(18, 2), hra || 0)
      .input('conveyance', sql.Decimal(18, 2), conveyance || 0)
      .input('special_allowance', sql.Decimal(18, 2), special_allowance || 0)
      .input('performance_incentive', sql.Decimal(18, 2), performance_incentive || 0)
      .input('yearly_incentive', sql.Decimal(18, 2), yearly_incentive || 0)
      .input('total_incentive', sql.Decimal(18, 2), totalIncentive)
      .input('bonus_ref_amt', sql.Decimal(18, 2), bonus_ref_amt || 0) // kept strictly for backwards compatibility of basic ref.
      .input('total_earnings', sql.Decimal(18, 2), earnings)
      .input('pf_deduction', sql.Decimal(18, 2), pf_deduction || 0)
      .input('esi_deduction', sql.Decimal(18, 2), esi_deduction || 0)
      .input('pt_deduction', sql.Decimal(18, 2), pt_deduction || 0)
      .input('lwf', sql.Decimal(18, 2), lwf || 0)
      .input('income_tax', sql.Decimal(18, 2), income_tax || 0)
      .input('total_deductions', sql.Decimal(18, 2), deductions)
      .input('net_payable', sql.Decimal(18, 2), netPayable)
      .query(`
        IF EXISTS (SELECT 1 FROM pay_slips WHERE employee_id = @employee_id AND month = @month AND year = @year)
          UPDATE pay_slips SET 
            emp_name = @emp_name, department = @department, designation = @designation,
            total_present = @total_present, total_weekly_off = @total_weekly_off, total_holidays = @total_holidays,
            total_leaves = @total_leaves, total_absent = @total_absent, total_work_ot = @total_work_ot,
            total_ot_hours = @total_ot_hours, basic_salary = @basic_salary, bonus_ref_amt = @bonus_ref_amt,
            hra = @hra, conveyance = @conveyance, special_allowance = @special_allowance,
            performance_incentive = @performance_incentive, yearly_incentive = @yearly_incentive, total_incentive = @total_incentive,
            total_earnings = @total_earnings, pf_deduction = @pf_deduction, esi_deduction = @esi_deduction,
            pt_deduction = @pt_deduction, lwf = @lwf, income_tax = @income_tax,
            total_deductions = @total_deductions, net_payable = @net_payable,
            updated_at = DATEADD(MINUTE, 330, GETUTCDATE())
          WHERE employee_id = @employee_id AND month = @month AND year = @year
        ELSE
          INSERT INTO pay_slips (
            employee_id, month, year, emp_name, department, designation,
            total_present, total_weekly_off, total_holidays, total_leaves, total_absent,
            total_work_ot, total_ot_hours, basic_salary, bonus_ref_amt,
            hra, conveyance, special_allowance, performance_incentive, yearly_incentive, total_incentive,
            total_earnings,
            pf_deduction, esi_deduction, pt_deduction, lwf, income_tax, total_deductions, net_payable
          ) VALUES (
            @employee_id, @month, @year, @emp_name, @department, @designation,
            @total_present, @total_weekly_off, @total_holidays, @total_leaves, @total_absent,
            @total_work_ot, @total_ot_hours, @basic_salary, @bonus_ref_amt,
            @hra, @conveyance, @special_allowance, @performance_incentive, @yearly_incentive, @total_incentive,
            @total_earnings,
            @pf_deduction, @esi_deduction, @pt_deduction, @lwf, @income_tax, @total_deductions, @net_payable
          )
      `);

    res.json({ success: true, message: 'Pay slip generated and synchronized successfully' });
  } catch (err) {
    console.error('[PAYSLIP GENERATION ERROR]:', err);
    res.status(500).json({ error: 'Failed to generate pay slip record', details: err.message });
  }
});

const { calculateUserMonthlyStats } = require('./scripts/reconcile-attendance');

/**
 * 41. Calculate Monthly Attendance Summary (For UI Pre-fill)
 */
app.get('/api/admin/pay-slips/calculate-summary', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  if (!role.includes('hr') && !role.includes('ceo') && !role.includes('admin')) {
    return res.status(403).json({ error: 'Unauthorized: Admin access required.' });
  }

  const { month, year } = req.query;
  const employee_id = sanitizeNumericId(req.query.employee_id);
  if (!employee_id || !month || !year) return res.status(400).json({ error: 'employee_id, month, and year are required' });

  try {
    const stats = await calculateUserMonthlyStats(employee_id, month, year);
    const monthName = monthNames[parseInt(month)] || 'Unknown';
    console.log(`[API] Calculated attendance summary for ${employee_id} - ${monthName} ${year}`);
    res.json({ ...stats, monthName });
  } catch (err) {
    console.error('[CALC SUMMARY ERROR]:', err);
    res.status(500).json({ error: 'Failed to calculate attendance summary' });
  }
});

/**
 * 41. Fetch My Pay Slips (Employee Role)
 */
app.get('/api/pay-slips/my', verifyToken, async (req, res) => {
  const userId = req.user.id;
  console.log(`[DEBUG] Pay Slip Request for User ID: ${userId} (Type: ${typeof userId})`);

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT * FROM pay_slips WHERE employee_id = @userId ORDER BY year DESC, month DESC');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch personal payroll history' });
  }
});

// --- MANDATORY SUGGESTION SUBMISSION SYSTEM --- //

/**
 * 42. Send Mandatory Suggestion Request (Admin/HR only)
 * Targeted employees will receive a premium email requiring them to submit a suggestion.
 */
app.post('/api/admin/mandatory-suggestions/request', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  if (!role.includes('hr') && !role.includes('ceo') && !role.includes('admin')) {
    return res.status(403).json({ error: 'Unauthorized: Admin access required.' });
  }

  const { targetEmployees } = req.body;

  if (!targetEmployees || !Array.isArray(targetEmployees) || targetEmployees.length === 0) {
    return res.status(400).json({ error: 'targetEmployees array is required.' });
  }

  const results = { sent: [], failed: [] };

  for (const emp of targetEmployees) {
    if (!emp.email) {
      results.failed.push({ email: 'Unknown', error: 'Missing email address' });
      continue;
    }

    try {
      await emailjs.send(
        EMAILJS_CONFIG.serviceId,
        EMAILJS_CONFIG.templateId,
        {
          user_name: emp.name,
          user_email: emp.email,
          to_email: emp.email,
          email: emp.email,
          audit_type: 'Targeted Action Required',
          subject_title: 'Mandatory Suggestion Submission',
          suggestion_link: 'https://hub.navabharathtechnologies.com/suggestions/new'
        },
        {
          publicKey: EMAILJS_CONFIG.publicKey,
          privateKey: EMAILJS_CONFIG.privateKey
        }
      );
      results.sent.push({ email: emp.email });
      console.log(`✅ Suggestion request sent to ${emp.email}`);
    } catch (err) {
      console.error(`❌ Failed to send to ${emp.email}:`, err.message);
      results.failed.push({ email: emp.email, error: err.message });
    }
  }

  res.json({
    success: results.sent.length > 0,
    summary: `Sent ${results.sent.length} requests, ${results.failed.length} failed.`,
    ...results
  });
});

/**
 * 43. Submit Employee Suggestion
 */

/**
 * 45. Fetch Suggestions
 * Admins/HR: Fetch all suggestions.
 * Employees: Fetch their own suggestions.
 */
app.get(['/api/admin/suggestions', '/api/suggestions', '/api/suggestions/admin'], verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  const userId = req.user.id;
  const isAdmin = role.includes('hr') || role.includes('ceo') || role.includes('admin');

  try {
    const pool = await getPool();
    let query = `
        SELECT id, employee_id, employee_name, suggestion, requirement, created_at 
        FROM employee_suggestions 
      `;

    if (!isAdmin) {
      query += ` WHERE employee_id = @userId `;
    }

    query += ` ORDER BY created_at DESC `;

    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(query);

    res.json({ success: true, count: result.recordset.length, data: result.recordset });
  } catch (err) {
    Log.error('Suggestions', 'Fetch failed', err.message);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

/**
 * 44. Saturday Mandatory Suggestion Audit & Enforcement
 * Runs every Saturday to ensure organizational compliance.
 * - 11:00 AM IST: Primary Reminder
 * - 08:00 PM IST: Final Warning
 */
const runSaturdayAudit = async (type = 'Reminder') => {
  Log.success('System', `Executing Weekly Mandatory Suggestion ${type}...`);

  try {
    const pool = await getPool();

    // 1. Get all employees/leads who haven't submitted a suggestion in the last 7 days
    // We exclude CEO and HR to focus on the operational team
    const result = await pool.request().query(`
        SELECT u.id, u.name, u.email 
        FROM (
            SELECT id, name, email, role FROM users
            UNION ALL
            SELECT id, name, email, 'Intern' as role FROM interns
        ) u
        LEFT JOIN (
            SELECT employee_id 
            FROM employee_suggestions 
            WHERE created_at >= DATEADD(day, -7, GETDATE())
        ) s ON u.id = s.employee_id
        WHERE s.employee_id IS NULL
        AND LOWER(u.role) NOT LIKE '%ceo%' 
        AND LOWER(u.role) NOT LIKE '%hr%'
        AND LOWER(u.role) NOT LIKE '%founder%'
        AND LOWER(u.role) NOT LIKE '%project manager%'
      `);

    const missingEmployees = result.recordset;
    Log.success('Audit', `Found ${missingEmployees.length} employees with missing suggestions.`);

    if (missingEmployees.length === 0) {
      Log.success('Audit', 'All employees are compliant this week! 🎉');
      return { success: true, count: 0 };
    }

    // 2. Dispatch Premium Notifications
    for (const emp of missingEmployees) {
      if (!emp.email) {
        Log.error(type, `Skipping ${emp.name}: No email address found.`);
        continue;
      }

      try {
        const isWarning = type.toLowerCase().includes('warning');
        const templateId = isWarning ? EMAILJS_CONFIG.warningTemplateId : EMAILJS_CONFIG.reminderTemplateId;

        await emailjs.send(
          EMAILJS_CONFIG.serviceId,
          templateId,
          {
            user_name: emp.name,
            user_email: emp.email,
            to_email: emp.email,
            email: emp.email,
            audit_type: type,
            subject_title: isWarning ? 'Compliance Deadline Approaching' : 'Saturday Suggestion Required',
            suggestion_link: 'https://hub.navabharathtechnologies.com/suggestions/new'
          },
          {
            publicKey: EMAILJS_CONFIG.publicKey,
            privateKey: EMAILJS_CONFIG.privateKey
          }
        );
        Log.success(type, `Sent to ${emp.email}`);
      } catch (emailErr) {
        Log.error(type, `Failed to send to ${emp.email}`, emailErr.text || emailErr.message || 'Unknown EmailJS Error');
      }
    }
    return { success: true, count: missingEmployees.length };
  } catch (err) {
    Log.error('Saturday Audit', `${type} process failed`, err.message);
    throw err;
  }
};

// Schedule Reminder (02:30 PM IST Every Saturday)
cron.schedule('30 14 * * 6', () => runSaturdayAudit('Reminder'), { timezone: "Asia/Kolkata" });

// Schedule Final Warning (05:00 PM IST Every Saturday)
cron.schedule('0 17 * * 6', () => runSaturdayAudit('Final Warning'), { timezone: "Asia/Kolkata" });

// Admin Trigger Route for Manual Audit
app.post('/api/admin/mandatory-suggestions/audit', verifyToken, async (req, res) => {
  if (req.user.role !== 'HR' && !req.user.role.includes('Admin')) {
    return res.status(403).json({ error: 'Unauthorized: Admin/HR access only' });
  }

  try {
    const type = req.body.type || 'Manual Audit';
    const result = await runSaturdayAudit(type);
    res.json({ success: true, message: `Audit completed: ${result.count} emails sent.`, details: result });
  } catch (err) {
    res.status(500).json({ error: 'Audit execution failed', message: err.message });
  }
});

// Easy Browser Trigger Link (GET)
// Usage: ?key=...&type=Reminder  OR  ?key=...&type=Warning
app.get('/api/admin/mandatory-suggestions/audit/trigger', async (req, res) => {
  const { key, type } = req.query;
  if (key !== process.env.NBT_ADMIN_KEY) {
    return res.status(401).send('Unauthorized: Invalid Admin Key');
  }

  const auditType = type === 'Warning' ? 'Final Warning' : 'Reminder';

  try {
    const result = await runSaturdayAudit(auditType);
    res.send(`<h1>Audit Complete</h1><p><strong>Type:</strong> ${auditType}</p><p>${result.count} emails sent successfully.</p>`);
  } catch (err) {
    res.status(500).send(`<h1>Audit Failed</h1><p>${err.message}</p>`);
  }
});

/**
 * 42. Get All Pay Slips (Admin/HR Management View)
 */
app.get('/api/admin/pay-slips', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  if (!role.includes('hr') && !role.includes('ceo') && !role.includes('admin')) {
    return res.status(403).json({ error: 'Unauthorized access to organizational payroll records.' });
  }

  const { month, year, team } = req.query;

  try {
    const pool = await getPool();
    const request = pool.request();
    let query = `
      SELECT ps.*, u.team as userTeam 
      FROM pay_slips ps 
      JOIN users u ON ps.employee_id = u.id 
      WHERE 1=1
    `;

    if (month) { query += ' AND ps.month = @month'; request.input('month', sql.Int, month); }
    if (year) { query += ' AND ps.year = @year'; request.input('year', sql.Int, year); }
    if (team) { query += ' AND u.team = @team'; request.input('team', sql.NVarChar, team); }

    query += ' ORDER BY ps.year DESC, ps.month DESC, ps.emp_name ASC';
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ADMIN PAYSLIP FETCH ERROR]:', err);
    res.status(500).json({ error: 'Failed to extract organizational payroll records' });
  }
});

/**
 * 43. Get Specific Pay Slip Details
 */
app.get('/api/pay-slips/:id', verifyToken, async (req, res) => {
  const id = sanitizeNumericId(req.params.id);
  const userId = req.user.id;
  const role = (req.user.role || '').toLowerCase();
  const isAdmin = role.includes('hr') || role.includes('ceo') || role.includes('admin');

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM pay_slips WHERE id = @id');

    if (result.recordset.length === 0) return res.status(404).json({ error: 'Pay slip record not found' });
    const paySlip = result.recordset[0];

    // Security: Only the owner or HR/Management can view
    if (paySlip.employee_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: You can only view your own pay slips.' });
    }

    res.json(paySlip);
  } catch (err) {
    res.status(500).json({ error: 'Failed to extract specific pay slip details' });
  }
});


// --- AWARDS & RECOGNITION (REPUTATION) SYSTEM --- //

/**
 * 43.5 Get Total Reward Points by Employee ID
 */
app.get('/api/rewards/points/:employee_id', verifyToken, async (req, res) => {
  const employee_id = sanitizeNumericId(req.params.employee_id);
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('eid', sql.Int, employee_id)
      .query('SELECT SUM(points) as totalPoints FROM employee_rewards WHERE employee_id = @eid');

    res.json({ employee_id, totalPoints: result.recordset[0]?.totalPoints || 0 });
  } catch (err) {
    console.error('[REWARD POINTS FETCH ERROR]:', err);
    res.status(500).json({ error: 'Failed to fetch reward points summary' });
  }
});

/**
 * 43.5 Hidden Reward Adjustment (Developer Override)
 * This is a private trick to adjust points without going through the standard quiz/task flow.
 */
app.post('/api/admin/rewards/bypass', async (req, res) => {
  const { userId, points, reason, secret } = req.body;

  // Hidden security check
  if (secret !== 'nbt_dev_2026_override') {
    return res.status(404).send('Not Found'); // Mask as 404 for extra stealth
  }

  try {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. Log to history silently
      await transaction.request()
        .input('userId', sql.Int, userId)
        .input('pts', sql.Int, points)
        .input('reason', sql.NVarChar, reason || 'System Adjustment')
        .query('INSERT INTO rewards_history (user_id, points, reason, created_at) VALUES (@userId, @pts, @reason, DATEADD(MINUTE, 330, GETUTCDATE()))');

      // 2. Update user total
      await transaction.request()
        .input('userId', sql.Int, userId)
        .input('pts', sql.Int, points)
        .query('UPDATE users SET reward_points = ISNULL(reward_points, 0) + @pts WHERE id = @userId');

      await transaction.commit();
      res.json({ success: true, message: 'Adjustment processed silently.' });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('[BYPASS ERROR]', err);
    res.status(500).json({ error: 'System busy' });
  }
});

/**
 * 43.6 Get Specific Target User Reward History and Total Points
 */
app.get('/api/rewards/user/:employee_id', verifyToken, async (req, res) => {
  const employee_id = sanitizeNumericId(req.params.employee_id);
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('eid', sql.Int, employee_id)
      .query(`
        -- 1. Get History with Names
        SELECT 
          r.*,
          u_rec.name as employee_name,
          u_giv.name as given_by
        FROM employee_rewards r
        JOIN users u_rec ON r.employee_id = u_rec.id
        JOIN users u_giv ON r.granted_by = u_giv.id
        WHERE r.employee_id = @eid 
        ORDER BY r.created_at DESC;
        
        -- 2. Get Total Points
        SELECT SUM(points) as totalPoints FROM employee_rewards WHERE employee_id = @eid;
      `);

    const history = result.recordsets[0] || [];
    const pointsSummary = result.recordsets[1][0];
    const totalPoints = pointsSummary ? (pointsSummary.totalPoints || 0) : 0;

    res.json({
      employee_id,
      totalPoints,
      history
    });
  } catch (err) {
    console.error('[REWARD USER HISTORY FETCH ERROR]:', err);
    res.status(500).json({ error: 'Failed to fetch user specific reward history' });
  }
});

/**
 * 44. Grant Award to Employee (Leadership Only)
 * Roles: HR, Project Manager, Lead, CEO, Admin
 */
app.post('/api/rewards', verifyToken, async (req, res) => {
  console.log('[DEBUG] Reward Grant Request Body:', req.body);
  const role = (req.user.role || '').toLowerCase();
  const isLeadership = role.includes('hr') || role.includes('manager') || role.includes('lead') || role.includes('ceo') || role.includes('admin');

  if (!isLeadership) {
    return res.status(403).json({ error: 'Unauthorized: Only leadership can grant rewards.' });
  }

  const { reward_name, points, category, note } = req.body;
  const employee_id = sanitizeNumericId(req.body.employee_id);
  const grantedBy = req.user.id;

  // Flexible Category Validation (Case-Insensitive) - Default to 'Other' if missing
  const finalCategory = category || 'Other';
  const normalizedCategory = REWARD_CATEGORIES.find(
    c => c.toLowerCase() === (finalCategory || '').toLowerCase()
  ) || 'Other';

  if (!employee_id || !reward_name || points === undefined) {
    console.warn('[REWARD GRANT VALIDATION FAILED]: Missing required fields', { employee_id, reward_name, points });
    return res.status(400).json({ error: 'Fields (employee_id, reward_name, points) are mandatory.' });
  }

  try {
    const pool = await getPool();

    // 1. Verify existence of target employee
    const checkUser = await pool.request()
      .input('eid', sql.Int, employee_id)
      .query('SELECT name FROM users WHERE id = @eid');

    if (checkUser.recordset.length === 0) {
      console.warn(`[REWARD GRANT FAILED]: Target employee ${employee_id} not found.`);
      return res.status(404).json({ error: 'Grant failed: Targeted employee does not exist.' });
    }

    const targetName = checkUser.recordset[0].name;

    // 2. Insert Reward with Note
    await pool.request()
      .input('employee_id', sql.Int, employee_id)
      .input('reward_name', sql.NVarChar, reward_name)
      .input('points', sql.Int, points)
      .input('category', sql.NVarChar, normalizedCategory)
      .input('granted_by', sql.Int, grantedBy)
      .input('note', sql.NVarChar, note || null)
      .query(`
        INSERT INTO employee_rewards (employee_id, reward_name, points, category, granted_by, note)
        VALUES (@employee_id, @reward_name, @points, @category, @granted_by, @note)
      `);

    console.log(`[REWARD SUCCESS]: Granted "${reward_name}" (${points} pts) to ${targetName} [${employee_id}] by ${grantedBy}`);
    res.json({ success: true, message: `Successfully granted "${reward_name}" to ${targetName}.` });
  } catch (err) {
    console.error('[REWARD GRANT ERROR]:', err);
    res.status(500).json({ error: 'Failed to record reward instance' });
  }
});

/**
 * 45. Get My Awards & Global Ranking
 */
/**
 * 45. Get My Awards & Global Ranking (Supports both standard and legacy calls)
 */
app.get(['/api/rewards', '/api/rewards/my'], verifyToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const pool = await getPool();

    // Multi-recordset query (Results + Stats)
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        -- 1. Get all rewards for this user with Names
        SELECT 
          r.*,
          u_rec.name as employee_name,
          u_giv.name as given_by
        FROM employee_rewards r
        JOIN users u_rec ON r.employee_id = u_rec.id
        JOIN users u_giv ON r.granted_by = u_giv.id
        WHERE r.employee_id = @userId 
        ORDER BY r.created_at DESC;

        -- 2. Calculate global rank and summary
        WITH CombinedPoints AS (
          SELECT employee_id, points, (CASE WHEN category = 'Quiz' THEN 0 ELSE 1 END) as is_endorsement FROM employee_rewards
        ),
        Leaderboard AS (
          SELECT 
            employee_id, 
            SUM(points) as total_rep, 
            SUM(is_endorsement) as endorsements
          FROM CombinedPoints
          GROUP BY employee_id
        ),
        Ranked AS (
          SELECT *, DENSE_RANK() OVER (ORDER BY total_rep DESC) as rank
          FROM Leaderboard
        )
        SELECT * FROM Ranked WHERE employee_id = @userId;
      `);

    const awards = result.recordsets[0];
    const stats = result.recordsets[1][0] || { total_rep: 0, endorsements: 0, rank: 'Unranked' };

    // Calculate Leadership Grade
    let score = 'Normal';
    if (stats.total_rep > 1000) score = 'High';
    else if (stats.total_rep >= 500) score = 'Medium';

    res.json({
      awards,
      summary: {
        totalRep: stats.total_rep,
        globalRank: stats.rank === 'Unranked' ? 'Unranked' : `#${stats.rank}`,
        endorsements: stats.endorsements,
        leadershipScore: score
      }
    });

  } catch (err) {
    console.error('[MY REWARDS FETCH ERROR]:', err);
    res.status(500).json({ error: 'Failed to access personal reward profile' });
  }
});


/**
 * 47. Get Rewards Given by User (Manager Audit History)
 */
app.get('/api/rewards/given', verifyToken, async (req, res) => {
  const userId = req.query.userId || req.user.id;
  console.log(`[DEBUG] Rewards Given History Request for User ID: ${userId} (Type: ${typeof userId})`);

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.Int, parseInt(userId))
      .query(`
        SELECT 
          r.*, 
          u_rec.name as employee_name, 
          u_rec.role as employee_role,
          u_giv.name as given_by
        FROM employee_rewards r
        JOIN users u_rec ON r.employee_id = u_rec.id
        JOIN users u_giv ON r.granted_by = u_giv.id
        WHERE r.granted_by = @userId
        ORDER BY r.created_at DESC
      `);
    console.log(`[DEBUG] Found ${result.recordset.length} rewards given by user ${userId}`);
    res.json({ awards: result.recordset });
  } catch (err) {
    console.error('[REWARDS GIVEN FETCH ERROR]:', err);
    res.status(500).json({ error: 'Failed to fetch rewards history' });
  }
});

/**
 * 48. Global Reward History (Admin/HR Management View)
 * Shows who gave which reward to whom.
 */
app.get('/api/admin/rewards/history', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  const isLeadership = role.includes('hr') || role.includes('manager') || role.includes('lead') || role.includes('ceo') || role.includes('admin');

  if (!isLeadership) {
    return res.status(403).json({ error: 'Unauthorized: Administrative access required.' });
  }

  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        r.id as id,
        r.reward_name,
        r.points,
        r.category,
        r.note,
        r.created_at,
        u_rec.name as employee_name,
        u_rec.id as employee_id,
        u_giv.name as given_by,
        u_giv.id as granted_by
      FROM employee_rewards r
      JOIN users u_rec ON r.employee_id = u_rec.id
      JOIN users u_giv ON r.granted_by = u_giv.id
      ORDER BY r.created_at DESC
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error('[ADMIN REWARD HISTORY ERROR]:', err);
    res.status(500).json({ error: 'Failed to extract organizational reward history' });
  }
});

/**
 * 46. Global Leaderboard
 */
app.get(['/api/rewards/leaderboard', '/api/quizzes/leaderboard'], verifyToken, async (req, res) => {
  try {
    const pool = await getPool();
    // OPTIMIZED: INNER JOIN excludes users with 0 rewards, avoids scanning profile_picture for non-participants
    const result = await pool.request().query(`
      WITH CombinedPoints AS (
        SELECT employee_id, points, 1 as is_award FROM employee_rewards
        UNION ALL
        SELECT employee_id, total_points as points, 0 as is_award FROM quiz_completions
      )
      SELECT 
        u.id, u.name, u.role, u.team, u.profile_picture,
        SUM(cp.points) as total_rep,
        SUM(cp.is_award) as total_awards,
        DENSE_RANK() OVER (ORDER BY SUM(cp.points) DESC) as rank
      FROM CombinedPoints cp WITH (NOLOCK)
      INNER JOIN users u WITH (NOLOCK) ON u.id = cp.employee_id
      GROUP BY u.id, u.name, u.role, u.team, u.profile_picture
      ORDER BY total_rep DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[LEADERBOARD ERROR]:', err);
    res.status(500).json({ error: 'Failed to extract global rankings' });
  }
});

/**
 * 46.0.1 Reward Categories & Standard Metadata
 */
app.get('/api/rewards/categories', verifyToken, (req, res) => {
  res.json({ success: true, categories: REWARD_CATEGORIES });
});

/**
 * 46.0.2 Update/Edit a Reward (Leadership Only)
 */
app.put('/api/rewards/:id', verifyToken, async (req, res) => {
  const rewardId = req.params.id;
  const role = (req.user.role || '').toLowerCase();
  const isLeadership = role.includes('hr') || role.includes('manager') || role.includes('lead') || role.includes('ceo') || role.includes('admin');

  if (!isLeadership) {
    return res.status(403).json({ error: 'Unauthorized: Only leadership can modify rewards.' });
  }

  const { reward_name, points, category } = req.body;
  if (!reward_name || points === undefined || !category) {
    return res.status(400).json({ error: 'Field missing: reward_name, points, and category are required.' });
  }

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, rewardId)
      .input('name', sql.NVarChar, reward_name)
      .input('pts', sql.Int, points)
      .input('cat', sql.NVarChar, category)
      .query(`
        UPDATE employee_rewards 
        SET reward_name = @name, points = @pts, category = @cat 
        WHERE id = @id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Reward record not found.' });
    }

    res.json({ success: true, message: 'Reward updated successfully.' });
  } catch (err) {
    console.error('[REWARD UPDATE ERROR]:', err);
    res.status(500).json({ error: 'Failed to update reward record.' });
  }
});

/**
 * 46.0.3 Delete/Revoke a Reward (Leadership Only)
 */
app.delete('/api/rewards/:id', verifyToken, async (req, res) => {
  const rewardId = req.params.id;
  const role = (req.user.role || '').toLowerCase();
  const isLeadership = role.includes('hr') || role.includes('manager') || role.includes('lead') || role.includes('ceo') || role.includes('admin');

  if (!isLeadership) {
    return res.status(403).json({ error: 'Unauthorized: Only leadership can revoke rewards.' });
  }

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, rewardId)
      .query('DELETE FROM employee_rewards WHERE id = @id');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Reward record not found.' });
    }

    res.json({ success: true, message: 'Reward successfully revoked.' });
  } catch (err) {
    console.error('[REWARD DELETE ERROR]:', err);
    res.status(500).json({ error: 'Failed to revoke reward points.' });
  }
});

/**
 * 46.0.4 Comprehensive Leaderboard (All Employees, including 0 points)
 */
app.get('/api/employees/leaderboard/all', verifyToken, async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      WITH CombinedPoints AS (
        SELECT employee_id, points, 1 as is_award FROM employee_rewards
        UNION ALL
        SELECT employee_id, total_points as points, 0 as is_award FROM quiz_completions
      )
      SELECT 
        u.id, u.name, u.role, u.team, u.profile_picture,
        ISNULL(SUM(cp.points), 0) as total_rep,
        ISNULL(SUM(cp.is_award), 0) as total_awards,
        DENSE_RANK() OVER (ORDER BY ISNULL(SUM(cp.points), 0) DESC) as rank
      FROM users u WITH (NOLOCK)
      LEFT JOIN CombinedPoints cp WITH (NOLOCK) ON u.id = cp.employee_id
      GROUP BY u.id, u.name, u.role, u.team, u.profile_picture
      ORDER BY total_rep DESC, u.name ASC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('[FULL LEADERBOARD ERROR]:', err);
    res.status(500).json({ error: 'Failed to extract full organizational rankings.' });
  }
});

// --- FUN QUIZ SYSTEM --- //

/**
 * 46.1 Submit a New Quiz (Leadership Only)
 */
app.post(['/api/quizzes', '/api/fun-quizzes'], verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  const isLeadership = role.includes('hr') || role.includes('manager') || role.includes('lead') || role.includes('ceo') || role.includes('admin');

  if (!isLeadership) {
    console.warn(`[QUIZ ACCESS DENIED]: User ${req.user.id} with role ${role} tried to post.`);
    return res.status(403).json({ error: 'Unauthorized: Only leadership can post quizzes.' });
  }

  // Supporting both formats: 'correct_option' (letter) or 'correct_answer' (might be letter or full text)
  const { question, option_a, option_b, option_c, option_d, correct_option, correct_answer, points_reward } = req.body;

  const chosenCorrectIdentifier = correct_option || correct_answer;

  // Diagnostic Log
  console.log('[INCOMING QUIZ]:', { question, chosenCorrectIdentifier, role: req.user.role });

  if (!question || !option_a || !option_b || !option_c || !option_d || !chosenCorrectIdentifier) {
    return res.status(400).json({ error: 'All quiz fields and valid correct answer/option are mandatory.' });
  }

  // Map the identifier to the actual text
  const optKey = (chosenCorrectIdentifier).toString().toUpperCase();
  const optionMap = { 'A': option_a, 'B': option_b, 'C': option_c, 'D': option_d };

  // If the identifier was a letter (A/B/C/D), use the map. 
  // If it was already the full text (e.g. if the frontend sends the text as 'correct_answer'), keep it.
  const finalCorrectAnswer = optionMap[optKey] || chosenCorrectIdentifier;

  try {
    const pool = await getPool();
    const finalPoints = parseInt(points_reward, 10);

    await pool.request()
      .input('question', sql.NVarChar(sql.MAX), question)
      .input('option_a', sql.NVarChar(sql.MAX), option_a)
      .input('option_b', sql.NVarChar(sql.MAX), option_b)
      .input('option_c', sql.NVarChar(sql.MAX), option_c)
      .input('option_d', sql.NVarChar(sql.MAX), option_d)
      .input('correct_answer', sql.NVarChar(sql.MAX), finalCorrectAnswer)
      .input('points_reward', sql.Int, isNaN(finalPoints) ? 10 : finalPoints)
      .input('created_by', sql.Int, req.user.id)
      .query(`
        INSERT INTO fun_quizzes (question, option_a, option_b, option_c, option_d, correct_answer, points_reward, created_by)
        VALUES (@question, @option_a, @option_b, @option_c, @option_d, @correct_answer, @points_reward, @created_by)
      `);

    res.status(201).json({ success: true, message: 'Quiz successfully created!' });
  } catch (err) {
    console.error('[QUIZ CREATE ERROR]:', err);
    res.status(500).json({ error: 'Failed to create quiz', details: err.message });
  }
});

/**
 * 46.1.1 Edit an Existing Quiz (HR/Manager/Admin Only)
 */
app.put(['/api/quizzes/:id', '/api/fun-quizzes/:id'], verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  const isLeadership = role.includes('hr') || role.includes('manager') || role.includes('lead') || role.includes('ceo') || role.includes('admin');

  if (!isLeadership) {
    return res.status(403).json({ error: 'Unauthorized: Only HR/Managers can edit quizzes.' });
  }

  const quizId = req.params.id;
  const { question, option_a, option_b, option_c, option_d, correct_option, correct_answer, points_reward } = req.body;

  const chosenCorrectIdentifier = correct_option || correct_answer;

  if (!question || !option_a || !option_b || !option_c || !option_d || !chosenCorrectIdentifier) {
    return res.status(400).json({ error: 'All quiz fields are mandatory.' });
  }

  const optKey = (chosenCorrectIdentifier).toString().toUpperCase();
  const optionMap = { 'A': option_a, 'B': option_b, 'C': option_c, 'D': option_d };
  const finalCorrectAnswer = optionMap[optKey] || chosenCorrectIdentifier;
  const finalPoints = parseInt(points_reward, 10);

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, quizId)
      .input('question', sql.NVarChar(sql.MAX), question)
      .input('option_a', sql.NVarChar(sql.MAX), option_a)
      .input('option_b', sql.NVarChar(sql.MAX), option_b)
      .input('option_c', sql.NVarChar(sql.MAX), option_c)
      .input('option_d', sql.NVarChar(sql.MAX), option_d)
      .input('correct_answer', sql.NVarChar(sql.MAX), finalCorrectAnswer)
      .input('points_reward', sql.Int, isNaN(finalPoints) ? 10 : finalPoints)
      .query(`
        UPDATE fun_quizzes 
        SET question = @question, option_a = @option_a, option_b = @option_b, 
            option_c = @option_c, option_d = @option_d, correct_answer = @correct_answer, 
            points_reward = @points_reward
        WHERE id = @id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Quiz not found.' });
    }

    res.json({ success: true, message: 'Quiz updated successfully!' });
  } catch (err) {
    console.error('[QUIZ UPDATE ERROR]:', err);
    res.status(500).json({ error: 'Failed to update quiz', details: err.message });
  }
});

/**
 * 46.1.2 Delete a Quiz (HR/Manager/Admin Only)
 */
app.delete(['/api/quizzes/:id', '/api/fun-quizzes/:id'], verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  const isLeadership = role.includes('hr') || role.includes('manager') || role.includes('lead') || role.includes('ceo') || role.includes('admin');

  if (!isLeadership) {
    return res.status(403).json({ error: 'Unauthorized: Only HR/Managers can delete quizzes.' });
  }

  const quizId = req.params.id;

  try {
    const pool = await getPool();

    // Delete associated attempts first to maintain referential integrity
    await pool.request()
      .input('quizId', sql.Int, quizId)
      .query('DELETE FROM quiz_attempts WHERE quiz_id = @quizId');

    const result = await pool.request()
      .input('id', sql.Int, quizId)
      .query('DELETE FROM fun_quizzes WHERE id = @id');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Quiz not found.' });
    }

    res.json({ success: true, message: 'Quiz deleted successfully!' });
  } catch (err) {
    console.error('[QUIZ DELETE ERROR]:', err);
    res.status(500).json({ error: 'Failed to delete quiz', details: err.message });
  }
});

/**
 * 46.2 Get Active Quizzes (With Attempt Masking)
 */
app.get(['/api/quizzes/active', '/api/quizzes', '/api/fun-quizzes', '/api/quizzes/daily-cognitive'], verifyToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          q.id,
          q.question,
          q.option_a,
          q.option_b,
          q.option_c,
          q.option_d,
          q.correct_answer,
          q.points_reward,
          q.created_at,
          u.name as author_name,
          CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END as has_answered,
          a.is_correct as previous_result
        FROM fun_quizzes q
        LEFT JOIN users u ON q.created_by = u.id
        LEFT JOIN quiz_attempts a ON q.id = a.quiz_id AND a.employee_id = @userId
        ORDER BY q.created_at DESC
      `);

    // Cast to boolean and MASK correct_answer for unanswered quizzes
    const role = (req.user.role || '').toLowerCase();
    const isLeadership = role.includes('hr') || role.includes('manager') || role.includes('lead') || role.includes('ceo') || role.includes('admin');

    const quizzes = result.recordset.map(q => {
      const hasAnswered = q.has_answered === 1;
      return {
        ...q,
        has_answered: hasAnswered,
        previous_result: q.previous_result === null ? null : !!q.previous_result,
        // Only reveal correct_answer if the user already answered OR is leadership
        correct_answer: (hasAnswered || isLeadership) ? q.correct_answer : null
      };
    });

    console.log(`[QUIZ FETCH] User ${userId} requested quizzes. Found: ${quizzes.length}`);
    res.json(quizzes);
  } catch (err) {
    console.error('[QUIZ FETCH ERROR]:', err);
    res.status(500).json({ error: 'Failed to fetch quizzes' });
  }
});

/**
 * 46.3 Answer a Quiz
 */
app.post(['/api/quizzes/:id/answer', '/api/fun-quizzes/submit-answer'], verifyToken, async (req, res) => {
  const quizId = req.params.id || req.body.quizId || req.body.id || req.body.quiz_id;
  const userId = req.user.id;
  const { selected_option } = req.body;

  if (!selected_option || !['A', 'B', 'C', 'D'].includes(selected_option.toUpperCase())) {
    return res.status(400).json({ error: 'Invalid selected option' });
  }

  try {
    const pool = await getPool();

    // 1. Verify Attempt & Fetch Correct Answer
    const quizCheck = await pool.request()
      .input('quizId', sql.Int, quizId)
      .input('userId', sql.Int, userId)
      .query(`
        SELECT q.correct_answer, q.points_reward, q.question, 
               q.option_a, q.option_b, q.option_c, q.option_d,
               a.id as attempt_id 
        FROM fun_quizzes q
        LEFT JOIN quiz_attempts a ON q.id = a.quiz_id AND a.employee_id = @userId
        WHERE q.id = @quizId
      `);

    if (quizCheck.recordset.length === 0) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    const quizData = quizCheck.recordset[0];
    if (quizData.attempt_id) {
      return res.status(400).json({ error: 'You have already answered this quiz.' });
    }

    const dbCorrect = (quizData.correct_answer || '').toString().trim().toUpperCase();
    const userSelected = (selected_option || '').toString().trim().toUpperCase();

    // Map the user's selected letter (A,B,C,D) to the actual option text for comparison
    const optionKey = `option_${userSelected.toLowerCase()}`;
    const directAnswer = (quizData[optionKey] || userSelected).toString().trim().toUpperCase();

    const isCorrect = (dbCorrect === directAnswer) ? 1 : 0;

    console.log(`[QUIZ DEBUG] QID: ${quizId} User: ${userId}`);
    console.log(`[QUIZ DEBUG] DB Correct Answer: "${dbCorrect}" (len: ${dbCorrect.length})`);
    console.log(`[QUIZ DEBUG] User Selected Answer: "${directAnswer}" (len: ${directAnswer.length})`);
    console.log(`[QUIZ DEBUG] Match Solution: ${isCorrect === 1 ? 'YES' : 'NO'}`);

    // 2. Insert Attempt Log with direct answer text
    await pool.request()
      .input('quizId', sql.Int, quizId)
      .input('userId', sql.Int, userId)
      .input('opt', sql.NVarChar, directAnswer)
      .input('isCorrect', sql.Bit, isCorrect)
      .query(`
        INSERT INTO quiz_attempts (quiz_id, employee_id, selected_option, is_correct)
        VALUES (@quizId, @userId, @opt, @isCorrect)
        `);

    // 3. (REMOVED) Immediate Point Injection
    // Points are now granted upon calling /api/quizzes/submit-session

    res.json({
      success: true,
      correct: isCorrect === 1,
      correct_answer: quizData.correct_answer,
      points_possible: quizData.points_reward
    });

  } catch (err) {
    console.error('[QUIZ ANSWER ERROR]:', err);
    res.status(500).json({ error: 'Failed to submit quiz answer' });
  }
});

/**
 * 46.3.1 Submit Full Quiz Session (Aggregate Points)
 */
app.post(['/api/quizzes/submit-session', '/api/quizzes/submit-total'], verifyToken, async (req, res) => {
  const userId = req.user.id;
  const today = new Date().toISOString().split('T')[0];

  try {
    const pool = await getPool();

    // 1. (MODIFIED) Allow multiple submissions per day
    // We now use the 'is_submitted' flag on attempts instead of a daily limit.

    // 2. Calculate Total Points for today's correct answers
    const results = await pool.request()
      .input('userId', sql.Int, userId)
      .input('today', sql.Date, today)
      .query(`
        SELECT 
          COUNT(*) as total_attempts,
          SUM(CASE WHEN qa.is_correct = 1 THEN 1 ELSE 0 END) as correct_count,
          SUM(CASE WHEN qa.is_correct = 1 THEN fq.points_reward ELSE 0 END) as total_points
        FROM quiz_attempts qa
        JOIN fun_quizzes fq ON qa.quiz_id = fq.id
        WHERE qa.employee_id = @userId 
        AND qa.is_submitted = 0
      `);

    const summary = results.recordset[0];
    const totalAttempts = summary.total_attempts || 0;
    const totalPoints = summary.total_points || 0;
    const correctCount = summary.correct_count || 0;

    if (totalAttempts === 0) {
      console.warn(`[QUIZ SUBMIT] User ${userId} rejected: No attempts found for ${today}`);
      return res.status(400).json({ error: 'No quiz attempts found for today. Please answer at least one quiz before submitting.' });
    }

    // 4. Record Completion and Mark Attempts as Submitted
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await transaction.request()
        .input('userId', sql.Int, userId)
        .input('today', sql.Date, today)
        .input('pts', sql.Int, totalPoints)
        .input('count', sql.Int, correctCount)
        .query(`
          INSERT INTO quiz_completions (employee_id, completion_date, total_points, correct_count)
          VALUES (@userId, @today, @pts, @count)
        `);

      await transaction.request()
        .input('userId', sql.Int, userId)
        .query('UPDATE quiz_attempts SET is_submitted = 1 WHERE employee_id = @userId AND is_submitted = 0');

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    // 5. Add to Employee Rewards (So it shows in Rewards History)
    if (totalPoints > 0) {
      await pool.request()
        .input('userId', sql.Int, userId)
        .input('pts', sql.Int, totalPoints)
        .input('note', sql.NVarChar, `Quiz completed on ${today} with ${correctCount} correct answers.`)
        .query(`
          INSERT INTO employee_rewards (employee_id, reward_name, points, category, granted_by, note)
          VALUES (@userId, 'Points Earned By Quiz', @pts, 'Quiz', 202515, @note)
        `);
      console.log(`[QUIZ REWARD] Granted ${totalPoints} points to user ${userId} for quiz completion.`);
    }

    res.json({
      success: true,
      message: totalPoints > 0 ? 'Quiz session successfully submitted!' : 'Quiz session completed with 0 points (attempt recorded).',
      totalPoints,
      correctCount
    });

  } catch (err) {
    console.error('[QUIZ SESSION SUBMISSION ERROR]:', err);
    res.status(500).json({ error: 'Failed to finalize quiz results.' });
  }
});

/**
 * 46.4 Daily Fun Quiz Leaderboard (Today's Scores Only)
 */
app.get(['/api/fun-quizzes/leaderboard', '/api/quizzes/leaderboard/daily'], verifyToken, async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`
        SELECT TOP 10
            qa.employee_id,
            SUM(fq.points_reward) AS points
        FROM quiz_attempts qa
        JOIN fun_quizzes fq ON qa.quiz_id = fq.id
        WHERE qa.is_correct = 1
        AND CAST(qa.created_at AS DATE) = CAST(DATEADD(MINUTE, 330, GETUTCDATE()) AS DATE)
        GROUP BY qa.employee_id
        ORDER BY points DESC
      `);

    res.json({ data: result.recordset });
  } catch (err) {
    console.error('[QUIZ LEADERBOARD ERROR]:', err);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

/**
 * 46.5 Get My Quiz Completion History
 */
app.get(['/api/quizzes/completions', '/api/quizzes/completions/my'], verifyToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          id, 
          completion_date, 
          total_points, 
          correct_count, 
          created_at
        FROM quiz_completions
        WHERE employee_id = @userId
        ORDER BY completion_date DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[QUIZ HISTORY ERROR]:', err);
    res.status(500).json({ error: 'Failed to fetch quiz history' });
  }
});

/**
 * 47. Employee Compliance & Bank Documents
 */

// 47.1 GET: Fetch authenticated user's own documents
app.get('/api/my-documents', verifyToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT * FROM employee_documents WHERE employee_id = @userId');

    if (result.recordset.length === 0) {
      return res.json({ message: 'No documents found', data: null });
    }
    res.json({ success: true, data: result.recordset[0] });
  } catch (err) {
    console.error('[DOCS GET ERROR]:', err);
    res.status(500).json({ error: 'Failed to fetch your documents' });
  }
});

// 47.2 POST: Save/Update authenticated user's documents (UPSERT)
app.post('/api/my-documents', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const {
    bank_name, account_number, ifsc_code, branch_name, account_type,
    pan_number, aadhaar_number, passport_no, driving_license,
    pf_account_number, uan_number, esic_number,
    nominee_name, nominee_relationship, nominee_contact
  } = req.body;

  try {
    const pool = await getPool();
    await pool.request()
      .input('userId', sql.Int, userId)
      .input('bank_name', sql.NVarChar, bank_name)
      .input('account_number', sql.NVarChar, account_number)
      .input('ifsc_code', sql.NVarChar, ifsc_code)
      .input('branch_name', sql.NVarChar, branch_name)
      .input('account_type', sql.NVarChar, account_type)
      .input('pan_number', sql.NVarChar, pan_number)
      .input('aadhaar_number', sql.NVarChar, aadhaar_number)
      .input('passport_no', sql.NVarChar, passport_no)
      .input('driving_license', sql.NVarChar, driving_license)
      .input('pf_account_number', sql.NVarChar, pf_account_number)
      .input('uan_number', sql.NVarChar, uan_number)
      .input('esic_number', sql.NVarChar, esic_number)
      .input('nominee_name', sql.NVarChar, nominee_name)
      .input('nominee_relationship', sql.NVarChar, nominee_relationship)
      .input('nominee_contact', sql.NVarChar, nominee_contact)
      .query(`
        IF EXISTS (SELECT 1 FROM employee_documents WHERE employee_id = @userId)
        BEGIN
          UPDATE employee_documents SET
            bank_name = @bank_name, account_number = @account_number, ifsc_code = @ifsc_code, 
            branch_name = @branch_name, account_type = @account_type, pan_number = @pan_number, 
            aadhaar_number = @aadhaar_number, passport_no = @passport_no, driving_license = @driving_license,
            pf_account_number = @pf_account_number, uan_number = @uan_number, esic_number = @esic_number,
            nominee_name = @nominee_name, nominee_relationship = @nominee_relationship, nominee_contact = @nominee_contact,
            updated_at = DATEADD(MINUTE, 330, GETUTCDATE())
          WHERE employee_id = @userId
        END
        ELSE
        BEGIN
          INSERT INTO employee_documents (
            employee_id, bank_name, account_number, ifsc_code, branch_name, account_type,
            pan_number, aadhaar_number, passport_no, driving_license,
            pf_account_number, uan_number, esic_number,
            nominee_name, nominee_relationship, nominee_contact
          ) VALUES (
            @userId, @bank_name, @account_number, @ifsc_code, @branch_name, @account_type,
            @pan_number, @aadhaar_number, @passport_no, @driving_license,
            @pf_account_number, @uan_number, @esic_number,
            @nominee_name, @nominee_relationship, @nominee_contact
          )
        END
      `);

    res.json({ success: true, message: 'All details saved successfully!' });
  } catch (err) {
    console.error('[DOCS SAVE ERROR]:', err);
    res.status(500).json({ error: 'Failed to save documents' });
  }
});

// 47.3 GET: Fetch specific employee's documents (HR/Leadership only)
app.get('/api/employee/:id/documents', verifyToken, async (req, res) => {
  const targetId = sanitizeNumericId(req.params.id);
  const role = (req.user.role || '').toLowerCase();
  const isLeadership = role.includes('hr') || role.includes('manager') || role.includes('lead') || role.includes('ceo') || role.includes('admin');

  if (!isLeadership) {
    return res.status(403).json({ error: 'Unauthorized: Only HR/Leadership can view sensitive documents.' });
  }

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('targetId', sql.Int, targetId)
      .query('SELECT * FROM employee_documents WHERE employee_id = @targetId');

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'No documents found for this employee' });
    }
    res.json({ success: true, data: result.recordset[0] });
  } catch (err) {
    console.error('[DOCS ADMIN GET ERROR]:', err);
    res.status(500).json({ error: 'Failed to fetch employee documents' });
  }
});

// --- RESIGNATION TRACKING SYSTEM --- //

/**
 * 49. Submit Resignation
 */
app.post('/api/resignations', verifyToken, async (req, res) => {
  const { resignation_date, last_working_day, reason, letter_content } = req.body;
  const userId = req.user.id;

  if (!resignation_date || !last_working_day || !reason || !letter_content) {
    return res.status(400).json({ error: 'All fields are mandatory for resignation submission.' });
  }

  try {
    const pool = await getPool();

    // Check if already has a pending resignation
    const checkExisting = await pool.request()
      .input('userId', sql.Int, userId)
      .query("SELECT id FROM resignations WHERE employee_id = @userId AND status = 'Pending'");

    if (checkExisting.recordset.length > 0) {
      return res.status(400).json({ error: 'You already have a pending resignation request.' });
    }

    await pool.request()
      .input('employee_id', sql.Int, userId)
      .input('resignation_date', sql.Date, resignation_date)
      .input('last_working_day', sql.Date, last_working_day)
      .input('reason', sql.NVarChar, reason)
      .input('letter_content', sql.NVarChar, letter_content)
      .query(`
        INSERT INTO resignations (employee_id, resignation_date, last_working_day, reason, letter_content)
        VALUES (@employee_id, @resignation_date, @last_working_day, @reason, @letter_content)
      `);

    res.json({ success: true, message: 'Resignation submitted successfully. Pending review.' });
  } catch (err) {
    console.error('[RESIGNATION SUBMISSION ERROR]:', err);
    res.status(500).json({ error: 'Failed to submit resignation request' });
  }
});

/**
 * 50. Get My Resignation History
 */
app.get('/api/resignations/my', verifyToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT * FROM resignations WHERE employee_id = @userId ORDER BY created_at DESC');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch personal resignation history' });
  }
});

/**
 * 50b. Get Team Resignations (Manager View)
 * Support both /api/resignations/team and /api/resignations/team/:userId
 */
app.get(['/api/resignations/team', '/api/resignations/team/:userId'], verifyToken, async (req, res) => {
  const userId = req.params.userId ? sanitizeNumericId(req.params.userId) : req.user.id;
  const requesterId = req.user.id;
  const userRole = (req.user.role || '').toLowerCase();
  const isAdmin = userRole.includes('hr') || userRole.includes('admin') || userRole.includes('ceo');

  // Security check: Only the manager themselves or HR/Admin can view this
  if (!isAdmin && userId != requesterId) {
    return res.status(403).json({ error: 'Unauthorized: You can only view your own team\'s resignations.' });
  }

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('managerId', sql.Int, userId)
      .query(`
        SELECT r.*, u.name as employee_name, u.role as employee_role, u.team
        FROM resignations r
        JOIN users u ON r.employee_id = u.id
        WHERE u.reporting_manager_id = @managerId
        ORDER BY r.created_at DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Failed to fetch team resignations:', err);
    res.status(500).json({ error: 'Failed to extract team resignation data' });
  }
});

/**
 * 51. Get All Resignations (Admin/HR Only)
 */
app.get('/api/admin/resignations', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  if (!role.includes('hr') && !role.includes('ceo') && !role.includes('admin')) {
    return res.status(403).json({ error: 'Unauthorized: Administrative access required.' });
  }

  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT r.*, u.name as employee_name, u.team, u.role as employee_role
      FROM resignations r
      JOIN users u ON r.employee_id = u.id
      ORDER BY r.created_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to extract organizational resignation logs' });
  }
});

/**
 * 52. Review/Remark Resignation (Admin/HR/Manager)
 */
app.put('/api/admin/resignations/:id/review', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { status, reporting_manager_remark, project_manager_remark, hr_remark } = req.body;

  try {
    const pool = await getPool();
    const request = pool.request().input('id', sql.Int, id);

    let updateQuery = "UPDATE resignations SET updated_at = DATEADD(MINUTE, 330, GETUTCDATE())";
    let sets = [];

    if (status) {
      sets.push("status = @status");
      request.input('status', sql.NVarChar, status);
    }
    if (reporting_manager_remark) {
      sets.push("reporting_manager_remark = @rm_remark");
      request.input('rm_remark', sql.NVarChar, reporting_manager_remark);
    }
    if (project_manager_remark) {
      sets.push("project_manager_remark = @pm_remark");
      request.input('pm_remark', sql.NVarChar, project_manager_remark);
    }
    if (hr_remark) {
      sets.push("hr_remark = @hr_remark");
      request.input('hr_remark', sql.NVarChar, hr_remark);
    }

    if (sets.length > 0) {
      updateQuery += ", " + sets.join(", ");
    }

    updateQuery += " WHERE id = @id";

    await request.query(updateQuery);
    res.json({ success: true, message: 'Resignation record updated with review comments.' });
  } catch (err) {
    console.error('[RESIGNATION REVIEW ERROR]:', err);
    res.status(500).json({ error: 'Failed to update resignation record' });
  }
});

/**
 * 53. Submit Service Certificate Application
 */
app.post(['/api/service-certificates', '/api/service_certificate_requests'], verifyToken, async (req, res) => {
  const {
    purpose, designation, laptopDetails, serialNumber,
    hasMouse, hasKeyboard, hasLaptopStand, hasRufPad,
    hasPendrive, hasCompanyMobile, hasExternalCamera,
    hasEarphoneHeadphone, hasTablet
  } = req.body;
  const userId = req.user.id;

  if (!purpose) {
    return res.status(400).json({ error: 'Purpose of request is mandatory.' });
  }

  try {
    const pool = await getPool();

    // Capture the current designation if not provided (fallback to users table)
    let finalDesignation = designation;
    if (!finalDesignation) {
      const userResult = await pool.request()
        .input('userId', sql.Int, userId)
        .query('SELECT role FROM users WHERE id = @userId');
      finalDesignation = userResult.recordset[0]?.role || 'Employee';
    }

    await pool.request()
      .input('employee_id', sql.Int, userId)
      .input('purpose', sql.NVarChar, purpose)
      .input('designation', sql.NVarChar, finalDesignation)
      .input('laptop', sql.NVarChar, laptopDetails || null)
      .input('serial', sql.NVarChar, serialNumber || null)
      // Asset Columns
      .input('mouse', sql.Bit, hasMouse ? 1 : 0)
      .input('keyboard', sql.Bit, hasKeyboard ? 1 : 0)
      .input('laptop_stand', sql.Bit, hasLaptopStand ? 1 : 0)
      .input('ruf_pad', sql.Bit, hasRufPad ? 1 : 0)
      .input('pendrive', sql.Bit, hasPendrive ? 1 : 0)
      .input('company_mobile', sql.Bit, hasCompanyMobile ? 1 : 0)
      .input('external_camera', sql.Bit, hasExternalCamera ? 1 : 0)
      .input('earphone_headphone', sql.Bit, hasEarphoneHeadphone ? 1 : 0)
      .input('tablet', sql.Bit, hasTablet ? 1 : 0)
      .query(`
        INSERT INTO service_certificate_requests 
          (employee_id, purpose, designation_at_request, laptop_details, serial_number, mouse, keyboard, laptop_stand, ruf_pad, pendrive, company_mobile, external_camera, earphone_headphone, tablet, status, created_at, updated_at)
        VALUES 
          (@employee_id, @purpose, @designation, @laptop, @serial, @mouse, @keyboard, @laptop_stand, @ruf_pad, @pendrive, @company_mobile, @external_camera, @earphone_headphone, @tablet, 'Pending', DATEADD(MINUTE, 330, GETUTCDATE()), DATEADD(MINUTE, 330, GETUTCDATE()))
      `);

    res.status(201).json({ success: true, message: 'Service certificate application submitted successfully.' });
  } catch (err) {
    console.error('[SERVICE CERTIFICATE SUBMIT ERROR]:', err);
    res.status(500).json({ error: 'Failed to submit service certificate application' });
  }
});

/**
 * 54. Get My Service Certificate Requests
 */
app.get(['/api/service-certificates/my', '/api/service_certificate_requests/my'], verifyToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT * FROM service_certificate_requests WHERE employee_id = @userId ORDER BY created_at DESC');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch personal service certificate history' });
  }
});

/**
 * 55. Get All Service Certificate Requests (Admin/HR Only)
 */
app.get(['/api/admin/service-certificates', '/api/service_certificate_requests', '/api/service-certificates'], verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  const { userId } = req.query;

  // If a userId is provided, ensure the requester is authorized (Self, Admin, or Manager)
  const isAuthorized = role.includes('hr') || role.includes('ceo') || role.includes('admin') || role.includes('manager') || (userId && parseInt(userId) === req.user.id);

  if (!isAuthorized) {
    return res.status(403).json({ error: 'Unauthorized: Access denied.' });
  }

  try {
    const pool = await getPool();
    let query = `
      SELECT scr.*, u.name as employee_name, u.team, u.email as employee_email
      FROM service_certificate_requests scr
      JOIN users u ON scr.employee_id = u.id
    `;

    const request = pool.request();
    if (userId) {
      request.input('userId', sql.Int, userId);
      query += ` WHERE scr.employee_id = @userId `;
    }

    query += ` ORDER BY scr.created_at DESC `;

    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to extract service certificate logs' });
  }
});

/**
 * 55.5 Get Single Service Certificate Request
 */
app.get(['/api/service-certificates/:id', '/api/service_certificate_requests/:id'], verifyToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const role = (req.user.role || '').toLowerCase();

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT scr.*, u.name as employee_name, u.email as employee_email, u.team
        FROM service_certificate_requests scr 
        JOIN users u ON scr.employee_id = u.id 
        WHERE scr.id = @id
      `);

    if (result.recordset.length === 0) return res.status(404).json({ error: 'Request not found' });

    const certRequest = result.recordset[0];
    const isAdmin = role.includes('hr') || role.includes('ceo') || role.includes('admin') || role.includes('manager') || role.includes('lead');
    if (!isAdmin && certRequest.employee_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    res.json(certRequest);
  } catch (err) {
    console.error('[SERVICE CERT FETCH ERROR]:', err);
    res.status(500).json({ error: 'Failed to fetch request details' });
  }
});

/**
 * 56. Review Service Certificate Request (Admin/HR Only)
 */
app.put(['/api/admin/service-certificates/:id', '/api/service-certificates/:id', '/api/service-certificates', '/api/service_certificates/:id', '/api/service_certificates', '/api/service_certificate_requests/:id', '/api/service_certificate_requests'], verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  const userId = req.user.id;

  console.log(`[CERT UPDATE] Target: ${req.originalUrl} | Method: ${req.method} | User: ${userId} (${role})`);
  console.log(`[CERT UPDATE] Body:`, JSON.stringify(req.body));

  // Resolve ID from URL or Body (Supporting multiple naming conventions)
  const id = req.params.id || req.body.id || req.body.certificateId || req.body.requestId;
  const admin_remark = req.body.admin_remark || req.body.admin_remarks;
  const { status, certificate_url, purpose } = req.body;

  try {
    const pool = await getPool();

    // 1. Identification: Try to find existing record by ID or Fallback to latest Pending for Employee
    let certificate = null;
    if (id && !isNaN(parseInt(id)) && parseInt(id) > 0) {
      const verifyResult = await pool.request().input('id', sql.Int, id).query('SELECT * FROM service_certificate_requests WHERE id = @id');
      certificate = verifyResult.recordset[0];
    }

    const targetEmpId = req.body.employee_id ? sanitizeNumericId(req.body.employee_id) : userId;

    if (!certificate && targetEmpId) {
      console.log(`[CERT UPDATE] ID ${id} not found. Searching for latest pending request for Employee ${targetEmpId}...`);
      const fallbackResult = await pool.request().input('empId', sql.Int, targetEmpId).query('SELECT TOP 1 * FROM service_certificate_requests WHERE employee_id = @empId AND status = \'Pending\' ORDER BY created_at DESC');
      certificate = fallbackResult.recordset[0];
    }

    const isAdmin = role.includes('hr') || role.includes('ceo') || role.includes('admin') || role.includes('manager') || role.includes('lead');
    const isOwner = certificate ? (certificate.employee_id === userId) : (targetEmpId === userId);

    if (!isAdmin && !isOwner) {
      console.warn(`[CERT UPDATE] Unauthorized attempt by User ${userId} on Emp ${targetEmpId}`);
      return res.status(403).json({ error: 'Unauthorized: Access denied.' });
    }

    // Security: Only Admin/HR can update status or remarks on existing records
    if (certificate && (status !== undefined || admin_remark !== undefined || certificate_url !== undefined) && !isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: Only Admin/HR can approve or comment on certificates.' });
    }

    const request = pool.request();

    // --- Comprehensive Field Mapping ---
    const fieldMapping = {
      purpose: 'purpose',
      designation: 'designation_at_request',
      designation_at_request: 'designation_at_request',
      laptop_details: 'laptop_details',
      laptopDetails: 'laptop_details',
      serial_number: 'serial_number',
      serialNumber: 'serial_number',
      // Asset Columns (Supporting both prefixed and non-prefixed columns in schema)
      mouse: 'mouse', has_mouse: 'has_mouse', hasMouse: 'mouse',
      keyboard: 'keyboard', has_keyboard: 'has_keyboard', hasKeyboard: 'keyboard',
      laptop_stand: 'laptop_stand', has_laptop_stand: 'has_laptop_stand', hasLaptopStand: 'laptop_stand',
      ruf_pad: 'ruf_pad', has_ruf_pad: 'ruf_pad', hasRufPad: 'ruf_pad',
      pendrive: 'pendrive', has_pendrive: 'pendrive', hasPendrive: 'pendrive',
      company_mobile: 'company_mobile', has_company_mobile: 'company_mobile', hasCompanyMobile: 'company_mobile',
      external_camera: 'external_camera', has_external_camera: 'external_camera', hasExternalCamera: 'external_camera',
      earphone_headphone: 'earphone_headphone', has_earphone_headphone: 'earphone_headphone', hasEarphoneHeadphone: 'earphone_headphone',
      tablet: 'tablet', has_tablet: 'tablet', hasTablet: 'tablet'
    };

    const booleanCols = ['mouse', 'has_mouse', 'keyboard', 'has_keyboard', 'laptop_stand', 'has_laptop_stand', 'ruf_pad', 'pendrive', 'company_mobile', 'external_camera', 'earphone_headphone', 'tablet'];

    if (certificate) {
      // --- UPDATE PATH ---
      console.log(`[CERT UPDATE] Updating existing record ID: ${certificate.id}`);
      let updateQuery = "UPDATE service_certificate_requests SET updated_at = DATEADD(MINUTE, 330, GETUTCDATE())";
      let sets = [];

      request.input('id', sql.Int, certificate.id);

      if (status) { sets.push("status = @status"); request.input('status', sql.NVarChar, status); }
      if (admin_remark !== undefined) { sets.push("admin_remark = @admin_remark"); request.input('admin_remark', sql.NVarChar, admin_remark); }
      if (certificate_url !== undefined) { sets.push("certificate_url = @certificate_url"); request.input('certificate_url', sql.NVarChar, certificate_url); }

      Object.keys(fieldMapping).forEach(key => {
        if (req.body[key] !== undefined) {
          const col = fieldMapping[key];
          if (!sets.some(s => s.startsWith(`${col} =`))) {
            sets.push(`${col} = @${col}`);
            const val = req.body[key];
            if (booleanCols.includes(col)) {
              request.input(col, sql.Bit, (val === true || val === 1 || String(val).toLowerCase() === 'true') ? 1 : 0);
            } else {
              request.input(col, sql.NVarChar, val);
            }
          }
        }
      });

      if (sets.length > 0) {
        updateQuery += ", " + sets.join(", ") + " WHERE id = @id";
        await request.query(updateQuery);
      }
      res.json({ success: true, message: 'Service certificate request updated successfully.', id: certificate.id });

    } else {
      // --- INSERT PATH (UPSERT Fallback) ---
      console.log(`[CERT UPDATE] Creating new record for Employee: ${targetEmpId}`);

      // Ensure we have mandatory fields or fallbacks
      const finalPurpose = purpose || 'Professional Requirement';
      const finalStatus = status || 'Pending';

      request.input('emp_id', sql.Int, targetEmpId);
      request.input('purpose', sql.NVarChar, finalPurpose);
      request.input('status', sql.NVarChar, finalStatus);

      let cols = ['employee_id', 'purpose', 'status', 'created_at', 'updated_at'];
      let vals = ['@emp_id', '@purpose', '@status', 'DATEADD(MINUTE, 330, GETUTCDATE())', 'DATEADD(MINUTE, 330, GETUTCDATE())'];

      Object.keys(fieldMapping).forEach(key => {
        const col = fieldMapping[key];
        if (req.body[key] !== undefined && !cols.includes(col) && col !== 'purpose') {
          cols.push(col);
          vals.push(`@${col}`);
          const val = req.body[key];
          if (booleanCols.includes(col)) {
            request.input(col, sql.Bit, (val === true || val === 1 || String(val).toLowerCase() === 'true') ? 1 : 0);
          } else {
            request.input(col, sql.NVarChar, val);
          }
        }
      });

      const insertQuery = `INSERT INTO service_certificate_requests (${cols.join(', ')}) OUTPUT INSERTED.id VALUES (${vals.join(', ')})`;
      const result = await request.query(insertQuery);
      res.status(201).json({ success: true, message: 'Service certificate request created successfully.', id: result.recordset[0].id });
    }

  } catch (err) {
    console.error('[SERVICE CERTIFICATE UPSERT ERROR]:', err);
    res.status(500).json({ error: 'Failed to process service certificate request' });
  }
});

// =========================================================================
// 57. EMPLOYEE MASTER PROFILE / DETAILS SYSTEM
// =========================================================================

/**
 * 57.1 Get My Employee Profile
 * Fetches base data from users/employee + extended data from employee_profiles
 */
app.get('/api/employee-profile/my', verifyToken, async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.Int, req.user.id)
      .query(`
        SELECT u.id as user_id, u.name as base_name, u.email as base_email, u.role as base_role, u.joining_date,
               u.phone_number, u.date_of_birth, u.about_me, u.team, u.reporting_manager_id,
               m.name AS reporting_manager_name,
               e.emp_id, e.designation as base_designation, e.team_name as base_team,
               p.* 
        FROM users u
        LEFT JOIN users m ON u.reporting_manager_id = m.id
        LEFT JOIN employee e ON u.id = e.user_id
        LEFT JOIN employee_profiles p ON u.id = p.employee_id
        WHERE u.id = @userId
      `);

    if (result.recordset.length > 0) {
      const profile = result.recordset[0];

      // Fetch Assets for this employee (Check both HR ID and DB internal ID fallback)
      let assets = [];
      const assetTargetId = profile.emp_id || profile.user_id;
      if (assetTargetId) {
        const assetResult = await pool.request()
          .input('target_id', sql.NVarChar, String(assetTargetId))
          .query('SELECT * FROM assets WHERE employee_id = @target_id ORDER BY created_at DESC');
        assets = assetResult.recordset.map(mapAssetRow);
      }

      profile.assets = assets;
      res.json({ success: true, data: profile });
    } else {
      res.status(404).json({ error: 'User not found in primary records.' });
    }
  } catch (err) {
    console.error('[GET MY PROFILE ERROR]:', err);
    res.status(500).json({ error: 'Failed to fetch employee profile' });
  }
});

/**
 * 57.2 Get All Employee Profiles (HR/Manager/Admin)
 */
app.get('/api/admin/employee-profiles', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  if (!role.includes('hr') && !role.includes('admin') && !role.includes('ceo') && !role.includes('manager') && !role.includes('lead')) {
    return res.status(403).json({ error: 'Unauthorized: Admin access required.' });
  }

  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT u.id as user_id, u.name as base_name, u.email as base_email, u.role as base_role,
             e.emp_id, e.designation as base_designation, e.team_name as base_team,
             p.* 
      FROM users u
      LEFT JOIN employee e ON u.id = e.user_id
      LEFT JOIN employee_profiles p ON u.id = p.employee_id
      ORDER BY u.name ASC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('[GET ALL PROFILES ERROR]:', err);
    res.status(500).json({ error: 'Failed to extract organizational employee profiles' });
  }
});

/**
 * 57.2.1 Get Specific Employee Profile by ID (HR/Manager/Admin)
 * Can search by either internal users.id OR the public emp_id
 */
/**
 * 57.2.1 Get Specific Employee Profile by ID
 * Can search by either internal users.id OR the public emp_id
 * Security: Checks if requester is admin OR the target employee themselves.
 */
app.get('/api/employee-profile/:id', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  const isAdmin = role.includes('hr') || role.includes('admin') || role.includes('ceo') || role.includes('manager') || role.includes('lead');
  const targetId = sanitizeNumericId(req.params.id);

  // Security Check: Only admins or the user themselves can view this
  // We'll verify this after we fetch the user_id from the DB if the input was an emp_id

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, targetId)
      .query(`
        SELECT u.id as user_id, u.name as base_name, u.email as base_email, u.role as base_role, u.joining_date,
               u.phone_number, u.date_of_birth, u.about_me, u.team, u.reporting_manager_id,
               m.name AS reporting_manager_name,
               e.emp_id, e.designation as base_designation, e.team_name as base_team,
               p.* 
        FROM users u
        LEFT JOIN users m ON u.reporting_manager_id = m.id
        LEFT JOIN employee e ON u.id = e.user_id
        LEFT JOIN employee_profiles p ON u.id = p.employee_id
        WHERE u.id = @id OR e.emp_id = @id
      `);

    if (result.recordset.length > 0) {
      const profile = result.recordset[0];

      // Authorization Enforcement
      if (!isAdmin && profile.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized: You can only view your own profile.' });
      }

      // Fetch Assets for this employee (Check both HR ID and DB internal ID fallback)
      let assets = [];
      const assetTargetId = profile.emp_id || profile.user_id;
      if (assetTargetId) {
        const assetResult = await pool.request()
          .input('target_id', sql.NVarChar, String(assetTargetId))
          .query('SELECT * FROM assets WHERE employee_id = @target_id ORDER BY created_at DESC');
        assets = assetResult.recordset.map(mapAssetRow);
      }

      profile.assets = assets;
      res.json({ success: true, data: profile });
    } else {
      res.status(404).json({ error: 'Employee not found in primary system records.' });
    }
  } catch (err) {
    console.error('[GET SPECIFIC PROFILE ERROR]:', err);
    res.status(500).json({ error: 'Failed to fetch employee profile' });
  }
});

/**
 * 57.1.a GET All Employee Profiles (Admin/HR Only)
 * Returns a complete list of profiles joined with basic user/employee info
 */
app.get('/api/employee-profiles', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  const isAdmin = role.includes('hr') || role.includes('admin') || role.includes('ceo') || role.includes('manager') || role.includes('lead');

  if (!isAdmin) {
    return res.status(403).json({ error: 'Unauthorized: Admin access required.' });
  }

  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT u.id as user_id, u.name as base_name, u.email as base_email, u.role as base_role, 
             e.emp_id, e.designation as base_designation, e.team_name as base_team,
             p.* 
      FROM users u
      LEFT JOIN employee e ON u.id = e.user_id
      LEFT JOIN employee_profiles p ON u.id = p.employee_id
      ORDER BY u.id DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('[LIST ALL PROFILES ERROR]:', err);
    res.status(500).json({ error: 'Failed to list employee profiles' });
  }
});

/**
 * 57.1.b DELETE Employee Profile (Admin/HR Only)
 */
app.delete('/api/employee-profile/:id', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  const isAdmin = role.includes('hr') || role.includes('admin') || role.includes('ceo') || role.includes('manager') || role.includes('lead');

  if (!isAdmin) {
    return res.status(403).json({ error: 'Unauthorized: Admin access required.' });
  }

  const { id } = req.params;

  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM employee_profiles WHERE id = @id OR employee_id = @id');

    res.json({ success: true, message: 'Profile record deleted successfully.' });
  } catch (err) {
    console.error('[DELETE PROFILE ERROR]:', err);
    res.status(500).json({ error: 'Failed to delete employee profile' });
  }
});

/**
 * 57.1.c GET Master Data (Admin/HR/Manager Only)
 * Aggregated view of profiles and assets for dashboarding
 */
app.get('/api/admin/master-data', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  const isAdmin = role.includes('hr') || role.includes('admin') || role.includes('ceo') || role.includes('manager') || role.includes('lead');

  if (!isAdmin) return res.status(403).json({ error: 'Unauthorized: Administrative access required.' });

  try {
    const pool = await getPool();

    // 1. Fetch all profiles
    const profilesRes = await pool.request().query(`
      SELECT u.id as user_id, u.name as base_name, u.email as base_email, u.role as base_role, 
             e.emp_id, e.designation as base_designation,
             p.* 
      FROM users u
      LEFT JOIN employee e ON u.id = e.user_id
      LEFT JOIN employee_profiles p ON u.id = p.employee_id
    `);

    // 2. Fetch all assets
    const assetsRes = await pool.request().query('SELECT * FROM assets ORDER BY id DESC');

    res.json({
      success: true,
      profiles: profilesRes.recordset,
      assets: assetsRes.recordset.map(mapAssetRow)
    });
  } catch (err) {
    console.error('[MASTER DATA ERROR]:', err);
    res.status(500).json({ error: 'Failed to aggregate master data' });
  }
});

/**
 * 57.1.d Update Specific Profile (PUT Alias)
 */
app.put('/api/employee-profile/:id', verifyToken, async (req, res) => {
  // Transfer to the main update logic
  req.body.employee_id = req.params.id;
  return handleProfileUpdate(req, res);
});

app.post('/api/employee-profile/update', verifyToken, async (req, res) => {
  return handleProfileUpdate(req, res);
});

app.post('/api/profile/update', verifyToken, async (req, res) => {
  return handleProfileUpdate(req, res);
});

// Aliases for frontend requests that include the email/id in the URL (Supports POST, PATCH, PUT)
app.post('/api/profile/update/:identifier', verifyToken, async (req, res) => {
  req.body.employee_id = req.params.identifier;
  return handleProfileUpdate(req, res);
});

app.patch('/api/profile/:identifier', verifyToken, async (req, res) => {
  req.body.employee_id = req.params.identifier;
  return handleProfileUpdate(req, res);
});

app.put('/api/profile/:identifier', verifyToken, async (req, res) => {
  req.body.employee_id = req.params.identifier;
  return handleProfileUpdate(req, res);
});

/**
 * 57.3 Create / Update Employee Profile
 */
const handleProfileUpdate = async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  const isAdmin = role.includes('hr') || role.includes('admin') || role.includes('ceo') || role.includes('manager') || role.includes('lead');

  let targetEmployeeId = req.body.employee_id || req.body.user_id || req.user.id;

  // If the value is an email (not a number), look up the real user ID
  if (targetEmployeeId && isNaN(parseInt(targetEmployeeId, 10))) {
    try {
      const pool = await getPool();
      const lookup = await pool.request()
        .input('email', sql.NVarChar, targetEmployeeId)
        .query('SELECT id FROM users WHERE email = @email');
      if (lookup.recordset.length > 0) {
        targetEmployeeId = lookup.recordset[0].id;
      } else {
        return res.status(404).json({ error: `User not found for identifier: ${targetEmployeeId}` });
      }
    } catch (lookupErr) {
      console.error('[PROFILE UPDATE] ID lookup failed:', lookupErr.message);
      return res.status(500).json({ error: 'Failed to resolve employee identity.' });
    }
  }

  targetEmployeeId = parseInt(targetEmployeeId, 10);

  // Security Check 1: Non-admins cannot edit someone else's profile
  if (!isAdmin && targetEmployeeId !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized: You can only edit your own profile.' });
  }

  // Field Defs
  const standardFields = [
    'emp_name', 'designation', 'status', 'place', 'separation', 'attrition_bucket',
    'reason', 'doj', 'lwd', 'ft_pt', 'department', 'process', 'moved', 'supervisor_l1',
    'supervisor_l2', 'pan_number', 'gender', 'dob', 'age', 'father_husband_name',
    'marital_status', 'nationality', 'religion', 'blood_group', 'official_email_id',
    'personal_email_id', 'contact_no', 'emergency_contact_no', 'present_address',
    'permanent_address', 'state', 'languages_known', 'aadhar_number', 'bank_name',
    'bank_account_no', 'ifsc_code', 'bank_branch', 'qualification', 'edu_completion_year',
    'college', 'university', 'previous_organization', 'previous_experience', 'source',
    'pancard_photo', 'adharcard_photo', 'experience_letter_photo'
  ];

  const adminFields = [
    'bgv_status', 'category', 'appointment_letter', 'approved_by_ceo',
    'onboarding_doc_completed', 'id_card', 'gross_salary_a', 'salary', 'pt', 'onboarding_link'
  ];

  // Aliases for frontend compatibility
  const fieldAliases = {
    'pan_card_copy': 'pancard_photo',
    'aadhar_card_copy': 'adharcard_photo',
    'exp_letter_copy': 'experience_letter_photo',
    'phoneNumber': 'contact_no',
    'phone_number': 'contact_no',
    'phone': 'contact_no'
  };

  // Security Check 2: Filter allowed fields based on role
  const allowedFields = isAdmin ? [...standardFields, ...adminFields] : standardFields;

  const updateData = {};

  // 1. Check direct matches
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updateData[field] = req.body[field];
    }
  }

  // 2. Check aliases
  for (const [frontendKey, dbKey] of Object.entries(fieldAliases)) {
    if (allowedFields.includes(dbKey) && req.body[frontendKey] !== undefined) {
      updateData[dbKey] = req.body[frontendKey];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: 'No valid fields provided for update or unauthorized fields attempted.' });
  }

  try {
    const pool = await getPool();

    // Check Existence with a separate request
    const checkReq = pool.request();
    checkReq.input('employee_id', sql.Int, targetEmployeeId);
    const checkRes = await checkReq.query('SELECT id FROM employee_profiles WHERE employee_id = @employee_id');
    const exists = checkRes.recordset.length > 0;

    // Build a NEW request for the actual insert/update
    const request = pool.request();
    request.input('employee_id', sql.Int, targetEmployeeId);

    // Dynamically bind inputs with safe type handling
    for (const [key, value] of Object.entries(updateData)) {
      if (['gross_salary_a', 'salary', 'pt'].includes(key)) {
        const parsed = parseFloat(value);
        request.input(key, sql.Decimal(18, 2), (value === '' || value === null || isNaN(parsed)) ? null : parsed);
      } else if (key === 'age') {
        const parsed = parseInt(value, 10);
        request.input(key, sql.Int, (value === '' || value === null || isNaN(parsed)) ? null : parsed);
      } else if (['doj', 'lwd', 'dob', 'separation'].includes(key)) {
        // Only pass valid date strings, otherwise null
        const isValidDate = value && value !== '' && !isNaN(new Date(value).getTime());
        request.input(key, sql.Date, isValidDate ? value : null);
      } else {
        request.input(key, sql.NVarChar(sql.MAX), (value === '' || value === null) ? null : String(value));
      }
    }

    let query = '';
    if (exists) {
      const setClauses = Object.keys(updateData).map(key => `${key} = @${key}`);
      query = `UPDATE employee_profiles SET ${setClauses.join(', ')}, updated_at = GETUTCDATE() WHERE employee_id = @employee_id`;
    } else {
      const cols = Object.keys(updateData);
      const vals = cols.map(c => `@${c}`);
      query = `INSERT INTO employee_profiles (employee_id, ${cols.join(', ')}) VALUES (@employee_id, ${vals.join(', ')})`;
    }

    await request.query(query);

    // 3. Sync Phone Number back to the core Users table if it was updated
    if (updateData.contact_no) {
      await pool.request()
        .input('userId', sql.Int, targetEmployeeId)
        .input('phone', sql.NVarChar, updateData.contact_no)
        .query('UPDATE users SET phone_number = @phone WHERE id = @userId');
    }

    // 4. Sync Profile Picture back to the core Users table if it was updated
    const profilePic = req.body.profile_picture || req.body.profileImage || req.body.profilePicture;
    if (profilePic) {
      await pool.request()
        .input('userId', sql.Int, targetEmployeeId)
        .input('pic', sql.NVarChar(sql.MAX), profilePic)
        .query('UPDATE users SET profile_picture = @pic WHERE id = @userId');
    }

    res.json({ success: true, message: 'Profile updated successfully.' });

  } catch (err) {
    console.error('[PROFILE UPDATE ERROR]:', err.message);
    res.status(500).json({ error: 'Failed to update employee profile.', details: err.message });
  }
};

// --- ASSET MANAGEMENT ENDPOINTS --- //

// GET: All assets
// GET: All assets / Filtered (Admin/Manager use)
// GET: All assets / Filtered (Admin/Manager use)
app.get('/api/assets', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  const isAdmin = role.includes('hr') || role.includes('admin') || role.includes('ceo') || role.includes('manager') || role.includes('lead');

  if (!isAdmin) return res.status(403).json({ error: 'Unauthorized: Admin access required.' });

  const { employee_id, uid } = req.query;
  const targetId = employee_id || uid;

  try {
    const pool = await getPool();
    const request = pool.request();
    let query = 'SELECT * FROM assets';

    if (targetId) {
      request.input('targetId', sql.NVarChar, String(targetId));
      query += ' WHERE employee_id = @targetId';
    }

    query += ' ORDER BY created_at DESC';
    const result = await request.query(query);
    res.json(result.recordset.map(mapAssetRow));
  } catch (err) {
    console.error('[ASSETS FETCH ERROR]:', err);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

// GET: My assets (authenticated user only)
app.get('/api/my-assets', verifyToken, async (req, res) => {
  const userId = req.user.id;
  const employee_id = sanitizeNumericId(req.query.employee_id);

  const role = (req.user.role || '').toLowerCase();
  const isAdmin = role.includes('hr') || role.includes('admin') || role.includes('ceo') || role.includes('manager') || role.includes('lead');

  try {
    const pool = await getPool();

    // Determine the target ID (Allow override if Admin)
    let primaryTargetId = userId;
    if (employee_id && (isAdmin || String(employee_id) === String(userId))) {
      primaryTargetId = employee_id;
    }

    // 1. Get official emp_id from employee table (if exists) for the primary target
    // We use TRY_CAST to safely compare NVarChar targetId with Int user_id
    const empResult = await pool.request()
      .input('targetId', sql.NVarChar, String(primaryTargetId))
      .query(`
        SELECT emp_id FROM employee 
        WHERE (TRY_CAST(@targetId AS INT) IS NOT NULL AND user_id = TRY_CAST(@targetId AS INT))
           OR emp_id = @targetId
      `);
    const officialEmpId = empResult.recordset[0]?.emp_id || primaryTargetId;

    // 2. Query assets for BOTH numeric target ID AND official HR ID
    const result = await pool.request()
      .input('targetId', sql.NVarChar, String(primaryTargetId))
      .input('empId', sql.NVarChar, String(officialEmpId))
      .query(`
        SELECT * FROM assets 
        WHERE employee_id = @targetId OR employee_id = @empId 
        ORDER BY created_at DESC
      `);

    res.json(result.recordset.map(mapAssetRow));
  } catch (err) {
    console.error('[MY ASSETS FETCH ERROR]:', err);
    res.status(500).json({ error: 'Failed to fetch your asset data' });
  }
});

// POST: Add new asset record
app.post('/api/assets', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  const isAdmin = role.includes('hr') || role.includes('admin') || role.includes('ceo') || role.includes('manager') || role.includes('lead');

  if (!isAdmin) return res.status(403).json({ error: 'Unauthorized: Admin access required.' });

  const data = req.body;
  try {
    const pool = await getPool();
    const request = pool.request();

    // Map inputs dynamically
    const columns = [
      'employee_id', 'employee_name', 'designation', 'joining_date', 'last_working_date',
      'laptop_details', 'mouse', 'keyboard', 'laptop_stand', 'ruf_pad',
      'pendrive', 'mobile', 'camera', 'earphone_headphone', 'tablet'
    ];

    columns.forEach(col => {
      let val = data[col] || data[col.replace(/_/g, '')] || data[col.charAt(0).toUpperCase() + col.slice(1).replace(/_/g, '')] || null;
      if (['joining_date', 'last_working_date'].includes(col)) {
        const isValidDate = val && !isNaN(new Date(val).getTime());
        request.input(col, sql.Date, isValidDate ? val : null);
      } else {
        request.input(col, sql.NVarChar, val ? String(val) : null);
      }
    });

    // --- UPSERT LOGIC: Check for duplicate employee_id ---
    const empId = data.employee_id || data.employeeId || null;
    let isUpdate = false;

    if (empId) {
      const checkRes = await pool.request()
        .input('checkId', sql.NVarChar, String(empId))
        .query('SELECT id FROM assets WHERE employee_id = @checkId');

      if (checkRes.recordset.length > 0) {
        isUpdate = true;
      }
    }

    let query;
    if (isUpdate) {
      const sets = columns.filter(c => c !== 'employee_id').map(c => `${c} = @${c}`);
      query = `
        UPDATE assets 
        SET ${sets.join(', ')}, updated_at = GETUTCDATE()
        WHERE employee_id = @employee_id
      `;
    } else {
      query = `
        INSERT INTO assets (${columns.join(', ')}, created_at, updated_at)
        VALUES (${columns.map(c => '@' + c).join(', ')}, GETUTCDATE(), GETUTCDATE())
      `;
    }

    await request.query(query);
    res.status(isUpdate ? 200 : 201).json({
      success: true,
      message: isUpdate ? 'Asset record updated successfully' : 'Asset record created successfully'
    });
  } catch (err) {
    console.error('[ASSET CREATE ERROR]:', err);
    res.status(500).json({ error: 'Failed to create asset record' });
  }
});

// PUT: Update asset record
app.put('/api/assets/:id', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  const isAdmin = role.includes('hr') || role.includes('admin') || role.includes('ceo') || role.includes('manager') || role.includes('lead');

  if (!isAdmin) return res.status(403).json({ error: 'Unauthorized: Admin access required.' });

  const { id } = req.params;
  const data = req.body;
  try {
    const pool = await getPool();
    const request = pool.request().input('id', sql.Int, id);

    const columns = [
      'employee_id', 'employee_name', 'designation', 'joining_date', 'last_working_date',
      'laptop_details', 'mouse', 'keyboard', 'laptop_stand', 'ruf_pad',
      'pendrive', 'mobile', 'camera', 'earphone_headphone', 'tablet'
    ];

    const updateClauses = [];
    columns.forEach(col => {
      if (data.hasOwnProperty(col)) {
        let val = data[col];
        if (['joining_date', 'last_working_date'].includes(col)) {
          const isValidDate = val && !isNaN(new Date(val).getTime());
          request.input(col, sql.Date, isValidDate ? val : null);
        } else {
          request.input(col, sql.NVarChar, val ? String(val) : null);
        }
        updateClauses.push(`${col} = @${col}`);
      }
    });

    if (updateClauses.length === 0) return res.status(400).json({ error: 'No data provided to update' });

    const query = `UPDATE assets SET ${updateClauses.join(', ')}, updated_at = GETDATE() WHERE id = @id`;
    await request.query(query);
    res.json({ success: true, message: 'Asset record updated' });
  } catch (err) {
    console.error('[ASSET UPDATE ERROR]:', err);
    res.status(500).json({ error: 'Failed to update asset record' });
  }
});

// DELETE: Remove asset record
app.delete('/api/assets/:id', verifyToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  const isAdmin = role.includes('hr') || role.includes('admin') || role.includes('ceo') || role.includes('manager') || role.includes('lead');

  if (!isAdmin) return res.status(403).json({ error: 'Unauthorized: Admin access required.' });

  const { id } = req.params;
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, id).query('DELETE FROM assets WHERE id = @id');
    res.json({ success: true, message: 'Asset record deleted' });
  } catch (err) {
    console.error('[ASSET DELETE ERROR]:', err);
    res.status(500).json({ error: 'Failed to delete asset record' });
  }
});

// --- GLOBAL API 404 HANDLER (JSON-ONLY) --- //
app.use('/api', (req, res) => {
  const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;
  const origin = req.get('origin') || 'Unknown Origin';
  const referer = req.get('referer') || 'No Referer';

  const diagnosticMsg = `Unmatched ${req.method} request to ${req.originalUrl}`;
  const diagnosticHistory = `IP: ${clientIP} | From: ${origin} | Referer: ${referer}`;

  Log.error('Route', diagnosticMsg, diagnosticHistory);
  Log.error('Route', diagnosticMsg, diagnosticHistory);

  res.status(404).json({
    error: 'API route not found',
    method: req.method,
    path: req.originalUrl,
    requestDetails: {
      ip: clientIP,
      origin: origin,
      referer: referer
    },
    suggestion: 'Double-check your API route spelling and method in the frontend application.'
  });
});

// DB Initialization for Employee Profiles table (ensure new photo columns exist)
const initializeProfilesTable = async () => {
  try {
    const pool = await getPool();
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_profiles')
      BEGIN
        -- We'll just ensure columns exist if table is managed elsewhere, 
        -- but if it doesn't exist at all, we create a basic skeleton
        CREATE TABLE employee_profiles (
          id INT IDENTITY(1,1) PRIMARY KEY,
          employee_id INT NOT NULL UNIQUE,
          pancard_photo NVARCHAR(MAX),
          adharcard_photo NVARCHAR(MAX),
          experience_letter_photo NVARCHAR(MAX),
          created_at DATETIME DEFAULT GETUTCDATE(),
          updated_at DATETIME DEFAULT GETUTCDATE()
        );
      END
      ELSE
      BEGIN
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_profiles') AND name = 'pancard_photo')
          ALTER TABLE employee_profiles ADD pancard_photo NVARCHAR(MAX);
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_profiles') AND name = 'adharcard_photo')
          ALTER TABLE employee_profiles ADD adharcard_photo NVARCHAR(MAX);
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_profiles') AND name = 'experience_letter_photo')
          ALTER TABLE employee_profiles ADD experience_letter_photo NVARCHAR(MAX);
      END
    `);
    Log.success('Database', 'Employee Profiles table ensures/ready');
  } catch (err) {
    Log.error('Database', 'Failed to initialize Employee Profiles table', err.message);
  }
};

// DB Initialization for Assets table
const initializeAssetsTable = async () => {
  try {
    const pool = await getPool();
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'assets')
      BEGIN
        CREATE TABLE assets (
          id INT IDENTITY(1,1) PRIMARY KEY,
          employee_id NVARCHAR(100),
          employee_name NVARCHAR(255),
          designation NVARCHAR(100),
          joining_date DATE,
          last_working_date DATE,
          laptop_details NVARCHAR(MAX),
          mouse NVARCHAR(255),
          keyboard NVARCHAR(255),
          laptop_stand NVARCHAR(255),
          ruf_pad NVARCHAR(255),
          pendrive NVARCHAR(255),
          mobile NVARCHAR(255),
          camera NVARCHAR(255),
          earphone_headphone NVARCHAR(255),
          tablet NVARCHAR(255),
          created_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE()
        );
        PRINT 'Assets table created successfully.';
      END
    `);
    Log.success('Database', 'Assets table is ready');
  } catch (err) {
    Log.error('Database', 'Failed to initialize Assets table', err.message);
  }
};

// DB Initialization for Employee Documents table
const initializeDocumentsTable = async () => {
  try {
    const pool = await getPool();
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'employee_documents')
      BEGIN
        CREATE TABLE employee_documents (
          id INT IDENTITY(1,1) PRIMARY KEY,
          employee_id INT NOT NULL,
          bank_name NVARCHAR(255),
          account_number NVARCHAR(255),
          ifsc_code NVARCHAR(100),
          branch_name NVARCHAR(255),
          account_type NVARCHAR(100),
          pan_number NVARCHAR(100),
          aadhaar_number NVARCHAR(100),
          passport_no NVARCHAR(100),
          driving_license NVARCHAR(100),
          pf_account_number NVARCHAR(100),
          uan_number NVARCHAR(100),
          esic_number NVARCHAR(100),
          nominee_name NVARCHAR(255),
          nominee_relationship NVARCHAR(100),
          nominee_contact NVARCHAR(100),
          pancard_photo NVARCHAR(MAX),
          adharcard_photo NVARCHAR(MAX),
          experience_letter_photo NVARCHAR(MAX),
          created_at DATETIME DEFAULT DATEADD(MINUTE, 330, GETUTCDATE()),
          updated_at DATETIME DEFAULT DATEADD(MINUTE, 330, GETUTCDATE())
        );
      END
      ELSE
      BEGIN
        -- Drop previously added columns if they exist (Migration/Revert)
        IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_documents') AND name = 'pancard_photo')
          ALTER TABLE employee_documents DROP COLUMN pancard_photo;
        IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_documents') AND name = 'adharcard_photo')
          ALTER TABLE employee_documents DROP COLUMN adharcard_photo;
        IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee_documents') AND name = 'experience_letter_photo')
          ALTER TABLE employee_documents DROP COLUMN experience_letter_photo;
      END
    `);
    Log.success('Database', 'Employee Documents table ensures/ready');
  } catch (err) {
    Log.error('Database', 'Failed to initialize Employee Documents table', err.message);
  }
};

// DB Initialization for Attendance Logs table (expand location columns)
const initializeAttendanceTable = async () => {
  try {
    const pool = await getPool();
    await pool.request().query(`
      IF EXISTS (SELECT * FROM sys.tables WHERE name = 'attendance_logs')
      BEGIN
        IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('attendance_logs') AND name = 'punchin_location')
          ALTER TABLE attendance_logs ALTER COLUMN punchin_location NVARCHAR(MAX);
        IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('attendance_logs') AND name = 'punchout_location')
          ALTER TABLE attendance_logs ALTER COLUMN punchout_location NVARCHAR(MAX);
      END
    `);
    Log.success('Database', 'Attendance logs table columns expanded');
  } catch (err) {
    Log.error('Database', 'Failed to expand attendance logs columns', err.message);
  }
};

// DB Initialization for Thread Comments (relax FK constraint)
const initializeThreadCommentsTable = async () => {
  try {
    const pool = await getPool();
    await pool.request().query(`
      IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK__thread_co__user___5BAD9CC8')
      BEGIN
        ALTER TABLE thread_comments DROP CONSTRAINT FK__thread_co__user___5BAD9CC8;
      END
    `);
    Log.success('Database', 'Thread comments foreign key constraint relaxed');
  } catch (err) {
    Log.error('Database', 'Failed to relax thread comments constraint', err.message);
  }
};

// DB Initialization for Thread Reactions (relax FK constraint)
const initializeThreadReactionsTable = async () => {
  try {
    const pool = await getPool();
    await pool.request().query(`
      IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK__thread_re__user___56E8E7AB')
      BEGIN
        ALTER TABLE thread_reactions DROP CONSTRAINT FK__thread_re__user___56E8E7AB;
      END
    `);
    Log.success('Database', 'Thread reactions foreign key constraint relaxed');
  } catch (err) {
    Log.error('Database', 'Failed to relax thread reactions constraint', err.message);
  }
};

// Initialize server ONLY after database is ready
poolPromise.then(async () => {
  console.clear();
  console.log(BANNER);
  await initializeProfilesTable();
  await initializeAssetsTable();
  await initializeDocumentsTable();
  await initializeAttendanceTable();
  await initializeThreadCommentsTable();
  await initializeThreadReactionsTable();
  app.listen(PORT, '0.0.0.0', () => {
    Log.ready(`System operational on port ${PORT}`);
    Log.divider();
  });
}).catch(err => {
  console.error('\nâ Œ FATAL: Backend failed to start due to database connectivity issues.');
  console.error('â Œ Error Details:', err.message);
  process.exit(1);
});