// Hosted company logo URL for universal email rendering
const logoUrl = 'https://navabharathtechnologies.com/assets/logo.png';

/**
 * Returns the HTML for the Saturday Suggestion Reminder email.
 */
const getSaturdayReminderHtml = (userName) => `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#f8fafc;font-family:'Segoe UI', Roboto, Helvetica, Arial, sans-serif;color:#334155;">
  <div style="max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <div style="padding: 32px; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; border-radius: 8px 8px 0 0; text-align: center;">
      <img src="${logoUrl}" alt="NBT Logo" style="width: 120px; display: block; margin: 0 auto 15px auto;">
      <h1 style="margin: 0; font-size: 20px; color: #1e293b;">NBT HUB: Saturday Suggestion Reminder</h1>
    </div>
    
    <div style="padding: 32px;">
      <p style="margin: 0 0 16px 0; font-size: 16px;">Hello <strong>${userName}</strong>,</p>
      <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.5;">This is a quick note to remind you to submit your weekly suggestion on **NBT HUB**. We haven't seen your entry for this week yet.</p>
      
      <h3 style="font-size: 14px; color: #475569; text-transform: uppercase; margin-bottom: 12px;">Why we do this:</h3>
      <ul style="margin: 0 0 24px 0; padding-left: 20px; font-size: 15px; color: #475569; line-height: 1.6;">
        <li>To share new ideas to help us grow.</li>
        <li>To report any issues you faced this week.</li>
        <li>To help make our workplace better for everyone.</li>
      </ul>

      <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #f1f5f9;">
        <a href="https://navabharth-technologies.github.io/NBTHUB-2/" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 40px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 15px;">Submit Suggestion on NBT HUB</a>
        <p style="margin: 12px 0 0 0; font-size: 13px; color: #64748b;">Deadline: Today by End of Day</p>
      </div>
    </div>
  </div>
</body>
</html>
`;

const getSaturdayFinalWarningHtml = (userName) => `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#f8fafc;font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;color:#1e293b;">
  <div style="max-width: 600px; margin: 0 auto; border: 1px solid #fca5a5; border-radius: 8px; background-color: #ffffff; border-top: 4px solid #dc2626; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <div style="padding: 32px 40px; text-align: center; border-bottom: 1px solid #fecaca; background-color: #fef2f2;">
      <img src="${logoUrl}" alt="NBT Logo" style="width: 110px; display: block; margin: 0 auto 15px auto;">
      <p style="margin: 0; font-size: 12px; font-weight: 700; color: #991b1b; text-transform: uppercase; letter-spacing: 1.5px;">Urgent Compliance</p>
      <h1 style="margin: 8px 0 0 0; font-size: 22px; font-weight: 800; color: #7f1d1d;">Final Submission Notice</h1>
    </div>
    
    <div style="padding: 40px;">
      <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6;">Hello <strong>${userName}</strong>,</p>
      <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #475569;">Your mandatory weekly suggestion has not yet been recorded for today. Participation in this program is a core requirement for all team members via **NBT HUB**.</p>
      
      <div style="background-color: #fff1f2; border: 1px solid #fecaca; padding: 20px; border-radius: 6px; margin-bottom: 32px;">
        <p style="margin: 0; font-size: 14px; color: #991b1b; font-weight: 700;">FINAL DEADLINE: TODAY (EOD)</p>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #b91c1c;">Failure to submit may impact your weekly participation and performance metrics.</p>
      </div>

      <div style="text-align: left;">
        <a href="https://navabharth-technologies.github.io/NBTHUB-2/" style="display: inline-block; background-color: #dc2626; color: #ffffff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(220, 38, 38, 0.2);">Complete NBT HUB Submission</a>
      </div>
    </div>

    <div style="padding: 24px 40px; background-color: #fef2f2; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; border-top: 1px solid #fee2e2;">
      <p style="margin: 0; font-size: 12px; color: #991b1b; line-height: 1.5; font-weight: 500;">NBT Hub Audit System • Automated HR Enforcement</p>
    </div>
  </div>
</body>
</html>
`;

module.exports = {
  getSaturdayReminderHtml,
  getSaturdayFinalWarningHtml
};
