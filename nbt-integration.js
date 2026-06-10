/**
 * NBT Careers Portal ↔ HR Internal Tool Integration
 * Drop this file into your HR tool's backend (Node.js/Express)
 *
 * Install deps if not already present:
 *   npm install node-fetch crypto express
 */

const crypto = require('crypto');

// ─────────────────────────────────────────────────────────────────────
// CONFIGURATION — set these as env variables in YOUR HR tool
// ─────────────────────────────────────────────────────────────────────
const CAREERS_BACKEND = 'https://navabharathtechnologies-website-backend.onrender.com';
const ADMIN_API_KEY = process.env.NBT_ADMIN_KEY || '3bec00ca0c3b71053899c9de96085aaba8124dba7fd1efa903b47e23be80a746';
const WEBHOOK_SECRET = process.env.NBT_WEBHOOK_SECRET; // Must match ATS_WEBHOOK_SECRET on Render

// ═════════════════════════════════════════════════════════════════════
// PART 1: OUTGOING — HR Tool → Careers Website
// ═════════════════════════════════════════════════════════════════════

// ── 1A. Post a new job (call this when HR creates a job) ─────────────
async function publishJobToWebsite({
  title,
  team,
  location,
  type,         // 'Full-time' | 'Part-time' | 'Contract' | 'Internship'
  experience,
  description,
  atsJobId,     // Your internal job ID — store as reference
  isActive = true,
}) {
  try {
    const res = await fetch(`${CAREERS_BACKEND}/api/admin/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': ADMIN_API_KEY,
      },
      body: JSON.stringify({ title, team, location, type, experience, description, atsJobId, isActive }),
    });

    const data = await res.json();
    
    if (res.ok) {
      console.log(`✅ Job published to website: ${data.job.id}`);
      return data.job;
    }

    // --- RECOVERY LOGIC ---
    // If it failed (likely duplicate ID or constraint), try to find the existing job on the portal to link it
    console.warn(`⚠️ Sync conflict for "${title}". Attempting to recover existing ID...`);
    const searchRes = await fetch(`${CAREERS_BACKEND}/api/jobs`);
    const searchData = await searchRes.json();
    
    if (searchData.jobs) {
      // Find the job by title and team (closest match)
      const existing = searchData.jobs.find(j => j.title === title && j.team === team);
      if (existing) {
        console.log(`🔗 Found existing job on portal: ${existing.id}. Recovered and linked.`);
        return existing;
      }
    }

    throw new Error(`Failed to publish job: ${JSON.stringify(data)}`);
  } catch (err) {
    throw err;
  }
}

// ── 1B. Deactivate a job (call this when HR closes a position) ───────
async function deactivateJobOnWebsite(websiteJobId) {
  const res = await fetch(`${CAREERS_BACKEND}/api/admin/jobs/${websiteJobId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': ADMIN_API_KEY,
    },
    body: JSON.stringify({ isActive: false }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Failed to deactivate job: ${JSON.stringify(data)}`);
  console.log(`✅ Job deactivated on website: ${websiteJobId}`);
  return data;
}

// ── 1C. Update an existing job (call this when HR edits a job) ───────
async function updateJobOnWebsite(websiteJobId, jobData) {
  const res = await fetch(`${CAREERS_BACKEND}/api/admin/jobs/${websiteJobId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': ADMIN_API_KEY,
    },
    body: JSON.stringify(jobData),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Failed to update job: ${JSON.stringify(data)}`);
  console.log(`✅ Job updated on website: ${websiteJobId}`);
  return data;
}

// ── 1C. Push a status update (call this when HR moves an application) ─
async function pushStatusUpdate({
  websiteApplicationId, // The ID returned by our backend when candidate applied
  status,               // One of the valid statuses below
  note = '',            // Optional message shown to candidate
}) {
  // Map internal status to portal status
  const portalStatus = mapToWebsiteStatus(status);
  const payload = JSON.stringify({ applicationId: websiteApplicationId, status: portalStatus, note });

  // Sign the payload with HMAC-SHA256
  const secret = (WEBHOOK_SECRET || '').trim();
  
  if (!secret) {
    console.error('❌ NBT_WEBHOOK_SECRET is missing in .env');
  }

  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  console.log(`[DEBUG] Career Portal Sync:`);
  console.log(`  - Target: ${CAREERS_BACKEND}/api/webhooks/ats-update`);
  console.log(`  - Payload: ${payload}`);
  console.log(`  - Signature: ${signature}`);
  console.log(`  - Secret Verify: ${secret.substring(0,4)}...${secret.substring(secret.length-4)}`);

  const res = await fetch(`${CAREERS_BACKEND}/api/webhooks/ats-update`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ats-signature': `sha256=${signature}`,
    },
    body: payload,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Status update failed: ${JSON.stringify(data)}`);

  console.log(`✅ Status updated on website: ${status} for application ${websiteApplicationId}`);
  return data;
}

// ═════════════════════════════════════════════════════════════════════
// PART 2: INCOMING — Careers Website → HR Tool
// ═════════════════════════════════════════════════════════════════════
// Mount this router in your Express app:
//   const { incomingRouter } = require('./nbt-integration');
//   app.use('/webhooks/nbt', incomingRouter);
// Then set on Render:
//   ATS_WEBHOOK_URL = https://your-hr-tool.com/webhooks/nbt/application

const express = require('express');
const incomingRouter = express.Router();

incomingRouter.use(express.json());

// Debug: Log all incoming requests to the webhook router
incomingRouter.use((req, res, next) => {
  console.log(`[WEBHOOK DEBUG] ${req.method} ${req.originalUrl}`);
  console.log('Headers:', JSON.stringify(req.headers));
  next();
});

incomingRouter.get('/test', (req, res) => {
  res.send('Webhook endpoint is alive at /webhooks/nbt/test');
});



const driveService = require('./google-drive-service');

const downloadAndSaveResumeToDrive = async (resumeUrl, candidateName) => {
  if (!resumeUrl || typeof resumeUrl !== 'string' || !resumeUrl.startsWith('http')) {
    return resumeUrl;
  }
  
  // If it's already a Google Drive link, no need to download
  if (resumeUrl.includes('drive.google.com')) {
    return resumeUrl;
  }

  // Rewrite legacy Render domain to the new migrated Render domain
  let targetUrl = resumeUrl;
  if (resumeUrl.includes('company-website-backend-91ia.onrender.com')) {
    targetUrl = resumeUrl.replace('company-website-backend-91ia.onrender.com', 'navabharathtechnologies-website-backend.onrender.com');
  }

  try {
    console.log(`[DRIVE SYNC] Attempting to download candidate resume from URL: ${targetUrl}`);
    const downloadFileFromUrl = (url) => {
      return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? require('https') : require('http');
        const req = protocol.get(url, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302) {
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              downloadFileFromUrl(redirectUrl).then(resolve).catch(reject);
              return;
            }
          }
          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download resume, status code: ${response.statusCode}`));
            return;
          }
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => resolve(Buffer.concat(chunks)));
        });

        req.on('error', reject);
        // Timeout covers both connection-level and response-level hangs
        req.setTimeout(5000, () => { req.destroy(); reject(new Error('Request timeout (5s)')); });
      });
    };

    // Wrap with a hard deadline using Promise.race to kill socket-level hangs
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Hard timeout (8s) — host unreachable')), 8000)
    );

    const bufferData = await Promise.race([downloadFileFromUrl(targetUrl), timeoutPromise]);
    
    let filename = 'resume.pdf';
    const urlParts = targetUrl.split('?')[0].split('/');
    const lastPart = urlParts[urlParts.length - 1];
    if (lastPart && lastPart.toLowerCase().endsWith('.pdf')) {
      filename = lastPart;
    } else {
      filename = `${(candidateName || 'Candidate').replace(/\s+/g, '_')}_Resume.pdf`;
    }

    console.log(`[DRIVE SYNC] Uploading downloaded file to Google Drive: ${filename}`);
    const driveUrl = await driveService.uploadFileToDrive(bufferData, Date.now() + '-' + filename.replace(/\s+/g, '-'), 'application/pdf');
    if (driveUrl) {
      console.log(`[DRIVE SYNC] Resume successfully saved to Drive: ${driveUrl}`);
      return driveUrl;
    }
  } catch (err) {
    console.error(`[DRIVE SYNC ERROR] Failed to download or save resume to Drive:`, err.message);
  }
  return targetUrl; // Fallback to the target URL (rewritten or original)
};

// ── 2A. Receive new application from careers website ─────────────────
incomingRouter.post('/application', async (req, res) => {
  try {
    // Verify Signature
    const signature = req.headers['x-ats-signature'];
    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.error('❌ Webhook signature verification failed');
      console.error('Expected:', expectedSignature);
      console.error('Received:', signature);
      // return res.status(401).json({ error: 'Invalid signature' }); // Uncomment after debugging
    }

    console.log(`[WEBHOOK] Received payload:`, JSON.stringify(req.body, null, 2));

    const {
      source,           // "navabharathtechnologies-website"
      candidateName,
      email,
      phone,
      jobTitle,
      atsJobId,         // Your internal job ID (the one you passed when publishing the job)
      resumeUrl,        // Direct download link to the resume PDF
      coverLetter,
      appliedAt,
      websiteApplicationId, // Our backend's application UUID — save this! needed for status updates
      location,
      department,
      experience,
    } = req.body;

    console.log(`📩 New application received: ${candidateName} → ${jobTitle} (ATS ID: ${atsJobId})`);

    // Proactively download the resume from the external website's server and upload to Google Drive
    const finalResumeUrl = await downloadAndSaveResumeToDrive(resumeUrl, candidateName);

    // ──────────────────────────────────────────────────────────────
    const { sql, getPool } = require('./db');
    const pool = await getPool();

    // Sanitize atsJobId: if it's a string like "123", parseInt it. 
    // If it's missing, it will be null (which is fine if DB allows it)
    const sanitizedJobId = atsJobId ? parseInt(String(atsJobId).replace(/,/g, ''), 10) : null;
    
    // Safely parse Date
    let finalAppliedAt = new Date();
    if (appliedAt) {
      const d = new Date(appliedAt);
      if (!isNaN(d.getTime())) {
        finalAppliedAt = d;
      }
    }

    await pool.request()
      .input('name', sql.NVarChar, candidateName || 'Unknown')
      .input('email', sql.NVarChar, email || 'no-email@provided.com')
      .input('phone', sql.NVarChar, phone || '')
      .input('title', sql.NVarChar, jobTitle || 'General Application')
      .input('jobId', sql.Int, sanitizedJobId)
      .input('webAppId', sql.NVarChar, websiteApplicationId || null)
      .input('resume', sql.NVarChar, finalResumeUrl || '')
      .input('cover', sql.NVarChar, coverLetter || '')
      .input('applied', sql.DateTime, finalAppliedAt)
      .input('loc', sql.NVarChar, location || '')
      .input('dept', sql.NVarChar, department || '')
      .input('exp', sql.NVarChar, experience || '')
      .query(`
        INSERT INTO job_applications (candidate_name, email, phone, job_title, internal_job_id, website_application_id, resume_url, cover_letter, status, applied_at, location, department, experience)
        VALUES (@name, @email, @phone, @title, @jobId, @webAppId, @resume, @cover, 'APPLIED', @applied, @loc, @dept, @exp)
      `);
    //
    // ──────────────────────────────────────────────────────────────

    // Acknowledge receipt — IMPORTANT: respond 200 quickly
    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('❌ Error processing incoming application:');
    console.error(err); 
    return res.status(500).json({ error: 'Failed to process application', details: err.message });
  }
});

// ── 2B. Pull/Sync applications from careers website (Fallback pull-sync mechanism) ──
async function syncApplications() {
  try {
    const { sql, getPool } = require('./db');
    const pool = await getPool();

    console.log(`[SYNC] Querying external Careers website at ${CAREERS_BACKEND}/api/admin/applications...`);
    const fetchController = new AbortController();
    const fetchTimeout = setTimeout(() => fetchController.abort(), 60000); // Increased from 15s to 60s for Render cold starts
    const resWeb = await fetch(`${CAREERS_BACKEND}/api/admin/applications`, {
      headers: { 'x-admin-key': ADMIN_API_KEY },
      signal: fetchController.signal,
    }).finally(() => clearTimeout(fetchTimeout));

    if (!resWeb.ok) {
      throw new Error(`External API responded with status ${resWeb.status}`);
    }

    const webData = await resWeb.json();
    const apps = webData.applications || [];
    console.log(`[SYNC] Received ${apps.length} applications from Careers Website. Synced count checking...`);

    let importedCount = 0;
    for (const app of apps) {
      // Check if already imported
      const checkDup = await pool.request()
        .input('webAppId', sql.NVarChar, app.id)
        .query('SELECT id FROM job_applications WHERE website_application_id = @webAppId');

      if (checkDup.recordset.length === 0) {
        // Import it!
        // atsJobId is stored as reference to the local job posting's internal ID
        const sanitizedJobId = app.atsJobId ? parseInt(String(app.atsJobId).replace(/,/g, ''), 10) : null;
        let finalAppliedAt = app.submittedAt ? new Date(app.submittedAt) : new Date();
        if (isNaN(finalAppliedAt.getTime())) finalAppliedAt = new Date();

        // Proactively download the resume from the external website and upload to Google Drive
        const finalResumeUrl = await downloadAndSaveResumeToDrive(app.resumeUrl, app.candidate?.name);

        await pool.request()
          .input('name', sql.NVarChar, app.candidate?.name || 'Unknown')
          .input('email', sql.NVarChar, app.candidate?.email || 'no-email@provided.com')
          .input('phone', sql.NVarChar, app.candidate?.phone || '')
          .input('title', sql.NVarChar, app.job?.title || 'General Application')
          .input('jobId', sql.Int, sanitizedJobId)
          .input('webAppId', sql.NVarChar, app.id)
          .input('resume', sql.NVarChar, finalResumeUrl || '')
          .input('cover', sql.NVarChar, app.coverLetter || '')
          .input('applied', sql.DateTime, finalAppliedAt)
          .input('loc', sql.NVarChar, app.location || '')
          .input('dept', sql.NVarChar, app.department || '')
          .input('exp', sql.NVarChar, app.experience || '')
          .query(`
            INSERT INTO job_applications (candidate_name, email, phone, job_title, internal_job_id, website_application_id, resume_url, cover_letter, status, applied_at, location, department, experience)
            VALUES (@name, @email, @phone, @title, @jobId, @webAppId, @resume, @cover, 'APPLIED', @applied, @loc, @dept, @exp)
          `);
        console.log(`[SYNC] Imported new job application: ${app.candidate?.name} (${app.job?.title})`);
        importedCount++;
      }
    }
    console.log(`[SYNC] Sync complete! Imported ${importedCount} new application(s).`);
    return { success: true, imported: importedCount };
  } catch (err) {
    console.error('❌ Error during application pull-sync:', err.message);
    return { success: false, error: err.message };
  }
}

// ═════════════════════════════════════════════════════════════════════
// PART 3: USAGE EXAMPLES — Wire into your HR tool's existing routes
// ═════════════════════════════════════════════════════════════════════

/*
  ── Example 1: Auto-publish job when HR creates one ─────────────────

  // In your HR tool's job creation route:
  router.post('/jobs', async (req, res) => {
    const job = await db.job.create({ data: req.body });

    // Push to careers website
    try {
      const websiteJob = await publishJobToWebsite({
        title:       job.title,
        team:        job.department,
        location:    job.location,
        type:        job.employmentType,   // map to: Full-time/Part-time/Contract/Internship
        experience:  job.experienceRequired,
        description: job.description,
        atsJobId:    job.id,               // your internal ID
      });
      await db.job.update({ where: { id: job.id }, data: { websiteJobId: websiteJob.id } });
    } catch (e) {
      console.error('Website sync failed (non-blocking):', e.message);
    }

    return res.status(201).json({ job });
  });


  ── Example 2: Auto-update status when HR moves application ─────────

  // In your HR tool's status update route:
  router.patch('/applications/:id/status', async (req, res) => {
    const { status, note } = req.body;
    const app = await db.application.findUnique({ where: { id: req.params.id } });

    await db.application.update({ where: { id: app.id }, data: { status } });

    // Sync to careers website → triggers candidate email automatically
    if (app.websiteApplicationId) {
      try {
        await pushStatusUpdate({
          websiteApplicationId: app.websiteApplicationId,
          status:  mapToWebsiteStatus(status), // see mapping below
          note,
        });
      } catch (e) {
        console.error('Status sync failed (non-blocking):', e.message);
      }
    }

    return res.json({ success: true });
  });
*/


function mapToWebsiteStatus(internalStatus) {
  // Already aligned with website status codes
  return internalStatus; 
}

// ═════════════════════════════════════════════════════════════════════
// EXPORTS
// ═════════════════════════════════════════════════════════════════════
module.exports = {
  publishJobToWebsite,
  updateJobOnWebsite,
  deactivateJobOnWebsite,
  deleteJobFromWebsite: deactivateJobOnWebsite, // Alias for deletion
  pushStatusUpdate,
  updateCandidateStatus: pushStatusUpdate, // Alias for status updates
  mapToWebsiteStatus,
  incomingRouter,
  syncApplications,
};
