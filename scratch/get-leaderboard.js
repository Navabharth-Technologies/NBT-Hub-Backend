const { getPool } = require('../db');
require('dotenv').config();

async function showLeaderboard() {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      WITH CombinedPoints AS (
        SELECT employee_id, points, 1 as is_award FROM employee_rewards WITH (NOLOCK)
        UNION ALL
        SELECT employee_id, total_points as points, 0 as is_award FROM quiz_completions WITH (NOLOCK)
      ),
      AllParticipants AS (
        SELECT id, name, role, team FROM users WITH (NOLOCK)
        UNION ALL
        SELECT id, name, role, 'New Joinee' as team FROM new_joinees WITH (NOLOCK)
        UNION ALL
        SELECT id, name, role, 'Intern' as team FROM interns WITH (NOLOCK)
      )
      SELECT TOP 20
        ap.id, ap.name, ap.role, ap.team,
        SUM(CASE WHEN cp.is_award = 1 THEN cp.points ELSE 0 END) as total_reward_points,
        SUM(CASE WHEN cp.is_award = 0 THEN cp.points ELSE 0 END) as total_quiz_points,
        ISNULL(SUM(cp.points), 0) as total_points,
        DENSE_RANK() OVER (ORDER BY ISNULL(SUM(cp.points), 0) DESC) as rank
      FROM AllParticipants ap
      LEFT JOIN CombinedPoints cp ON ap.id = cp.employee_id
      GROUP BY ap.id, ap.name, ap.role, ap.team
      ORDER BY total_points DESC, ap.name ASC
    `);

    console.log(JSON.stringify(result.recordset, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Error fetching leaderboard:', err);
    process.exit(1);
  }
}

showLeaderboard();
