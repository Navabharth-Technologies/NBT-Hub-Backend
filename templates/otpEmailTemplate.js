// Hosted company logo URL for universal email rendering
const logoUrl = 'https://navabharathtechnologies.com/assets/logo.png';

/**
 * Returns the HTML for the Password Reset OTP email.
 */
const getOtpEmailHtml = (userName, otp) => `<!DOCTYPE html>
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
      .otp-display {
        font-size: 26px !important;
        letter-spacing: 3px !important;
        padding: 8px 16px !important;
      }
    }
  </style>
</head>
<body style="margin:0;padding:10px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#334155;-webkit-text-size-adjust:100%;">
  <div class="email-container" style="max-width: 500px; margin: 10px auto; background: #ffffff; padding: 40px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; box-sizing:border-box;">
    <div style="text-align: center; margin-bottom: 25px;">
      <img src="${logoUrl}" alt="NBT Logo" style="width: 110px; max-width: 100%; height: auto; display: block; margin: 0 auto; pointer-events: none; user-select: none; -webkit-user-drag: none;">
    </div>
    <h2 style="color: #1e3a8a; text-align: center; font-size: 22px; margin-top:0;">Password Reset Request</h2>
    <p style="color: #333; font-size: 16px; margin: 16px 0;">Hello ${userName},</p>
    <p style="color: #333; font-size: 16px; line-height: 1.5; margin: 16px 0;">We received a request to reset the password for your <b>NBT HUB</b> account. Your One-Time Password (OTP) is:</p>
    <div style="text-align: center; margin: 30px 0;">
      <span class="otp-display" style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #3b82f6; background-color: #f3f4f6; padding: 10px 20px; border-radius: 4px; display: inline-block;">${otp}</span>
    </div>
    <p style="color: #64748b; font-size: 14px; line-height: 1.5; margin: 16px 0 0 0;">This OTP is valid for the next 10 minutes. If you did not request a password reset, please ignore this email.</p>
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
    <p style="color: #94a3b8; font-size: 12px; text-align: center; margin:0; font-weight: 500;">Navabharath Technologies Team</p>
  </div>
</body>
</html>
`;

module.exports = {
  getOtpEmailHtml
};
