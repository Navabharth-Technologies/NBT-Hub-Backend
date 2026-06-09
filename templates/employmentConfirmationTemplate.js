// Hosted company logo URL for universal email rendering
const logoUrl = 'https://navabharathtechnologies.com/assets/logo.png';

/**
 * Returns the HTML for the employment confirmation email sent to employees upon being promoted to full-time status.
 */
const getEmploymentConfirmationHtml = (userName, designation, empId, teamName, joiningDate, plainPassword, email) => {
  const formattedDate = new Date(joiningDate).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Employment Confirmation</title>
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
      .grid-table td {
        display: block !important;
        width: 100% !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
        padding-bottom: 12px !important;
      }
      .grid-table tr:last-child td:last-child {
        padding-bottom: 0 !important;
      }
    }
  </style>
</head>
<body style="margin:0;padding:20px 10px;background-color:#f8fafc;font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;color:#334155;-webkit-text-size-adjust:100%;">
  <div class="email-container" style="max-width:600px;margin:20px auto;background-color:#ffffff;border-radius:16px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.05), 0 10px 10px -5px rgba(0,0,0,0.04); overflow: hidden; box-sizing:border-box;">
    
    <!-- Hero Header with Brand Colors Gradient -->
    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 45px 40px; text-align: center; color: #ffffff;">
      <div style="margin-bottom: 25px;">
        <img src="${logoUrl}" alt="NBT Logo" style="height: 40px; width: auto; display: inline-block; filter: brightness(0) invert(1);">
      </div>
      <h1 style="font-size: 26px; font-weight: 700; margin: 0 0 8px 0; letter-spacing: -0.025em; line-height: 1.2; text-shadow: 0 2px 4px rgba(0,0,0,0.15);">
        Welcome to the Team! 🎉
      </h1>
      <p style="font-size: 15px; margin: 0; opacity: 0.9; font-weight: 500; letter-spacing: 0.025em;">
        Official Employment Confirmation
      </p>
    </div>

    <!-- Email Content Body -->
    <div class="email-body" style="padding: 40px;">
      <p style="font-size:16px;line-height:1.6;margin:0 0 16px 0;color:#0f172a;font-weight: 600;">
        Dear ${userName},
      </p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 24px 0;color:#475569;">
        We are absolutely thrilled to inform you that your transition has been officially approved! On behalf of everyone at Navabharath Technologies, we officially confirm your appointment as a permanent, full-time employee.
      </p>
      
      <!-- Styled Grid Details Block -->
      <h3 style="margin: 0 0 16px 0; color:#0f172a; font-size:14px; font-weight:700; text-transform: uppercase; letter-spacing: 0.05em;">
        Employment Details
      </h3>
      
      <table class="grid-table" style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
        <tr>
          <td style="width: 33.33%; padding: 0 8px 16px 0; vertical-align: top;">
            <div style="background-color: #f8fafc; padding: 16px; border: 1px solid #e2e8f0; border-radius: 10px; min-height: 54px;">
              <span style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Employee ID</span>
              <strong style="font-size: 16px; color: #1e3a8a;">#${empId}</strong>
            </div>
          </td>
          <td style="width: 33.33%; padding: 0 8px 16px 8px; vertical-align: top;">
            <div style="background-color: #f8fafc; padding: 16px; border: 1px solid #e2e8f0; border-radius: 10px; min-height: 54px;">
              <span style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Designation</span>
              <strong style="font-size: 14px; color: #0f172a;">${designation}</strong>
            </div>
          </td>
          <td style="width: 33.33%; padding: 0 0 16px 8px; vertical-align: top;">
            <div style="background-color: #f8fafc; padding: 16px; border: 1px solid #e2e8f0; border-radius: 10px; min-height: 54px;">
              <span style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Joining Date</span>
              <strong style="font-size: 14px; color: #0f172a;">${formattedDate}</strong>
            </div>
          </td>
        </tr>
        <tr>
          <td colspan="3" style="padding: 0; vertical-align: top;">
            <div style="background-color: #eff6ff; padding: 16px; border: 1px dashed #60a5fa; border-radius: 10px; min-height: 54px; text-align: center;">
              <span style="font-size: 11px; font-weight: 600; color: #1e40af; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Your Login Credentials</span>
              <p style="font-size: 14px; color: #1e3a8a; margin: 0;">Email: <strong style="font-size: 16px;">${email}</strong></p>
              <p style="font-size: 14px; color: #1e3a8a; margin: 6px 0 0 0;">Password: <strong style="font-size: 16px; background: #bfdbfe; padding: 2px 8px; border-radius: 4px; letter-spacing: 1px;">${plainPassword}</strong></p>
              <p style="font-size: 11px; color: #3b82f6; margin: 8px 0 0 0; font-style: italic;">* Please change your password upon your first login.</p>
            </div>
          </td>
        </tr>
      </table>

      <!-- Bottom Paragraphs -->
      <p style="font-size:15px;line-height:1.6;margin: 0 0 16px 0;color:#475569;">
        Welcome officially to the core team! We are confident that you will continue to reach new heights and make significant contributions to the growth and success of Navabharath Technologies.
      </p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 30px 0;color:#475569;">
        Please contact the HR department if you have any questions or require any assistance during this transition.
      </p>
      
      <!-- Signature Section -->
      <hr style="border:none;border-top:1px solid #f1f5f9;margin:30px 0;" />
      <div style="text-align: center;">
        <p style="font-size:14px;color:#64748b;margin:0;line-height:1.5;">
          Warmest regards,<br/>
          <strong style="color: #0f172a; font-size: 15px; display: inline-block; margin-top: 5px;">Navabharath Technologies Team</strong>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
};

module.exports = { getEmploymentConfirmationHtml };
