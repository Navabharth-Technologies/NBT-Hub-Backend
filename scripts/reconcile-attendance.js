const { poolPromise, sql } = require('../db');
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
        const pool = await poolPromise;
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
                .query('UPDATE users SET leave_balance = @balance WHERE id = @id');

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
        const pool = await poolPromise;
        const targetMonth = parseInt(month);
        const targetYear = parseInt(year);

        const userRes = await pool.request()
            .input('uid', sql.Int, userId)
            .query('SELECT id, name, joining_date FROM users WHERE id = @uid');
        
        if (userRes.recordset.length === 0) throw new Error('User not found');
        const user = userRes.recordset[0];
        if (!user.joining_date) {
            return { total_present: 0, total_leaves: 0, total_absent: 0, available_leave_balance: 0 };
        }

        const holidays = (await pool.request().query('SELECT holiday_date FROM holidays')).recordset.map(h => h.holiday_date.toISOString().split('T')[0]);
        const userLeaves = (await pool.request().input('uid', sql.Int, userId).query("SELECT start_date, end_date FROM leaves WHERE user_id = @uid AND hr_status = 'Approved'")).recordset;
        const userLogs = (await pool.request().input('uid', sql.Int, userId).query('SELECT punch_date, status FROM attendance_logs WHERE user_id = @uid')).recordset;

        const logMap = userLogs.reduce((acc, l) => {
            acc[l.punch_date.toISOString().split('T')[0]] = l.status;
            return acc;
        }, {});

        const joiningDate = new Date(user.joining_date);
        const probationEndDate = new Date(joiningDate);
        probationEndDate.setDate(joiningDate.getDate() + 90);
        
        const today = new Date();
        const auditEnd = new Date(today);
        auditEnd.setDate(today.getDate() - 1);

        // Accrual Calculation (1 day per month post-90 days)
        let totalAccrued = 0;
        if (today > probationEndDate) {
            const monthsDiff = (today.getFullYear() - probationEndDate.getFullYear()) * 12 + (today.getMonth() - probationEndDate.getMonth());
            totalAccrued = Math.max(0, monthsDiff);
        }

        let totalUsedLeaves = 0;
        userLeaves.forEach(l => {
            const start = new Date(l.start_date);
            const end = new Date(l.end_date);
            totalUsedLeaves += (Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1);
        });

        let totalUnaccountedGaps = 0;
        let monthlyPresent = 0;
        let monthlyLeaves = 0;
        let monthlyAbsents = 0;

        // --- CALCULATION BOUNDARIES ---
        // 1. Clean Slate: Only deduct for gaps starting from April 1st, 2026 (reliable data start)
        const ABSENT_DEDUCTION_START = new Date('2026-04-01');

        for (let d = new Date(joiningDate); d <= auditEnd; d.setDate(d.getDate() + 1)) {
            if (d.getDay() === 0) continue; 
            const dateStr = d.toISOString().split('T')[0];
            if (holidays.includes(dateStr)) continue;

            const isTargetMonth = (d.getMonth() + 1) === targetMonth && d.getFullYear() === targetYear;
            const dayStatus = logMap[dateStr];

            const isOnApprovedLeave = userLeaves.some(l => {
                const s = new Date(l.start_date);
                const e = new Date(l.end_date);
                return d >= s && d <= e;
            });

            if (dayStatus === 'P') {
                if (isTargetMonth) monthlyPresent++;
                continue;
            }

            if (isOnApprovedLeave) {
                if (isTargetMonth) monthlyLeaves++;
                continue;
            }

            // --- REFINED DEDUCTION LOGIC ---
            // Only count as an unaccounted gap (Absent deduction) if:
            // - The date is on or after the Clean Slate threshold (April 1st)
            // - The date is AFTER the employee's 90-day probation period
            if (d >= ABSENT_DEDUCTION_START && d > probationEndDate) {
                totalUnaccountedGaps++;
            }
            
            if (isTargetMonth) monthlyAbsents++;
        }

        return {
            employee_id: userId,
            month: targetMonth,
            year: targetYear,
            total_present: monthlyPresent,
            total_leaves: monthlyLeaves,
            total_absent: monthlyAbsents,
            available_leave_balance: totalAccrued - totalUsedLeaves - totalUnaccountedGaps
        };

    } catch (err) {
        throw err;
    }
}

module.exports = { reconcileAttendance, calculateUserMonthlyStats };