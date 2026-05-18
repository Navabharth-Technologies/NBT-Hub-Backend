const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { getPool } = require('../db');
const sql = require('mssql');

async function importRange(fromDateStr, toDateStr) {
    console.log(`--- 🚀 STARTING ROBUST CHUNKED RANGE IMPORT: ${fromDateStr} to ${toDateStr} ---`);

    const baseUrl = process.env.TEAM_OFFICE_BASE_URL || 'https://api.etimeoffice.com/api';
    const authToken = process.env.TEAM_OFFICE_AUTH_TOKEN;
    const company = process.env.TEAM_OFFICE_COMPANY || 'Navabharath Technologies';
    const EXCLUDED_EMPCODES = ['0088', '0099', '2025102', '20250'];

    if (!authToken) {
        console.error('❌ Error: TEAM_OFFICE_AUTH_TOKEN not found in .env');
        process.exit(1);
    }

    try {
        const pool = await getPool();

        // 1. Fetch Users
        const usersRes = await pool.request().query('SELECT id, name FROM users');
        const users = usersRes.recordset;
        console.log(`👥 Tracking ${users.length} users from database.`);

        // 2. Fetch Holidays
        const holidaysRes = await pool.request().query('SELECT holiday_date, name FROM holidays');
        const holidayMap = holidaysRes.recordset.reduce((acc, h) => {
            const d = h.holiday_date;
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            acc[key] = h.name;
            return acc;
        }, {});

        // 3. Generate Date Range
        const [d1, m1, y1] = fromDateStr.split('/').map(Number);
        const [d2, m2, y2] = toDateStr.split('/').map(Number);
        const startDate = new Date(y1, m1 - 1, d1, 12, 0, 0);
        const endDate = new Date(y2, m2 - 1, d2, 12, 0, 0);
        
        const dateArray = [];
        let curr = new Date(startDate);
        while (curr <= endDate) {
            dateArray.push(new Date(curr));
            curr.setDate(curr.getDate() + 1);
        }
        console.log(`📅 Processing ${dateArray.length} days individually to prevent API truncation.`);

        const getCleanId = (code) => {
            if (!code) return null;
            return parseInt(String(code).trim());
        };

        const clean = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '');

        let totalProcessed = 0;
        let totalInserted = 0;

        // 4. Iterate through Every Date
        for (const dateObj of dateArray) {
            const day = String(dateObj.getDate()).padStart(2, '0');
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const year = dateObj.getFullYear();
            const formattedDate = `${day}/${month}/${year}`;
            const dateKey = `${year}-${month}-${day}`;

            console.log(`\n📡 Fetching for ${formattedDate}...`);
            const url = `${baseUrl}/DownloadInOutPunchData?Empcode=ALL&FromDate=${formattedDate}&ToDate=${formattedDate}&Company=${encodeURIComponent(company)}`;
            
            let dailyLogs = [];
            try {
                const response = await fetch(url, { headers: { 'Authorization': `Basic ${authToken}` } });
                if (response.ok) {
                    const data = await response.json();
                    dailyLogs = data.InOutPunchData || [];
                }
            } catch (e) {
                console.error(`   ⚠️ API Fetch failed for ${formattedDate}:`, e.message);
            }

            // Organize daily logs into a map for quick lookup
            const dailyLogMap = {};
            for (const log of dailyLogs) {
                const empId = getCleanId(log.Empcode);
                if (empId) dailyLogMap[empId] = log;
            }

            // 5. Process Every User for this specific Date
            for (const user of users) {
                if (EXCLUDED_EMPCODES.includes(String(user.id))) continue;

                const apiLog = dailyLogMap[user.id];
                
                let finalStatus = 'A';
                let inTime = null;
                let outTime = null;
                let workTime = null;
                let remark = null;
                let isCollision = false;

                if (apiLog) {
                    const apiName = clean(apiLog.Name);
                    const dbName = clean(user.name);
                    if (apiName && dbName && !apiName.includes(dbName) && !dbName.includes(apiName)) {
                        if (apiName.length > 3 && dbName.length > 3) {
                            isCollision = true;
                        }
                    }

                    if (!isCollision) {
                        inTime = (apiLog.INTime === '--:--' || apiLog.INTime === '00:00') ? null : apiLog.INTime;
                        outTime = (apiLog.OUTTime === '--:--' || apiLog.OUTTime === '00:00') ? null : apiLog.OUTTime;
                        remark = apiLog.Remark;
                        
                        if (inTime && outTime) {
                            try {
                                const [inH, inM] = inTime.split(':').map(Number);
                                const [outH, outM] = outTime.split(':').map(Number);
                                let diff = (outH * 60 + outM) - (inH * 60 + inM);
                                if (diff < 0) diff += 1440;
                                workTime = `${String(Math.floor(diff / 60)).padStart(2, '0')}:${String(diff % 60).padStart(2, '0')}`;
                                
                                const totalHours = Math.floor(diff / 60) + (diff % 60 / 60);
                                if (inTime > '10:15') {
                                    // Late login locked to Half Day or Absent
                                    if (totalHours >= 5) finalStatus = 'Half Day';
                                    else finalStatus = 'A';
                                } else {
                                    if (totalHours >= 8) finalStatus = 'P';
                                    else if (totalHours >= 5) finalStatus = 'Half Day';
                                    else finalStatus = 'A';
                                }
                            } catch (e) { finalStatus = apiLog.Status || 'A'; }
                        } else if (inTime) {
                            const isToday = dateKey === new Date().toISOString().split('T')[0];
                            if (inTime > '10:15') {
                                finalStatus = 'Half Day';
                            } else {
                                finalStatus = isToday ? 'In Office' : 'A';
                            }
                        }
                    }
                }

                // Global Rules (Sundays/Holidays)
                if (finalStatus === 'A') {
                    if (dateObj.getDay() === 0) finalStatus = 'WO';
                    if (holidayMap[dateKey]) {
                        finalStatus = 'Holiday';
                        remark = holidayMap[dateKey];
                    }
                }

                try {
                    const result = await pool.request()
                        .input('userId', sql.Int, user.id)
                        .input('punchDate', sql.Date, dateObj)
                        .input('inTime', sql.NVarChar, inTime)
                        .input('outTime', sql.NVarChar, outTime)
                        .input('workTime', sql.NVarChar, workTime)
                        .input('status', sql.NVarChar, finalStatus)
                        .input('remark', sql.NVarChar, remark)
                        .query(`
                            MERGE INTO attendance_logs WITH (HOLDLOCK) AS target
                            USING (SELECT @userId AS user_id, @punchDate AS punch_date) AS source
                            ON (target.user_id = source.user_id AND target.punch_date = source.punch_date)
                            WHEN MATCHED THEN
                                UPDATE SET in_time = @inTime, out_time = @outTime, work_time = @workTime, status = @status, remark = @remark, last_sync = GETDATE()
                            WHEN NOT MATCHED THEN
                                INSERT (user_id, punch_date, in_time, out_time, work_time, status, remark, punchin_location, punchout_location)
                                VALUES (@userId, @punchDate, @inTime, @outTime, @workTime, @status, @remark, 'Biometric Terminal', 'Biometric Terminal');
                        `);
                    if (result.rowsAffected.length > 0) {
                        totalInserted++;
                    }
                } catch (e) {
                    console.error(`   ❌ DB Error for ${user.id} on ${dateKey}:`, e.message);
                }
                totalProcessed++;
            }
            console.log(`   ✅ Finished processing all users for ${formattedDate}.`);
        }

        console.log(`\n✅ Robust Chunked import complete. Processed ${totalProcessed} user-days, updated ${totalInserted} records.`);

    } catch (err) {
        console.error('❌ Robust Import Failed:', err.message);
    }
}

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
    process.exit(1);
}
