const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { getPool } = require('../db');
const sql = require('mssql');

async function importRange(fromDateStr, toDateStr) {
    console.log(`--- 🚀 STARTING MANUAL RANGE IMPORT: ${fromDateStr} to ${toDateStr} ---`);

    const baseUrl = process.env.TEAM_OFFICE_BASE_URL || 'https://api.etimeoffice.com/api';
    const authToken = process.env.TEAM_OFFICE_AUTH_TOKEN;

    if (!authToken) {
        console.error('❌ Error: TEAM_OFFICE_AUTH_TOKEN not found in .env');
        process.exit(1);
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
        const url = `${baseUrl}/DownloadInOutPunchData?Empcode=ALL&FromDate=${fromDateStr}&ToDate=${toDateStr}`;

        console.log(`📡 Fetching from Etime Office: ${url}`);
        const response = await fetch(url, { headers: { 'Authorization': `Basic ${authToken}` } });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const data = await response.json();
        const logs = data.InOutPunchData || [];

        console.log(`📊 Found ${logs.length} total logs for this range.`);

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

            // Convert DD/MM/YYYY to Date object safely
            const [d, m, y] = log.DateString.split('/');
            const punchDate = new Date(`${y}-${m}-${d}`);

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
                    // fallback to log.Status
                }
            }

            // --- NEW: Mark Sundays as Week Off (WO) if not already Present ---
            if (punchDate.getDay() === 0 && finalStatus !== 'P' && finalStatus !== 'Half Day') {
                finalStatus = 'WO';
            }

            // --- NEW: Check for Holidays ---
            const dateKey = punchDate.toISOString().split('T')[0];
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
                if (res.rowsAffected[0] > 0) successCount++;
            } catch (e) {
                console.error(`   ⚠️ Sync failed for Empcode ${log.Empcode} (ID: ${empId}):`, e.message);
            }
        }
        console.log(`✅ Successfully imported/updated ${successCount} records into attendance_logs.`);
    } catch (err) {
        console.error('❌ Import Failed:', err.message);
    }
}

// Get dates from CLI arguments
const [, , from, to] = process.argv;
if (from && to) {
    importRange(from, to).then(() => {
        console.log('--- ✨ RANGE IMPORT COMPLETE ---');
        process.exit(0);
    }).catch(err => {
        console.error('❌ CRITICAL ERROR:', err);
        process.exit(1);
    });
} else {
    console.log('Usage: node scripts/import-range.js DD/MM/YYYY DD/MM/YYYY');
    console.log('Example: node scripts/import-range.js 21/04/2026 27/04/2026');
    process.exit(1);
}
