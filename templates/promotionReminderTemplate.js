/**
 * Returns the HTML for the daily promotion reminder email sent to HR and Managers.
 */
const getPromotionReminderHtml = (candidates) => {
  const rows = candidates.map(c => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${c.name}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${c.type}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${new Date(c.joining_date).toLocaleDateString()}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #b91c1c; font-weight: bold;">${c.duration} ${c.type === 'Intern' ? 'Months' : 'Days'} Completed</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#f8fafc;font-family:Arial,sans-serif;color:#334155;">
  <div style="max-width:650px;margin:0 auto;background:#ffffff;padding:40px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.05); border-top: 6px solid #1e40af;">
    <div style="text-align: left; margin-bottom: 30px; border-bottom: 1px solid #f1f5f9; padding-bottom: 20px;">
      <img src="cid:NBTLogo" alt="NBT Logo" style="width: 120px; display: block;">
    </div>
    <h2 style="color:#1e3a8a;margin-top:0;">📋 Daily Promotion Audit: ${new Date().toLocaleDateString()}</h2>
    <p style="font-size:16px;line-height:1.6;">
      The following team members have completed their required onboarding/internship duration and are now eligible for **Full-time Promotion**.
    </p>
    
    <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
      <thead>
        <tr style="background: #f1f5f9; text-align: left;">
          <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Name</th>
          <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Type</th>
          <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Joined</th>
          <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <p style="font-size:16px;line-height:1.6; margin-top: 30px;">
      Please log in to the <strong>NBT Hub Admin Dashboard</strong> to review and confirm these promotions.
    </p>
    
    <div style="margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:center;">
      This is an automated system notification from Navabharath Technologies.
    </div>
  </div>
</body>
</html>`;
};

module.exports = { getPromotionReminderHtml };
