// Hosted company logo URL for universal email rendering
const logoUrl = 'https://navabharathtechnologies.com/assets/logo.png';

/**
 * Returns the HTML for the daily promotion reminder email sent to HR and Managers.
 */
const getPromotionReminderHtml = (candidates) => {
  const rows = candidates.map(c => `
    <tr>
      <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-size: 14px; vertical-align: top;"><strong>${c.name}</strong></td>
      <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-size: 14px; vertical-align: top;">${c.type}</td>
      <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-size: 14px; vertical-align: top;">${new Date(c.joining_date).toLocaleDateString()}</td>
      <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #b91c1c; font-weight: bold; vertical-align: top;">${c.duration} ${c.type === 'Intern' ? 'Months' : 'Days'} Completed</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @media only screen and (max-width: 600px) {
      .email-container {
        padding: 24px !important;
        border-radius: 4px !important;
      }
      h2 {
        font-size: 20px !important;
      }
      th {
        font-size: 13px !important;
        padding: 8px 4px !important;
      }
      td {
        font-size: 13px !important;
        padding: 8px 4px !important;
      }
    }
  </style>
</head>
<body style="margin:0;padding:10px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#334155;-webkit-text-size-adjust:100%;">
  <div class="email-container" style="max-width:650px;margin:10px auto;background:#ffffff;padding:40px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.05); border-top: 6px solid #1e40af; box-sizing:border-box;">
    <div style="text-align: left; margin-bottom: 25px; border-bottom: 1px solid #f1f5f9; padding-bottom: 15px;">
      <img src="${logoUrl}" alt="NBT Logo" style="width: 110px; max-width: 100%; height: auto; display: block;">
    </div>
    <h2 style="color:#1e3a8a;margin-top:0;font-size:22px;">📋 Daily Promotion Audit</h2>
    <p style="font-size:16px;line-height:1.6;margin:16px 0;">
      The following team members have completed their required onboarding/internship duration and are now eligible for **Full-time Promotion**.
    </p>
    
    <div style="overflow-x:auto;">
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px; min-width: 100%;">
        <thead>
          <tr style="background: #f1f5f9; text-align: left;">
            <th style="padding: 12px 8px; border-bottom: 2px solid #e2e8f0; font-size: 14px; font-weight: bold; color: #475569;">Name</th>
            <th style="padding: 12px 8px; border-bottom: 2px solid #e2e8f0; font-size: 14px; font-weight: bold; color: #475569;">Type</th>
            <th style="padding: 12px 8px; border-bottom: 2px solid #e2e8f0; font-size: 14px; font-weight: bold; color: #475569;">Joined</th>
            <th style="padding: 12px 8px; border-bottom: 2px solid #e2e8f0; font-size: 14px; font-weight: bold; color: #475569;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>

    <p style="font-size:16px;line-height:1.6; margin-top: 30px; margin-bottom: 0;">
      Please log in to the <strong>NBT Hub Admin Dashboard</strong> to review and confirm these promotions.
    </p>
    
    <div style="margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center;font-weight: 500;">
      This is an automated system notification from Navabharath Technologies.
    </div>
  </div>
</body>
</html>`;
};

module.exports = { getPromotionReminderHtml };
