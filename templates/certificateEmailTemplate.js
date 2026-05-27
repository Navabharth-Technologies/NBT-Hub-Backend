const { createCanvas, loadImage } = require('canvas');
const path = require('path');

// Hosted company logo URL for universal email rendering
const logoUrl = 'https://navabharathtechnologies.com/assets/logo.png';

/**
 * Returns the HTML for the email body when sending a personalized course completion certificate.
 */
const getCertificateEmailHtml = (userName, courseName) => `<!DOCTYPE html>
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
      .badge-container {
        padding: 16px !important;
      }
    }
  </style>
</head>
<body style="margin:0;padding:10px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#334155;-webkit-text-size-adjust:100%;">
  <div class="email-container" style="max-width:600px;margin:10px auto;background:#ffffff;padding:40px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.05);box-sizing:border-box;">
    <div style="text-align: center; margin-bottom: 30px;">
      <img src="${logoUrl}" alt="NBT Logo" style="width: 130px; max-width: 100%; height: auto; display: block; margin: 0 auto;">
    </div>
    <h2 style="color:#1e3a8a;margin-top:0;text-align:center;font-size:24px;">Congratulations, ${userName}! 🎉</h2>
    <p style="font-size:16px;line-height:1.6;margin:16px 0;">
      We are thrilled to inform you that you have successfully completed the <strong>"${courseName}"</strong> course. 
      Your hard work, dedication, and commitment to learning are truly appreciated!
    </p>
    <p style="font-size:16px;line-height:1.6;margin:16px 0;">
      As a token of your achievement, your official Certificate of Completion has been issued by Navabharath Technologies.
    </p>
    <div class="badge-container" style="margin:24px 0;padding:20px;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:4px;box-sizing:border-box;">
      <p style="margin:0;font-size:15px;font-weight:bold;color:#1e40af;line-height:1.5;">
        📎 Please find your official certificate attached to this email. You can download and keep it for your records.
      </p>
    </div>
    <p style="font-size:16px;line-height:1.6;margin:16px 0 0 0;">
      Keep up the excellent work and we look forward to seeing your continued success!
    </p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:30px 0;" />
    <p style="font-size:14px;color:#64748b;margin:0;text-align:center;line-height:1.5;">
      Best regards,<br/>
      <strong>Navabharath Technologies Team</strong>
    </p>
  </div>
</body>
</html>`;

/**
 * Generates the buffer of a high-fidelity certificate image with dynamic text overlaid.
 */
const generateCertificateImage = async (userName, courseName) => {
  const certPath = path.join(__dirname, '..', 'assets', 'certificate_final.png');

  const currentDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  const image = await loadImage(certPath);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');

  // Draw the certificate background image
  ctx.drawImage(image, 0, 0, image.width, image.height);

  // Helper to format name and ensure proper spacing for initials (e.g. S.John -> S. John, John.S -> John S)
  const formatNameWithInitials = (rawName) => {
    if (!rawName) return '';
    let formatted = rawName.trim();
    // Replace dots between full words with a space (e.g., "John.Smith" -> "John Smith")
    formatted = formatted.replace(/([a-zA-Z]{2,})\.([a-zA-Z]{2,})/g, '$1 $2');
    // Replace dynamic single letter initials at the end: "John.S" -> "John S"
    formatted = formatted.replace(/([a-zA-Z]{2,})\.([a-zA-Z])\b/g, '$1 $2');
    // Ensure space after periods for starting initials: "S.K.John" -> "S. K. John", "S.John" -> "S. John"
    formatted = formatted.replace(/\.([a-zA-Z])/g, '. $1');
    // Clean up multiple spaces
    formatted = formatted.replace(/\s+/g, ' ').trim();
    // Use double spaces between each name/initial component for beautiful spacing and readability on the certificate
    return formatted.split(' ').join('  ');
  };

  // 1. Draw Employee Name (Capitalized, Stylish Font, Custom Color, with auto-fit logic for long names)
  const baseFontSize = 115;
  let fontSize = baseFontSize;
  ctx.font = `italic bold ${fontSize}px "Georgia", "Times New Roman", serif`;
  ctx.fillStyle = '#000000ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const maxNameWidth = image.width * 0.75; // Limit name width to 75% of the certificate width
  const nameToDraw = formatNameWithInitials(userName).toUpperCase();

  while (ctx.measureText(nameToDraw).width > maxNameWidth && fontSize > 40) {
    fontSize -= 5;
    ctx.font = `italic bold ${fontSize}px "Georgia", "Times New Roman", serif`;
  }
  ctx.fillText(nameToDraw, image.width / 2, 725);

  // 2. Draw Course Name (Clean, Professional Serif Font, with auto-fit logic for long course titles)
  const baseCourseFontSize = 50;
  let courseFontSize = baseCourseFontSize;
  ctx.font = `bold ${courseFontSize}px "Georgia", "Times New Roman", serif`;
  ctx.fillStyle = '#1e3a8a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const maxCourseWidth = image.width * 0.8; // Limit course title width to 80% of the certificate width
  const courseToDraw = `"${courseName}"`;

  while (ctx.measureText(courseToDraw).width > maxCourseWidth && courseFontSize > 22) {
    courseFontSize -= 2;
    ctx.font = `bold ${courseFontSize}px "Georgia", "Times New Roman", serif`;
  }
  ctx.fillText(courseToDraw, image.width / 2, 882);

  // 3. Draw Date (Tighter alignment to the "DATE:" label)
  ctx.font = 'bold 37px Arial, sans-serif';
  ctx.fillStyle = '#1e3a8a';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(currentDate, 535, 1173);

  return canvas.toBuffer('image/png');
};

module.exports = {
  getCertificateEmailHtml,
  generateCertificateImage
};
