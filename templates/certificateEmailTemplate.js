// Hosted company logo URL for universal email rendering
const logoUrl = 'https://navabharathtechnologies.com/assets/logo.png';

/**
 * Returns the HTML for the email body when sending a personalized course completion certificate.
 */
const getCertificateEmailHtml = (userName, courseName) => `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#f8fafc;font-family:Arial,sans-serif;color:#334155;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:40px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
    <div style="text-align: center; margin-bottom: 30px;">
      <img src="${logoUrl}" alt="NBT Logo" style="width: 140px; display: block; margin: 0 auto;">
    </div>
    <h2 style="color:#1e3a8a;margin-top:0;text-align:center;">Congratulations, ${userName}! 🎉</h2>
    <p style="font-size:16px;line-height:1.6;">
      We are thrilled to inform you that you have successfully completed the <strong>"${courseName}"</strong> course. 
      Your hard work, dedication, and commitment to learning are truly appreciated!
    </p>
    <p style="font-size:16px;line-height:1.6;">
      As a token of your achievement, your official Certificate of Completion has been issued by Navabharath Technologies.
    </p>
    <div style="margin:30px 0;padding:20px;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:4px;">
      <p style="margin:0;font-size:16px;font-weight:bold;color:#1e40af;">
        📎 Please find your official certificate attached to this email. You can download and keep it for your records.
      </p>
    </div>
    <p style="font-size:16px;line-height:1.6;margin-bottom:0;">
      Keep up the excellent work and we look forward to seeing your continued success!
    </p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:30px 0;" />
    <p style="font-size:14px;color:#64748b;margin:0;text-align:center;">
      Best regards,<br/>
      <strong>Navabharath Technologies Team</strong>
    </p>
  </div>
</body>
</html>`;

/**
 * Generates a high-fidelity certificate template that exactly matches the requested design.
 * Optimized for email delivery while maintaining elite aesthetics.
 */
const generateCertificateHtml = (userName, courseName) => {
  const currentDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return `
    <div style="background-color: #e2e8f0; padding: 40px 0; font-family: 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="900" style="background-color: #ffffff; border-radius: 20px; overflow: hidden; border: 20px solid #ffffff; box-shadow: 0 30px 60px rgba(0,0,0,0.15); position: relative;">
        <tr>
          <!-- Dual-Tone Diagonal Ribbon -->
          <td width="220" valign="top" style="background-color: #1e40af; position: relative; padding: 0;">
            <div style="height: 100%; min-height: 600px; background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);">
              <!-- Corner L-Accent (Top Left) -->
              <div style="position: absolute; top: 15px; left: 15px; width: 50px; height: 50px; border-top: 4px solid #0B1E3F; border-left: 4px solid #0B1E3F;"></div>
            </div>
          </td>

          <!-- Main Content Area with Dot Grid & Watermark -->
          <td valign="top" style="padding: 60px 50px; background-image: radial-gradient(#cbd5e1 0.5px, transparent 0.5px); background-size: 15px 15px; position: relative;">
            
            <!-- Large Watermark Icon (Faint) -->
            <div style="position: absolute; top: 10%; right: 5%; font-size: 400px; color: #f1f5f9; z-index: 0; pointer-events: none; opacity: 0.5;">🎖️</div>

            <div style="position: relative; z-index: 1;">
              <!-- Header Section -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 50px;">
                <tr>
                  <td width="150" align="left">
                    <img src="${logoUrl}" alt="NBT Logo" style="width: 140px; display: block;">
                  </td>
                  <td align="right" valign="middle">
                    <div style="font-size: 10px; font-weight: 900; color: #94a3b8; letter-spacing: 4px; text-transform: uppercase; margin-bottom: 5px;">Award for Professional Excellence</div>
                    <div style="font-size: 32px; font-weight: 1000; color: #0B1E3F; letter-spacing: -1px;">CERTIFICATE OF COMPLETION</div>
                  </td>
                </tr>
              </table>

              <!-- Body Section -->
              <div style="text-align: center; width: 100%;">
                <div style="font-size: 18px; font-weight: 700; color: #64748b; font-style: italic; margin-bottom: 25px;">This is to certify that the professional known as</div>

                <div style="font-size: 52px; font-weight: 900; color: #1e40af; margin: 15px 0; border-bottom: 3px solid #f1f5f9; display: inline-block; padding-bottom: 10px;">
                  ${userName}
                </div>

                <div style="font-size: 18px; font-weight: 700; color: #64748b; margin-top: 35px; margin-bottom: 20px; line-height: 1.6;">
                  has successfully demonstrated technical mastery and completed all requirements for
                </div>

                <div style="font-size: 32px; font-weight: 900; color: #0B1E3F; background-color: #f8fafc; padding: 20px 50px; border-radius: 20px; border: 1.5px solid #e2e8f0; display: inline-block; margin-bottom: 50px;">
                  ${courseName}
                </div>

                <!-- Footer Table -->
                <table width="100%" border="0" cellpadding="0" cellspacing="0">
                  <tr>
                    <!-- Date of Achievement -->
                    <td width="33%" align="center" valign="bottom">
                      <div style="font-size: 18px; font-weight: 900; color: #0B1E3F;">${currentDate}</div>
                      <div style="height: 2px; width: 140px; background: #cbd5e1; margin: 12px auto;"></div>
                      <div style="font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px;">Date of Achievement</div>
                    </td>

                    <!-- Verified Seal -->
                    <td width="33%" align="center">
                      <div style="width: 110px; height: 110px; border: 2px dashed #f59e0b; border-radius: 50%; padding: 6px;">
                        <div style="width: 100%; height: 100%; background-color: #f59e0b; border-radius: 50%; color: #ffffff; text-align: center;">
                          <div style="padding-top: 25px; font-size: 32px;">🎖️</div>
                          <div style="font-size: 10px; font-weight: 1000; text-transform: uppercase; margin-top: -2px;">Verified</div>
                        </div>
                      </div>
                    </td>

                    <!-- Issuing Authority -->
                    <td width="33%" align="center" valign="bottom">
                      <div style="font-size: 18px; font-weight: 900; color: #0B1E3F; font-style: italic;">NBT Technologies Hub</div>
                      <div style="height: 2px; width: 140px; background: #cbd5e1; margin: 12px auto;"></div>
                      <div style="font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px;">Issuing Authority</div>
                    </td>
                  </tr>
                </table>
              </div>
            </div>

            <!-- Corner L-Accent (Bottom Right) -->
            <div style="position: absolute; bottom: 15px; right: 15px; width: 50px; height: 50px; border-bottom: 4px solid #0B1E3F; border-right: 4px solid #0B1E3F;"></div>
          </td>
        </tr>
      </table>
      
      <div style="max-width: 900px; margin: 30px auto; text-align: center; color: #94a3b8; font-size: 12px;">
        This is an official document from Navabharth Technologies. Verification ID: NBT-${Math.random().toString(36).substr(2, 9).toUpperCase()}
      </div>
    </div>
  `;
};

module.exports = {
  getCertificateEmailHtml,
  generateCertificateHtml
};
