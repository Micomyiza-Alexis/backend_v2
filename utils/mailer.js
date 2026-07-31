let transporter = null;
const smtpFromEmail =
  process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "";
try {
  const nodemailer = require("nodemailer");
  // Configure transporter from environment variables if provided
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT
    ? parseInt(process.env.SMTP_PORT)
    : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === "true";
  console.log({
    host,
    port,
    secure,
    user,
    hasPassword: !!pass,
  });
  if (host && port && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
    console.log("✅ Email transporter initialized successfully");
  } else {
    console.log(
      "⚠️  Email transporter not configured - missing SMTP credentials",
    );
  }
} catch (e) {
  console.error("❌ Failed to initialize email transporter:", e.message);
}

const sendEmail = async ({ to, subject, text, html, attachments = [] }) => {
  console.log("📧 sendEmail() called");
  console.log("To:", to);

  if (!transporter) {
    console.log("❌ Transporter is null");
    return;
  }

  try {
    console.log("📨 Sending email...");

    console.log("🔍 Verifying SMTP connection...");
    await transporter.verify();
    console.log("✅ SMTP connection verified");

    const info = await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || "SafariTix"}" <${smtpFromEmail}>`,
      to,
      subject,
      text,
      html,
      attachments,
    });
    console.log("✅ Email sent!");
    console.log(info);

    return info;
  } catch (err) {
    console.error("❌ Email error:");
    console.error(err);
    throw err;
  }
};

const sendSMS = async ({ to, text }) => {
  // No SMS provider configured; log for now. Add Twilio integration if needed.
  console.log(
    "mailer: sendSMS fallback — SMS not sent (no provider configured)",
  );
  console.log({ to, text });
  return Promise.resolve();
};

module.exports = { sendEmail, sendSMS };
