// Hosted company logo URL for universal email rendering
const logoUrl = 'https://navabharathtechnologies.com/assets/logo.png';

/**
 * Returns the HTML for the welcome/congratulations email sent to employees upon completing onboarding/internship duration.
 */
const getWelcomeOnboardingHtml = (userName, type) => {
  const roleType = type === 'Intern' ? 'Internship' : 'Onboarding';
  
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
      .badge-section {
        padding: 16px !important;
      }
    }
  </style>
</head>
<body style="margin:0;padding:10px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#334155;-webkit-text-size-adjust:100%;">
  <div class="email-container" style="max-width:600px;margin:10px auto;background:#ffffff;padding:40px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.05); border-top: 6px solid #10b981; box-sizing:border-box;">
    <div style="text-align: center; margin-bottom: 30px;">
      <img src="${logoUrl}" alt="NBT Logo" style="width: 130px; max-width: 100%; height: auto; display: block; margin: 0 auto;">
    </div>
    <h2 style="color:#059669;margin-top:0;text-align:center;font-size:24px;">Congratulations, ${userName}! 🌟</h2>
    <p style="font-size:18px;line-height:1.5;text-align:center;color:#0f766e;font-weight:bold;margin:16px 0;">
      You have successfully completed your ${roleType} duration!
    </p>
    <p style="font-size:16px;line-height:1.6;margin:16px 0;">
      Hello <strong>${userName}</strong>,
    </p>
    <p style="font-size:16px;line-height:1.6;margin:16px 0;">
      We are absolutely thrilled to celebrate this milestone with you! You have successfully completed your official <strong>${roleType} period</strong> at Navabharath Technologies. 
    </p>
    <p style="font-size:16px;line-height:1.6;margin:16px 0;">
      Your hard work, enthusiasm, and dedication over the past period have made a wonderful impact on our team. We highly appreciate your contribution and learning spirit!
    </p>
    <div class="badge-section" style="margin:25px 0;padding:25px;background:#f0fdf4;border-left:4px solid #10b981;border-radius:4px;text-align:center;box-sizing:border-box;">
      <p style="margin:0 0 10px 0;font-size:18px;font-weight:bold;color:#15803d;">
        🎉 Welcome to the Next Chapter!
      </p>
      <p style="margin:0;font-size:15px;color:#166534;line-height:1.5;">
        Your profile has been forwarded to our HR & Management team for review and confirmation of your transition to full-time status. We will get in touch with you shortly with the official update.
      </p>
    </div>
    <p style="font-size:16px;line-height:1.6;margin:16px 0;">
      Once again, thank you for being a valuable part of the Navabharath family. We look forward to achieving great milestones together!
    </p>
    <p style="font-size:16px;line-height:1.6;margin:16px 0 0 0;">
      Keep up the stellar work!
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

module.exports = { getWelcomeOnboardingHtml };
