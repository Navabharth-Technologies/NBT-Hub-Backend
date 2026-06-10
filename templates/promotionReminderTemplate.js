// Hosted company logo URL for universal email rendering
const logoUrl = 'https://navabharathtechnologies.com/assets/logo.png';

/**
 * Returns the HTML for the daily promotion reminder email sent to HR and Managers.
 */
const getPromotionReminderHtml = (candidates) => {
  const rows = candidates.map(c => {
    const isIntern = c.type === 'Intern';
    const typeBadgeStyle = isIntern
      ? 'background-color: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0;'
      : 'background-color: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe;';

    const durationText = isIntern
      ? `${c.duration} ${c.duration === 1 ? 'Month' : 'Months'}`
      : `${c.duration} ${c.duration === '1' ? 'Day' : 'Days'}`;

    const formattedDate = c.joining_date
      ? new Date(c.joining_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : 'N/A';

    return `
      <tr>
        <td style="padding: 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 600; color: #1e293b; vertical-align: middle;">
          ${c.name}
        </td>
        <td style="padding: 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; vertical-align: middle;">
          <span style="display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: 600; border-radius: 9999px; ${typeBadgeStyle}">
            ${c.type}
          </span>
        </td>
        <td style="padding: 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #64748b; vertical-align: middle;">
          ${formattedDate}
        </td>
        <td style="padding: 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 700; color: #b91c1c; vertical-align: middle;">
          ${durationText} Completed
        </td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Onboarding Promotion Audit</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    @media only screen and (max-width: 600px) {
      .email-container {
        margin: 0 !important;
        width: 100% !important;
        border-radius: 0 !important;
      }
      .email-body {
        padding: 24px !important;
      }
      th {
        font-size: 12px !important;
        padding: 12px 10px !important;
      }
      td {
        font-size: 12px !important;
        padding: 12px 10px !important;
      }
    }
  </style>
</head>
<body style="margin:0;padding:20px 10px;background-color:#f8fafc;font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;color:#334155;-webkit-text-size-adjust:100%;">
  <div class="email-container" style="max-width:650px;margin:20px auto;background-color:#ffffff;border-radius:16px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.05), 0 10px 10px -5px rgba(0,0,0,0.04); overflow: hidden; box-sizing:border-box;">
    
    <!-- Hero Header with Brand Colors Gradient -->
    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 45px 40px; text-align: center; color: #ffffff;">
      <div style="margin-bottom: 25px;">
        <img src="${logoUrl}" alt="NBT Logo" style="height: 65px; width: auto; display: inline-block; filter: brightness(0) invert(1);">
      </div>
      <h1 style="font-size: 26px; font-weight: 700; margin: 0 0 8px 0; letter-spacing: -0.025em; line-height: 1.2; text-shadow: 0 2px 4px rgba(0,0,0,0.15);">
        Promotion Audit 📋
      </h1>
      <p style="font-size: 15px; margin: 0; opacity: 0.9; font-weight: 500; letter-spacing: 0.025em;">
        Onboarding Status Report
      </p>
    </div>

    <!-- Email Content Body -->
    <div class="email-body" style="padding: 40px;">
      <p style="font-size:15px;line-height:1.6;margin:0 0 24px 0;color:#475569;">
        The following employees have successfully completed the required onboarding period and are now eligible for promotion to <strong>Full-time Employee</strong>. Approval is required to proceed with the promotion.
      </p>
      
      <!-- Table Container -->
      <div style="overflow-x:auto; border: 1px solid #e2e8f0; border-radius: 10px; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05);">
        <table style="width: 100%; border-collapse: collapse; text-align: left; background-color: #ffffff;">
          <thead>
            <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
              <th style="padding: 14px 16px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">Name</th>
              <th style="padding: 14px 16px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">Type</th>
              <th style="padding: 14px 16px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">Joining Date</th>
              <th style="padding: 14px 16px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">Duration</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>

      <!-- Action Button Card -->
      <div style="margin-top: 35px; padding: 25px; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; text-align: center;">
        <p style="font-size:15px;line-height:1.5; margin: 0 0 16px 0; color: #1e3a8a; font-weight: 600;">
          Please review the employee details and approve the promotion in the Admin Dashboard.
        </p>
        <a href="https://nbthub.navabharathtechnologies.com/admin/onboarding" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 28px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 10px rgba(37, 99, 235, 0.3); transition: background-color 0.2s;">
          Go to Admin Dashboard
        </a>
      </div>
      
      <!-- Footer -->
      <div style="margin-top:40px;padding-top:20px;border-top:1px solid #f1f5f9;font-size:12px;color:#94a3b8;text-align:center;line-height: 1.6;">
        This is an automated system notification from Navabharath Technologies HUB.<br>
        Please do not reply to this email directly.
      </div>
    </div>
  </div>
</body>
</html>`;
};

module.exports = { getPromotionReminderHtml };
