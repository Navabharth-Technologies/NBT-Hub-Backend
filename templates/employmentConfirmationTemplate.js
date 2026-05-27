// Hosted company logo URL for universal email rendering
const logoUrl = 'https://navabharathtechnologies.com/assets/logo.png';

/**
 * Returns the HTML for the employment confirmation email sent to employees upon being promoted to full-time status.
 */
const getEmploymentConfirmationHtml = (userName, designation, empId, teamName, joiningDate) => {
  const formattedDate = new Date(joiningDate).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

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
      p {
        font-size: 15px !important;
      }
      .details-table td {
        padding: 6px 0 !important;
        display: block !important;
        width: 100% !important;
      }
      .details-table tr {
        margin-bottom: 12px !important;
        display: block !important;
      }
    }
  </style>
</head>
<body style="margin:0;padding:10px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#334155;-webkit-text-size-adjust:100%;">
  <div class="email-container" style="max-width:600px;margin:10px auto;background:#ffffff;padding:40px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.05); border-top: 6px solid #1e3a8a; box-sizing:border-box;">
    <div style="text-align: center; margin-bottom: 30px;">
      <img src="${logoUrl}" alt="NBT Logo" style="width: 130px; max-width:100%; height:auto; display: block; margin: 0 auto;">
    </div>
    <h2 style="color:#1e3a8a;margin-top:0;text-align:center;font-size:24px;">Official Confirmation of Employment 💼</h2>
    <p style="font-size:16px;line-height:1.6;margin:16px 0;">
      Dear <strong>${userName}</strong>,
    </p>
    <p style="font-size:16px;line-height:1.6;margin:16px 0;">
      We are pleased to inform you that your transition has been officially approved! On behalf of Navabharath Technologies, we officially confirm your appointment as a permanent, full-time employee.
    </p>
    
    <div style="margin:25px 0;padding:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;box-sizing:border-box;">
      <h3 style="margin-top:0;color:#0f172a;font-size:16px;border-bottom:1px solid #e2e8f0;padding-bottom:10px;margin-bottom:15px;">Employment Details</h3>
      <table class="details-table" style="width:100%;font-size:15px;line-height:1.6;border-collapse:collapse;">
        <tr>
          <td style="color:#64748b;width:35%;padding:6px 0;vertical-align:top;">Employee Name:</td>
          <td style="color:#0f172a;font-weight:bold;padding:6px 0;vertical-align:top;">${userName}</td>
        </tr>
        <tr>
          <td style="color:#64748b;padding:6px 0;vertical-align:top;">Employee ID:</td>
          <td style="color:#0f172a;font-weight:bold;padding:6px 0;vertical-align:top;">${empId}</td>
        </tr>
        <tr>
          <td style="color:#64748b;padding:6px 0;vertical-align:top;">Designation:</td>
          <td style="color:#0f172a;font-weight:bold;padding:6px 0;vertical-align:top;">${designation}</td>
        </tr>
        <tr>
          <td style="color:#64748b;padding:6px 0;vertical-align:top;">Department/Team:</td>
          <td style="color:#0f172a;font-weight:bold;padding:6px 0;vertical-align:top;">${teamName}</td>
        </tr>
        <tr>
          <td style="color:#64748b;padding:6px 0;vertical-align:top;">Effective Date:</td>
          <td style="color:#0f172a;font-weight:bold;padding:6px 0;vertical-align:top;">${formattedDate}</td>
        </tr>
      </table>
    </div>

    <p style="font-size:16px;line-height:1.6;margin:16px 0;">
      Welcome officially to the permanent team! We are confident that you will continue to achieve great heights and make significant contributions to the growth and success of Navabharath Technologies.
    </p>
    <p style="font-size:16px;line-height:1.6;margin:16px 0 0 0;">
      Please contact the HR department if you have any questions or require any assistance during this onboarding update.
    </p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:30px 0;" />
    <p style="font-size:14px;color:#64748b;margin:0;text-align:center;line-height:1.5;">
      Warmest regards,<br/>
      <strong>Navabharath Technologies Team</strong>
    </p>
  </div>
</body>
</html>`;
};

module.exports = { getEmploymentConfirmationHtml };
