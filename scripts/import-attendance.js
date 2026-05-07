const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { getPool } = require('../db');
const sql = require('mssql');
// Using global fetch (available in Node 18+)

async function importAttendance() {
    console.log('--- 🚀 STARTING ATTENDANCE BATCH IMPORT ---');

    const baseUrl = process.env.TEAM_OFFICE_BASE_URL;
    const authToken = process.env.TEAM_OFFICE_AUTH_TOKEN;

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

            const url = `${baseUrl}/DownloadInOutPunchData?Empcode=ALL&FromDate=${formattedDate}&ToDate=${formattedDate}`;

            try {
                const response = await fetch(url, { headers: { 'Authorization': `Basic ${authToken}` } });
                const data = await response.json();
                const logs = data.InOutPunchData || [];

                console.log(`   Found ${logs.length} logs from Team Office.`);

                let successCount = 0;
                for (const log of logs) {
                    // --- DYNAMIC ID BRIDGE: AUTO-CORRECT 6-DIGIT EMPCODE (20250X -> 2025X) ---
                    const autoCorrectId = (code) => {
                        if (!code) return code;
                        let strId = String(code).trim();

                        // Handle 7-digit pattern (e.g. 2025110 -> 202510)
                        if (strId.length === 7 && strId.substring(4, 5) === '1') {
                            strId = strId.slice(0, 4) + strId.slice(5);
                        }

                        // Handle 6-digit pattern (e.g. 202501 -> 20251)
                        if (strId.length === 6 && strId.substring(4, 5) === '0') {
                            strId = strId.slice(0, 4) + strId.slice(5);
                        }

                        return parseInt(strId);
                    };

                    const empId = autoCorrectId(log.Empcode);
                    if (isNaN(empId)) continue;

                    // --- NEW: Calculate WorkTime manually from IN/OUT times ---
                    const calcWorkTime = (inT, outT) => {
                        if (!inT || !outT || inT === '00:00' || outT === '00:00') return "00:00";
                        try {
                            const [inH, inM] = inT.split(':').map(Number);
                            const [outH, outM] = outT.split(':').map(Number);
                            let diff = (outH * 60 + outM) - (inH * 60 + inM);
                            if (diff < 0) diff += 1440; // Handle shifts crossing midnight
                            return `${String(Math.floor(diff / 60)).padStart(2, '0')}:${String(diff % 60).padStart(2, '0')}`;
                        } catch { return "00:00"; }
                    };

                    const manualWorkTime = calcWorkTime(log.INTime, log.OUTTime);

                    // --- NEW RULE: WorkTime calculation ---
                    let finalStatus = log.Status;
                    if (manualWorkTime && manualWorkTime.includes(':')) {
                        try {
                            const [h, m] = manualWorkTime.split(':').map(n => parseInt(n, 10));
                            const totalHours = h + (m / 60);

                            if (totalHours >= 8) {
                                finalStatus = 'P';
                            } else if (totalHours > 5 && totalHours < 8) {
                                finalStatus = 'Half Day';
                            } else {
                                finalStatus = 'A';
                            }
                        } catch (e) {
                            console.warn(`   ⚠️ Failed to parse WorkTime for Empcode ${log.Empcode}: ${manualWorkTime}`);
                        }
                    }

                    // --- NEW: Mark Sundays as Week Off (WO) if not already Present ---
                    if (syncDate.getDay() === 0 && finalStatus !== 'P' && finalStatus !== 'Half Day') {
                        finalStatus = 'WO';
                    }

                    // --- NEW: Check for Holidays ---
                    const dateKey = syncDate.toISOString().split('T')[0];
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
                            .input('punchDate', sql.Date, syncDate)
                            .input('inTime', sql.NVarChar, log.INTime)
                            .input('outTime', sql.NVarChar, log.OUTTime)
                            .input('workTime', sql.NVarChar, manualWorkTime)
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
                        } else {
                            console.warn(`   ⚠️ User not found in DB for Empcode: ${log.Empcode} (Mapped ID: ${empId})`);
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
