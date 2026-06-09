const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { getPool } = require('../db');
const sql = require('mssql');
// Using global fetch (available in Node 18+)

async function importAttendance() {
    console.log('--- 🚀 STARTING ATTENDANCE BATCH IMPORT ---');

    const baseUrl = process.env.TEAM_OFFICE_BASE_URL;
    const authToken = process.env.TEAM_OFFICE_AUTH_TOKEN;
    const company = process.env.TEAM_OFFICE_COMPANY || 'Navabharath Technologies';
    const EXCLUDED_EMPCODES = ['0088', '2025100', '0099', '20250'];

    if (!authToken || authToken === 'c3VwcG9ydDpzdXBwb3J0OnN1cHBvcnRAMTp0cnVl') {
        console.warn('⚠️ WARNING: You are using Demo Credentials. Data may not match your employees.');
    }

    try {
        const pool = await getPool();

        // --- Fetch Holidays List ---
        const holidaysRes = await pool.request().query('SELECT holiday_date, name FROM holidays');
        const holidayMap = holidaysRes.recordset.reduce((acc, h) => {
            acc[h.holiday_date.toISOString().split('T')[0]] = h.name;
            return acc;
        }, {});

        // --- Fetch all participants from DB to build a lookup map ---
        const usersRes = await pool.request().query(`
            SELECT id, name, joining_date FROM users WHERE id <> 20250
            UNION ALL
            SELECT id, name, joining_date FROM new_joinees
            UNION ALL
            SELECT id, name, joining_date FROM interns
        `);
        const usersMap = new Map();
        usersRes.recordset.forEach(u => usersMap.set(u.id, u));
        console.log(`\n👥 Loaded ${usersMap.size} users from DB (Including Interns & New Joinees).`);

        const daysToImport = 2;
        const now = new Date();

        for (let i = 0; i < daysToImport; i++) {
            const syncDate = new Date(now.getTime() + (330 * 60 * 1000)); // IST
            syncDate.setDate(syncDate.getDate() - i);

            const day = String(syncDate.getUTCDate()).padStart(2, '0');
            const month = String(syncDate.getUTCMonth() + 1).padStart(2, '0');
            const year = syncDate.getUTCFullYear();
            const formattedDate = `${day}/${month}/${year}`;

            console.log(`\n📅 Processing Date: ${formattedDate} (${i === 0 ? 'Today' : i + ' days ago'})`);

            // --- Fetch ALL company data in a single API call ---
            const url = `${baseUrl}/DownloadInOutPunchData?Empcode=ALL&FromDate=${formattedDate}&ToDate=${formattedDate}&Company=${encodeURIComponent(company)}`;
            console.log(`   🌐 Fetching: ${url}`);

            try {
                const response = await fetch(url, { headers: { 'Authorization': `Basic ${authToken}` } });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const data = await response.json();
                const logs = data.InOutPunchData || [];
                console.log(`   📥 Received ${logs.length} records from Etime Office for ${company}.`);

                let successCount = 0;
                let skippedCount = 0;

                for (const log of logs) {
                    if (!log.Empcode || !log.DateString) continue;

                    // --- DYNAMIC ID BRIDGE: AUTO-CORRECT MISFORMATTED EMPCODES ---
                    let rawEmpcode = String(log.Empcode).trim();

                    // Correct 6-digit 20250X -> 2025X
                    if (rawEmpcode.length === 6 && rawEmpcode.startsWith('20250')) {
                        rawEmpcode = rawEmpcode.replace('20250', '2025');
                    }
                    // Correct 7-digit 20251XX -> mathematically map to 202510 + sequence
                    else if (rawEmpcode.length === 7 && rawEmpcode.startsWith('20251')) {
                        const sequence = parseInt(rawEmpcode.substring(5), 10);
                        rawEmpcode = String(202510 + sequence);
                    }
                    // Correct 5-digit 2026X -> map to Intern ID X
                    else if (rawEmpcode.length === 5 && rawEmpcode.startsWith('2026')) {
                        rawEmpcode = rawEmpcode.replace('2026', '');
                    }

                    const empId = parseInt(rawEmpcode, 10);

                    if (isNaN(empId) || EXCLUDED_EMPCODES.includes(String(log.Empcode).trim())) continue;

                    // --- Only sync users that exist in local DB ---
                    const user = usersMap.get(empId);
                    if (!user) {
                        console.warn(`   ⚠️ No DB record for Empcode: ${log.Empcode} (ID: ${empId}) — skipping.`);
                        skippedCount++;
                        continue;
                    }

                    // --- Skip if punch is before joining date ---
                    const [d, m, y] = log.DateString.split('/');
                    const punchDateStr = `${y}-${m}-${d}`;
                    const punchDate = new Date(punchDateStr);
                    if (user.joining_date && punchDate < new Date(user.joining_date)) continue;

                    // --- Calculate WorkTime from IN/OUT times ---
                    const calcWorkTime = (inT, outT) => {
                        if (!inT || !outT || inT === '00:00' || outT === '00:00' || inT === '--:--' || outT === '--:--') return '00:00';
                        try {
                            const [inH, inM] = inT.split(':').map(Number);
                            const [outH, outM] = outT.split(':').map(Number);
                            if (isNaN(inH) || isNaN(inM) || isNaN(outH) || isNaN(outM)) return '00:00';
                            let diff = (outH * 60 + outM) - (inH * 60 + inM);
                            if (diff < 0) diff += 1440;
                            return `${String(Math.floor(diff / 60)).padStart(2, '0')}:${String(diff % 60).padStart(2, '0')}`;
                        } catch { return '00:00'; }
                    };
                    const manualWorkTime = calcWorkTime(log.INTime, log.OUTTime);

                    // --- Status calculation ---
                    const isMissing = (t) => !t || t === '--:--' || t === '00:00';
                    const todayStr = new Date().toISOString().split('T')[0];
                    const isToday = punchDateStr === todayStr;
                    let finalStatus = log.Status;

                    if (!isMissing(log.INTime) && isMissing(log.OUTTime)) {
                        if (isToday) {
                            let completedShift = false;
                            try {
                                const ist = new Date(new Date().getTime() + (330 * 60 * 1000));
                                const [inH, inM] = log.INTime.split(':').map(Number);
                                const curH = ist.getUTCHours();
                                const curM = ist.getUTCMinutes();
                                let elapsed = (curH * 60 + curM) - (inH * 60 + inM);
                                if (elapsed < 0) elapsed += 1440;
                                if (elapsed >= 480) completedShift = true;
                            } catch (e) { }
                            finalStatus = completedShift ? 'P' : (log.INTime > '10:15' ? 'Half Day' : 'In Office');
                        } else {
                            finalStatus = 'A';
                        }
                    } else if (!isMissing(log.INTime) && !isMissing(log.OUTTime)) {
                        try {
                            const [h, mi] = manualWorkTime.split(':').map(n => parseInt(n, 10));
                            const totalHours = h + (mi / 60);
                            if (log.INTime > '10:15') {
                                finalStatus = totalHours >= 5 ? 'Half Day' : 'A';
                            } else {
                                if (totalHours >= 8) finalStatus = 'P';
                                else if (totalHours >= 5) finalStatus = 'Half Day';
                                else finalStatus = 'A';
                            }
                        } catch (e) {
                            console.warn(`   ⚠️ WorkTime parse failed for ${log.Empcode}: ${manualWorkTime}`);
                        }
                    } else {
                        finalStatus = 'A';
                    }

                    // --- Sunday = Week Off if not Present ---
                    if (punchDate.getUTCDay() === 0 && finalStatus !== 'P' && finalStatus !== 'Half Day') {
                        finalStatus = 'WO';
                    }

                    // --- Holiday override ---
                    let finalRemark = log.Remark || '--';
                    if (holidayMap[punchDateStr]) {
                        finalStatus = 'Holiday';
                        finalRemark = holidayMap[punchDateStr];
                        console.log(`   ✨ Holiday: ${finalRemark} for user ${empId}`);
                    }

                    // --- UPSERT into attendance_logs ---
                    try {
                        const result = await pool.request()
                            .input('userId', sql.Int, empId)
                            .input('punchDate', sql.Date, punchDateStr)
                            .input('inTime', sql.NVarChar, isMissing(log.INTime) ? null : log.INTime)
                            .input('outTime', sql.NVarChar, isMissing(log.OUTTime) ? null : log.OUTTime)
                            .input('workTime', sql.NVarChar, manualWorkTime === '00:00' ? null : manualWorkTime)
                            .input('status', sql.NVarChar, finalStatus)
                            .input('remark', sql.NVarChar, finalRemark)
                            .query(`
                                MERGE INTO attendance_logs WITH (HOLDLOCK) AS target
                                USING (SELECT @userId AS user_id, @punchDate AS punch_date) AS source
                                ON (target.user_id = source.user_id AND target.punch_date = source.punch_date)
                                WHEN MATCHED THEN
                                    UPDATE SET in_time = @inTime, out_time = @outTime, work_time = @workTime,
                                               status = @status, remark = @remark, last_sync = GETDATE(),
                                               punchin_location = 'Biometric Terminal', punchout_location = 'Biometric Terminal'
                                WHEN NOT MATCHED THEN
                                    INSERT (user_id, punch_date, in_time, out_time, work_time, status, remark, punchin_location, punchout_location)
                                    VALUES (@userId, @punchDate, @inTime, @outTime, @workTime, @status, @remark, 'Biometric Terminal', 'Biometric Terminal');
                            `);
                        if (result.rowsAffected[0] > 0) successCount++;
                    } catch (e) {
                        console.error(`   ⚠️ Sync failed for Empcode ${log.Empcode} (ID: ${empId}):`, e.message);
                    }
                }

                console.log(`   ✅ Synced: ${successCount} | Skipped (no DB match): ${skippedCount} | Total from API: ${logs.length}`);

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
