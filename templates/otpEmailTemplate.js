// Hosted company logo URL for universal email rendering
const logoUrl = 'https://navabharathtechnologies.com/assets/logo.png';

/**
 * Returns the HTML for the Password Reset OTP email.
 */
const getOtpEmailHtml = (userName, otp) => `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#f8fafc;font-family:Arial,sans-serif;color:#334155;">
  <div style="max-width: 500px; margin: 0 auto; background: #ffffff; padding: 40px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
    <div style="text-align: center; margin-bottom: 25px;">
      <img src="${logoUrl}" alt="NBT Logo" style="width: 120px; display: block; margin: 0 auto;">
    </div>
    <h2 style="color: #1e3a8a; text-align: center;">Password Reset Request</h2>
    <p style="color: #333; font-size: 16px;">Hello ${userName},</p>
    <p style="color: #333; font-size: 16px;">We received a request to reset the password for your Navabharath Technologies account. Your One-Time Password (OTP) is:</p>
    <div style="text-align: center; margin: 30px 0;">
      <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #3b82f6; background-color: #f3f4f6; padding: 10px 20px; border-radius: 4px;">${otp}</span>
    </div>
    <p style="color: #333; font-size: 16px;">This OTP is valid for the next 10 minutes. If you did not request a password reset, please ignore this email.</p>
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;" />
    <p style="color: #888; font-size: 12px; text-align: center;">Navabharath Technologies Team</p>
  </div>
</body>
</html>
  `;

module.exports = {
  getOtpEmailHtml
};
