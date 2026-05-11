const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { getPool } = require('../db');
const sql = require('mssql');
// Using global fetch (available in Node 18+)

async function importAttendance() {
    console.log('--- 🚀 STARTING ATTENDANCE BATCH IMPORT ---');

    const baseUrl = process.env.TEAM_OFFICE_BASE_URL;
    const authToken = process.env.TEAM_OFFICE_AUTH_TOKEN;
    const EXCLUDED_EMPCODES = ['0088', '0099', '2025102', '20250'];

    if (!authToken || authToken === 'c3VwcG9ydDpzdXBwb3J0OnN1cHBvcnRAMTp0cnVl') {
        console.warn('⚠️ WARNING: You are using Demo Credentials (support@1). Data may not match your employees.');
    }

    try {
        const pool = await getPool();

        // --- NEW: Fetch Holidays List ---
        const holidaysRes = await pool.request().query('SELECT holiday_date, name FROM holidays');
        const holidayMap = holidaysRes.recordset.reduce((acc, h) => {
            acc[h.holiday_date.toISOString().split('T')[0]] = h.name;
            return acc;
        }, {});

        const loggedDates = new Set();
        const daysToImport = 2;
        const now = new Date();

        for (let i = 0; i < daysToImport; i++) {
            const syncDate = new Date(now.getTime() + (330 * 60 * 1000)); // Current IST
            syncDate.setDate(syncDate.getDate() - i); // Go back 'i' days

            const day = String(syncDate.getUTCDate()).padStart(2, '0');
            const month = String(syncDate.getUTCMonth() + 1).padStart(2, '0');
            const year = syncDate.getUTCFullYear();
            const formattedDate = `${day}/${month}/${year}`;

            console.log(`\n📅 Processing Date: ${formattedDate} (${i === 0 ? 'Today' : i + ' days ago'})`);

            const company = process.env.TEAM_OFFICE_COMPANY || 'Navabharath Technologies';
            const url = `${baseUrl}/DownloadInOutPunchData?Empcode=ALL&FromDate=${formattedDate}&ToDate=${formattedDate}&Company=${encodeURIComponent(company)}`;

            try {
                const response = await fetch(url, { headers: { 'Authorization': `Basic ${authToken}` } });
                const data = await response.json();
                const logs = data.InOutPunchData || [];

                console.log(`   Found ${logs.length} logs from Team Office.`);

                let successCount = 0;
                for (const log of logs) {
                    // --- DYNAMIC ID BRIDGE: AUTO-CORRECT 6-DIGIT EMPCODE (20250X -> 2025X) ---
                    const empId = parseInt(String(log.Empcode).trim());
                    if (isNaN(empId) || EXCLUDED_EMPCODES.includes(String(log.Empcode).trim())) continue;

                    // --- NEW: FETCH USER NAME FROM DB TO PREVENT COLLISIONS ---
                    // This prevents "Mohan Kumar P" (ID 2025101 -> 20251) from overwriting "Anish V N" (ID 20251)
                    let userMatch = null;
                    try {
                        const userRes = await pool.request()
                            .input('id', sql.Int, empId)
                            .query('SELECT name FROM users WHERE id = @id');
                        if (userRes.recordset.length > 0) {
                            userMatch = userRes.recordset[0];
                        }
                    } catch (e) {
                        console.error(`   ⚠️ Failed to verify user ${empId}:`, e.message);
                    }

                    if (!userMatch) {
                        console.warn(`   ⚠️ User not found in DB for Empcode: ${log.Empcode} (Mapped ID: ${empId})`);
                        continue;
                    }

                    // Strict Name Check: If the API name and DB name are completely different, skip this record
                    // (Ignore case, handle reversed names like "V N Anish" vs "Anish V N")
                    const clean = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '');
                    const apiName = clean(log.Name);
                    const dbName = clean(userMatch.name);
                    
                    // Simple check: if one name doesn't contain a significant part of the other, warn/skip
                    // But for now, we'll just log a warning and skip if they are totally different
                    if (apiName && dbName && !apiName.includes(dbName) && !dbName.includes(apiName)) {
                        // Special case: ignore if names are too short or empty
                        if (apiName.length > 3 && dbName.length > 3) {
                            console.warn(`   🛑 COLLISION DETECTED: API Name "${log.Name}" does not match DB Name "${userMatch.name}" for ID ${empId}. Skipping.`);
                            continue;
                        }
                    }

                    // --- NEW: Calculate WorkTime manually from IN/OUT times ---
                    const calcWorkTime = (inT, outT) => {
                        if (!inT || !outT || inT === '00:00' || outT === '00:00' || inT === '--:--' || outT === '--:--') return "00:00";
                        try {
                            const [inH, inM] = inT.split(':').map(Number);
                            const [outH, outM] = outT.split(':').map(Number);
                            if (isNaN(inH) || isNaN(inM) || isNaN(outH) || isNaN(outM)) return "00:00";
                            let diff = (outH * 60 + outM) - (inH * 60 + inM);
                            if (diff < 0) diff += 1440; // Handle shifts crossing midnight
                            return `${String(Math.floor(diff / 60)).padStart(2, '0')}:${String(diff % 60).padStart(2, '0')}`;
                        } catch { return "00:00"; }
                    };

                    const manualWorkTime = calcWorkTime(log.INTime, log.OUTTime);

                    // --- IMPROVED: Use Date from API if available ---
                    const [d, m, y] = log.DateString.split('/');
                    const punchDate = new Date(`${y}-${m}-${d}`);
                    const dateKey = punchDate.toISOString().split('T')[0];

                    // --- NEW RULE: Status calculation based on criteria ---
                    let finalStatus = log.Status;
                    
                    const isMissing = (time) => !time || time === '--:--' || time === '00:00';
                    const todayStr = new Date().toISOString().split('T')[0];
                    const recordDateStr = punchDate.toISOString().split('T')[0];
                    const isToday = recordDateStr === todayStr;

                    if (!isMissing(log.INTime) && isMissing(log.OUTTime)) {
                        // User has punched in but not out
                        if (isToday) {
                            finalStatus = 'In Office';
                        } else {
                            // If it was a past day and they never punched out, it's Absent
                            finalStatus = 'A';
                        }
                    } else if (!isMissing(log.INTime) && !isMissing(log.OUTTime)) {
                        // Both punches exist, calculate based on hours
                        try {
                            const [h, m] = manualWorkTime.split(':').map(n => parseInt(n, 10));
                            const totalHours = h + (m / 60);

                            if (totalHours >= 8) {
                                finalStatus = 'P';
                            } else if (totalHours >= 5 && totalHours < 8) {
                                finalStatus = 'Half Day';
                            } else {
                                finalStatus = 'A';
                            }
                        } catch (e) {
                            console.warn(`   ⚠️ Failed to parse WorkTime for Empcode ${log.Empcode}: ${manualWorkTime}`);
                        }
                    } else {
                        // No punches at all
                        finalStatus = 'A';
                    }

                    // --- NEW: Mark Sundays as Week Off (WO) if not already Present ---
                    if (syncDate.getDay() === 0 && finalStatus !== 'P' && finalStatus !== 'Half Day') {
                        finalStatus = 'WO';
                    }


                    let finalRemark = log.Remark;
                    if (holidayMap[dateKey]) {
                        if (!loggedDates.has(dateKey)) {
                            console.log(`   ✨ Holiday Detected: ${holidayMap[dateKey]}`);
                            loggedDates.add(dateKey);
                        }
                        finalStatus = 'Holiday';
                        finalRemark = holidayMap[dateKey];
                    }

                    try {
                        const res = await pool.request()
                            .input('userId', sql.Int, empId)
                            .input('punchDate', sql.Date, punchDate)
                            .input('inTime', sql.NVarChar, (log.INTime === '--:--' || log.INTime === '00:00') ? null : log.INTime)
                            .input('outTime', sql.NVarChar, (log.OUTTime === '--:--' || log.OUTTime === '00:00') ? null : log.OUTTime)
                            .input('workTime', sql.NVarChar, (manualWorkTime === '00:00') ? null : manualWorkTime)
                            .input('status', sql.NVarChar, finalStatus)
                            .input('remark', sql.NVarChar, finalRemark)
                            .query(`
                                IF EXISTS (SELECT 1 FROM users WHERE id = @userId)
                                BEGIN
                                    MERGE INTO attendance_logs WITH (HOLDLOCK) AS target
                                    USING (SELECT @userId AS user_id, @punchDate AS punch_date) AS source
                                    ON (target.user_id = source.user_id AND target.punch_date = source.punch_date)
                                    WHEN MATCHED THEN
                                        UPDATE SET in_time = @inTime, out_time = @outTime, work_time = @workTime, status = @status, remark = @remark, last_sync = GETDATE(), punchin_location = 'Biometric Terminal', punchout_location = 'Biometric Terminal'
                                    WHEN NOT MATCHED THEN
                                        INSERT (user_id, punch_date, in_time, out_time, work_time, status, remark, punchin_location, punchout_location)
                                        VALUES (@userId, @punchDate, @inTime, @outTime, @workTime, @status, @remark, 'Biometric Terminal', 'Biometric Terminal');
                                END
                            `);
                        if (res.rowsAffected[0] > 0) {
                            successCount++;
                        }
                    } catch (e) {
                        console.error(`   ⚠️ Sync failed for Empcode ${log.Empcode} (ID: ${empId}):`, e.message);
                    }
                }
                console.log(`   ✅ Synced ${successCount} records into attendance_logs.`);

            } catch (err) {
                console.error(`   ❌ Failed to fetch for ${formattedDate}:`, err.message);
            }
        }
    } catch (err) {
        throw err;
    }
}

// Export the function for use in the automated scheduler (node-cron)
module.exports = { importAttendance };

// Allow running directly from command line
if (require.main === module) {
    importAttendance().then(() => {
        console.log('--- ✨ BATCH IMPORT COMPLETE ---');
        process.exit(0);
    }).catch(err => {
        console.error('❌ CRITICAL ERROR:', err);
        process.exit(1);
    });
}
