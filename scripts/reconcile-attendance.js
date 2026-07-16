const { getPool, sql } = require('../db');
const cron = require('node-cron');

/**
 * Attendance & Leave Reconciliation Engine
 * - Identifies gaps in attendance (Absents)
 * - Verifies if they are covered by Holidays or Approved Leaves
 * - Deducts from User Leave Balance for unverified gaps
 */
/**
 * High-Precision Leave Audit & Reconciliation Engine
 * - Calculates Accrued leaves (post-probation)
 * - Subtracts Approved leaves from history
 * - Subtracts Attendance Gaps (Absents) since Joining
 * - Updates User table with the final 'Real Balance'
 */
async function reconcileAttendance(userId = null, lookbackDays = null) {
    console.log(`\n[FULL AUDIT] Starting High-Precision Leave Reconciliation...`);

    try {
        const pool = await getPool();
        const users = userId ?
            (await pool.request().input('uid', sql.Int, userId).query('SELECT id FROM users WHERE id = @uid')).recordset :
            (await pool.request().query('SELECT id FROM users')).recordset;

        let totalSynchronized = 0;
        const today = new Date();

        for (const user of users) {
             // Re-use the granular logic
             const stats = await calculateUserMonthlyStats(user.id, today.getMonth() + 1, today.getFullYear());
             
             await pool.request()
                .input('id', sql.Int, user.id)
                .input('balance', sql.Decimal(5, 2), stats.available_leave_balance)
                .query('UPDATE leave_stats SET leaves_available = @balance, updated_at = GETDATE() WHERE employee_id = @id AND month = MONTH(DATEADD(MINUTE, 330, GETUTCDATE())) AND year = YEAR(DATEADD(MINUTE, 330, GETUTCDATE()))');

            console.log(`   [AUDIT] User ${user.id}: REAL BALANCE UPDATED TO ${stats.available_leave_balance}`);
            totalSynchronized++;
        }

        console.log(`\n[FULL AUDIT] Success. Synchronized ${totalSynchronized} users.\n`);
        return totalSynchronized;

    } catch (err) {
        console.error('[FULL AUDIT ERROR]:', err.message);
        throw err;
    }
}

/**
 * Calculates high-precision attendance stats for a specific month
 * plus the absolute Real Balance since joining.
 */
