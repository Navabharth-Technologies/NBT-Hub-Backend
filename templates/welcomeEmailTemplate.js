// Hosted company logo URL for universal email rendering
const logoUrl = 'https://navabharathtechnologies.com/assets/logo.png';

/**
 * Returns the HTML for the welcome email sent to employees on Day 1.
 */
const getWelcomeDayOneHtml = (userName, type, role, email, password) => {
  const roleType = type === 'Intern' ? 'Intern' : 'Employee';
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
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
<body style="margin:0;padding:10px;background:#f8fafc;font-family:'Inter', -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#334155;-webkit-text-size-adjust:100%;">
  <div class="email-container" style="max-width:600px;margin:10px auto;background:#ffffff;padding:40px;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,0.05); border-top: 6px solid #3b82f6; box-sizing:border-box;">
    <div style="text-align: center; margin-bottom: 10px;">
      <img src="${logoUrl}" alt="NBT Logo" style="height: 130px; width: auto; display: block; margin: 0 auto; pointer-events: none; user-select: none; -webkit-user-drag: none;">
    </div>
    <h2 style="color:#1e3a8a;margin-top:0;text-align:center;font-size:24px;">Welcome to the Team, ${userName}! 🎉</h2>
    <p style="font-size:18px;line-height:1.5;text-align:center;color:#2563eb;font-weight:bold;margin:16px 0;">
      We are thrilled to have you join Navabharath Technologies!
    </p>
    <p style="font-size:16px;line-height:1.6;margin:16px 0;">
      Hello <strong>${userName}</strong>,
    </p>
    <p style="font-size:16px;line-height:1.6;margin:16px 0;">
      Welcome to your first day as an official <strong>${roleType}</strong> with us. You are joining us as a <strong>${role}</strong>, and we couldn't be more excited to see what we will achieve together!
    </p>
    
    <div class="badge-section" style="margin:25px 0;padding:25px;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:8px;text-align:center;box-sizing:border-box;">
      <p style="margin:0 0 10px 0;font-size:18px;font-weight:bold;color:#1e40af;">
        🔐 Your Login Credentials
      </p>
      <p style="margin:0;font-size:15px;color:#1e3a8a;line-height:1.5;">
        Email: <strong>${email}</strong><br>
        Password: <strong>${password}</strong>
      </p>
      <p style="margin:10px 0 0 0;font-size:13px;color:#3b82f6;font-style:italic;">
        * Please change your password upon your first login.
      </p>
    </div>
    
    <p style="font-size:16px;line-height:1.6;margin:16px 0;">
      Your journey starts today. If you need any help getting set up, your reporting manager and the HR team are here for you. 
    </p>
    <p style="font-size:16px;line-height:1.6;margin:16px 0 0 0;">
      Let's build great things together!
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

module.exports = { getWelcomeDayOneHtml };
