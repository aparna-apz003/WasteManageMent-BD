const nodemailer = require('nodemailer');
require('dotenv').config(); // optional: load EMAIL_USER, EMAIL_PASS, etc.

// ---------- Configure Transporter ----------
// For production, set these environment variables:
// EMAIL_USER, EMAIL_PASS, SMTP_HOST, SMTP_PORT
// For testing with Ethereal, use createTestAccount() (see example below)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ---------- Helper: Emerald HTML Template Wrapper ----------
const emeraldTemplate = (content, title = 'Green Campus') => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
    body {
      font-family: 'Poppins', Arial, sans-serif;
      margin: 0;
      padding: 0;
      background: linear-gradient(135deg, #f5f7fa 0%, #e8f0e8 100%);
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .email-card {
      background: white;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 40px rgba(0,0,0,0.1);
      border: 1px solid rgba(46, 139, 86, 0.2);
    }
    .header {
      background: linear-gradient(135deg, #2E8B57 0%, #1B4D3E 100%);
      padding: 30px 20px;
      text-align: center;
    }
    .header h1 {
      color: white;
      margin: 0;
      font-size: 28px;
      letter-spacing: 2px;
    }
    .header p {
      color: rgba(255,255,255,0.9);
      margin: 8px 0 0;
      font-size: 14px;
    }
    .content {
      padding: 30px;
    }
    .footer {
      background: #f0f4f0;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #888;
      border-top: 1px solid rgba(46, 139, 86, 0.2);
    }
    .footer a {
      color: #2E8B57;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="email-card">
      <div class="header">
        <h1>🌿 GREEN CAMPUS</h1>
        <p>Sustainable Future Initiative</p>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p>🌍 <strong>Green Campus Project</strong> — Growing a Greener Tomorrow</p>
        <p>123 Eco Avenue, Sustainability City, GC 12345</p>
        <p><a href="#">Contact Us</a> | <a href="#">Privacy Policy</a></p>
      </div>
    </div>
  </div>
</body>
</html>
`;

// ---------- 1. Send Registration OTP ----------
/**
 * Sends a one-time password (OTP) for email verification during registration.
 * @param {string} to - Recipient email address
 * @param {string} otp - 6-digit OTP code
 * @param {string} [userName='Valued Member'] - User's name (optional)
 * @returns {Promise<void>}
 */
async function sendRegistrationOtp(to, otp, userName = 'Valued Member') {
  const content = `
    <div style="text-align: center;">
      <div style="font-size: 24px; font-weight: 600; color: #1B4D3E; margin-bottom: 20px;">
        Hello ${userName}! 🌱
      </div>
      <p style="color: #555; line-height: 1.6; margin-bottom: 25px;">
        Welcome to <strong>Green Campus</strong> – your journey towards a sustainable campus life starts here.<br>
        Use the verification code below to complete your registration:
      </p>
      <div style="background: #e8f5e9; padding: 20px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #2E8B57;">
        <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #2E8B57;">${otp}</span>
      </div>
      <p style="font-size: 14px; color: #999;">This OTP is valid for 10 minutes.</p>
      <p style="font-size: 13px; color: #999; margin-top: 20px;">
        If you didn't request this, please ignore this email.
      </p>
    </div>
  `;
  
  const mailOptions = {
    from: `"Green Campus Team" <${process.env.EMAIL_USER}>`,
    to,
    subject: '🌿 Verify Your Email – Registration OTP',
    html: emeraldTemplate(content, 'Email Verification'),
    text: `Your Green Campus verification OTP is: ${otp}. Valid for 10 minutes.`
  };
  
  await transporter.sendMail(mailOptions);
}

/**
 * Sends an OTP to verify identity before allowing date of birth update.
 * @param {string} to - Recipient email address
 * @param {string} otp - 6-digit OTP code
 * @param {string} [userName='Valued Member'] - User's name
 * @returns {Promise<void>}
 */
async function sendForgotDob(to, otp, userName = 'Valued Member') {
  const content = `
    <div style="text-align: center;">
      <div style="font-size: 24px; font-weight: 600; color: #1B4D3E; margin-bottom: 20px;">
        Hello ${userName}! 🌿
      </div>
      <p style="color: #555; line-height: 1.6; margin-bottom: 20px;">
        We received a request to update your <strong>Date of Birth</strong> on your Green Campus profile.<br>
        Use the verification code below to confirm your identity:
      </p>
      <div style="background: #e8f5e9; padding: 20px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #2E8B57;">
        <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #2E8B57;">${otp}</span>
      </div>
      <p style="font-size: 14px; color: #999;">This OTP is valid for 10 minutes.</p>
      <p style="font-size: 13px; color: #999; margin-top: 20px;">
        If you didn't request this, please ignore this email.
      </p>
    </div>
  `;

  const mailOptions = {
    from: `"Green Campus Security" <${process.env.EMAIL_USER}>`,
    to,
    subject: '🔐 Date of Birth Verification OTP – Green Campus',
    html: emeraldTemplate(content, 'Date of Birth OTP'),
    text: `Your Green Campus Date of Birth verification OTP is: ${otp}. Valid for 10 minutes.`
  };

  await transporter.sendMail(mailOptions);
}

// ---------- Export Functions ----------
module.exports = {
  sendRegistrationOtp,
  sendForgotDob,
};