async function calculateUserMonthlyStats(userId, month, year) {
    try {
        const pool = await getPool();
        const monthNames = [
            "", "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];
        let targetMonth = 0;
        if (/^\d+$/.test(String(month).trim())) {
            targetMonth = parseInt(month);
        } else {
            const mStr = String(month).trim().toLowerCase();
            const idx = monthNames.findIndex(m => m.toLowerCase() === mStr);
            if (idx > 0) targetMonth = idx;
        }
        const targetYear = parseInt(year);

        const userRes = await pool.request()
            .input('uid', sql.Int, userId)
            .query('SELECT id, name, joining_date FROM users WHERE id = @uid');
        
        if (userRes.recordset.length === 0) throw new Error('User not found');
        const user = userRes.recordset[0];
        if (!user.joining_date) {
            return {
                total_present: 0,
                total_weekly_off: 0,
                total_holidays: 0,
                total_leaves: 0,
                total_absent: 0,
                total_work_ot: '0',
                total_ot_hours: '0:00',
                available_leave_balance: 0
            };
        }

        const holidays = (await pool.request().query('SELECT holiday_date FROM holidays')).recordset
            .filter(h => h.holiday_date)
            .map(h => h.holiday_date.toISOString().split('T')[0]);
        const userLeaves = (await pool.request().input('uid', sql.Int, userId).query("SELECT start_date, end_date FROM leaves WHERE user_id = @uid AND hr_status = 'Approved'")).recordset;
        
        // Select status, remark, and work_time to calculate weekly off, holidays, and OT accurately
        const userLogs = (await pool.request().input('uid', sql.Int, userId).query('SELECT punch_date, status, remark, work_time FROM attendance_logs WHERE user_id = @uid')).recordset;

        const logMap = userLogs.reduce((acc, l) => {
            if (l.punch_date) {
                try {
                    acc[l.punch_date.toISOString().split('T')[0]] = l.status;
                } catch (e) {
                    console.warn('[RECONCILE] Invalid punch_date:', l.punch_date);
                }
            }
            return acc;
        }, {});

        const jDate = new Date(user.joining_date);
        const joiningDate = new Date(Date.UTC(jDate.getUTCFullYear(), jDate.getUTCMonth(), jDate.getUTCDate()));
        const probationEndDate = new Date(joiningDate);
        probationEndDate.setUTCDate(joiningDate.getUTCDate() + 90);
        
        const today = new Date();
        const auditEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1));

        // Accrual Calculation (1 day per month post-90 days)
        let totalAccrued = 0;
        if (today > probationEndDate) {
            const monthsDiff = (today.getUTCFullYear() - probationEndDate.getUTCFullYear()) * 12 + (today.getUTCMonth() - probationEndDate.getUTCMonth());
            totalAccrued = Math.max(0, monthsDiff);
        }

        let totalUsedLeaves = 0;
        userLeaves.forEach(l => {
            const start = new Date(l.start_date);
            const end = new Date(l.end_date);
            totalUsedLeaves += (Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1);
        });

        let totalUnaccountedGaps = 0;
        // 1. Clean Slate: Only deduct for gaps starting from April 1st, 2026 (reliable data start)
        const ABSENT_DEDUCTION_START = new Date('2026-04-01');

        // Historical Audit Loop (calculates leaves used/unaccounted gaps since joining)
        for (let d = new Date(joiningDate); d <= auditEnd; d.setUTCDate(d.getUTCDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const dayStatus = logMap[dateStr];

            if (d.getUTCDay() === 0) continue; 
            if (holidays.includes(dateStr)) continue;

            const isOnApprovedLeave = userLeaves.some(l => {
                const s = new Date(l.start_date);
                const e = new Date(l.end_date);
                return d >= s && d <= e;
            });

            if (dayStatus === 'P' || dayStatus === 'Half Day') {
                if (dayStatus === 'Half Day' && d >= ABSENT_DEDUCTION_START && d > probationEndDate) {
                    totalUnaccountedGaps += 0.5;
                }
                continue;
            }

            if (isOnApprovedLeave) {
                continue;
            }

            if (d >= ABSENT_DEDUCTION_START && d > probationEndDate) {
                totalUnaccountedGaps++;
            }
        }

        // Dedicated Targeted Month Loop (calculates monthly roster stats perfectly for past, present, or future months)
        const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();
        const totalDaysInTargetMonth = getDaysInMonth(targetYear, targetMonth);
        
        let monthlyPresent = 0;
        let monthlyWeeklyOff = 0;
        let monthlyHolidays = 0;
        let monthlyLeaves = 0;
        let monthlyAbsents = 0;
        let monthlyWorkOTCount = 0;
        let totalOTMinutes = 0;

        for (let day = 1; day <= totalDaysInTargetMonth; day++) {
            const d = new Date(Date.UTC(targetYear, targetMonth - 1, day));
            const dateStr = d.toISOString().split('T')[0];
            const dayStatus = logMap[dateStr];
            const dayLog = userLogs.find(l => l.punch_date && l.punch_date.toISOString().split('T')[0] === dateStr);

            // Count Weekly Offs (Sundays or specifically marked 'WO' in logs)
            if (d.getUTCDay() === 0 || dayStatus === 'WO') {
                monthlyWeeklyOff++;
            }

            // Count official holidays
            if (holidays.includes(dateStr) || dayStatus === 'Holiday') {
                monthlyHolidays++;
            }

            // Count approved leaves in target month
            const isOnApprovedLeave = userLeaves.some(l => {
                const s = new Date(l.start_date);
                const e = new Date(l.end_date);
                return d >= s && d <= e;
            });
            if (isOnApprovedLeave) {
                monthlyLeaves++;
            }

            if (dayStatus === 'P' || dayStatus === 'Half Day') {
                const dayValue = dayStatus === 'Half Day' ? 0.5 : 1;
                monthlyPresent += dayValue;
                if (dayStatus === 'Half Day') {
                    monthlyAbsents += 0.5;
                }
            } else if (!isOnApprovedLeave && d.getUTCDay() !== 0 && !holidays.includes(dateStr)) {
                // If it is in the past or present, count as absent if no log and no leave/holiday/weekly off
                const todayOnlyDate = new Date();
                todayOnlyDate.setUTCHours(0,0,0,0);
                const dOnlyDate = new Date(d);
                dOnlyDate.setUTCHours(0,0,0,0);
                if (dOnlyDate <= todayOnlyDate) {
                    monthlyAbsents++;
                }
            }

            // Count days with Overtime remarks and sum the extra minutes (work_time > 8 hours/480 mins)
            if (dayLog && dayLog.remark && dayLog.remark.toUpperCase().includes('OT')) {
                monthlyWorkOTCount++;
                if (dayLog.work_time) {
                    try {
                        const [h, m] = dayLog.work_time.split(':').map(Number);
                        const totalMinutes = (h || 0) * 60 + (m || 0);
                        if (totalMinutes > 480) { // 8 hours standard shift
                            totalOTMinutes += (totalMinutes - 480);
                        }
                    } catch (e) {
                        console.warn('Failed to parse work_time for OT:', dayLog.work_time);
                    }
                }
            }
        }

        const otHours = Math.floor(totalOTMinutes / 60);
        const otMins = totalOTMinutes % 60;
        const totalOTHoursStr = `${otHours}:${otMins.toString().padStart(2, '0')}`;

        return {
            employee_id: userId,
            month: targetMonth,
            year: targetYear,
            total_present: monthlyPresent,
            total_weekly_off: monthlyWeeklyOff,
            total_holidays: monthlyHolidays,
            total_leaves: monthlyLeaves,
            total_absent: monthlyAbsents,
            total_work_ot: monthlyWorkOTCount.toString(),
            total_ot_hours: totalOTHoursStr,
            available_leaves: Math.max(0, totalAccrued - totalUsedLeaves - totalUnaccountedGaps),
            available_leave_balance: Math.max(0, totalAccrued - totalUsedLeaves - totalUnaccountedGaps)
        };

    } catch (err) {
        throw err;
    }
}

module.exports = { reconcileAttendance, calculateUserMonthlyStats };