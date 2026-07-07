const express = require("express");
const crypto = require("crypto");
const { sendRegistrationOtp } = require("../utils/emailService"); // adjust path to your mailer
const StudentsModel = require("../models/StudentsModel");
const StaffModel = require("../models/StaffModel");

const router = express.Router();

// ── In-memory OTP store (replace with Redis in production) ────────
// Structure: { [email]: { otp, expiresAt, payload, role } }
const otpStore = new Map();

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// ── Helper: generate 6-digit OTP ─────────────────────────────────
const generateOTP = () =>
  crypto.randomInt(100000, 999999).toString();

// ─────────────────────────────────────────────────────────────────
// POST /send-otp
// Body: { fullName, email, admissionNumber | staffID, dateOfBirth, role: "student"|"staff" }
// Called from Register form → sends OTP, stores payload temporarily
// ─────────────────────────────────────────────────────────────────
router.post("/send-otp", async (req, res) => {
  try {
    const { fullName, email, admissionNumber, staffID, dateOfBirth, role } = req.body;

    // ── Basic validation ──────────────────────────────────────────
    if (!email || !fullName || !dateOfBirth || !role) {
      return res.status(400).json({
        success: false,
        msg: "fullName, email, dateOfBirth and role are required",
      });
    }

    

    if (role === "student" && !admissionNumber) {
      return res.status(400).json({ success: false, msg: "admissionNumber is required for students" });
    }

    if (role === "staff" && !staffID) {
      return res.status(400).json({ success: false, msg: "staffID is required for staff" });
    }
    
    let existingUser = null;
if (role === "student") {
  existingUser = await StudentsModel.findOne({ email });
} else {
  existingUser = await StaffModel.findOne({ email });
}

if (existingUser) {
  return res.status(409).json({ 
    success: false, 
    msg: `A ${role} with this email already exists.` 
  });
}

    // ── Check if already registered ───────────────────────────────
    if (role === "student") {
      const exists = await StudentsModel.findOne({ admissionNumber });
      if (exists) {
        return res.status(409).json({ success: false, msg: "Student with this admission number already exists" });
      }
    } else {
      const exists = await StaffModel.findOne({ staffID });
      if (exists) {
        return res.status(409).json({ success: false, msg: "Staff with this ID already exists" });
      }
    }

    // ── Generate & store OTP ──────────────────────────────────────
    const otp = generateOTP();
    const expiresAt = Date.now() + OTP_EXPIRY_MS;

    otpStore.set(email, {
      otp,
      expiresAt,
      role,
      payload: { fullName, email, admissionNumber, staffID, dateOfBirth },
    });

    // ── Send email ────────────────────────────────────────────────
    const firstName = fullName.split(" ")[0];
    await sendRegistrationOtp(email, otp, firstName);

    return res.status(200).json({
      success: true,
      msg: "OTP sent to your email. Valid for 10 minutes.",
    });
  } catch (error) {
    console.error("send-otp error:", error);
    return res.status(500).json({ success: false, msg: "Failed to send OTP" });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /verify-otp
// Body: { email, otp }
// Verifies OTP → creates student or staff account → clears OTP
// ─────────────────────────────────────────────────────────────────
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, msg: "email and otp are required" });
    }

    // ── Lookup stored OTP ─────────────────────────────────────────
    const record = otpStore.get(email);

    if (!record) {
      return res.status(400).json({ success: false, msg: "No OTP found for this email. Please request a new one." });
    }

    // ── Check expiry ──────────────────────────────────────────────
    if (Date.now() > record.expiresAt) {
      otpStore.delete(email);
      return res.status(410).json({ success: false, msg: "OTP has expired. Please request a new one." });
    }

    // ── Validate OTP ──────────────────────────────────────────────
    if (record.otp !== otp.trim()) {
      return res.status(401).json({ success: false, msg: "Invalid OTP. Please try again." });
    }

    // ── Create account ────────────────────────────────────────────
    const { role, payload } = record;
    let created;

    if (role === "student") {
      // Guard against race conditions
      const alreadyExists = await StudentsModel.findOne({ admissionNumber: payload.admissionNumber });
      if (alreadyExists) {
        otpStore.delete(email);
        return res.status(409).json({ success: false, msg: "Student already exists" });
      }

      created = await StudentsModel.create({
        fullName: payload.fullName,
        email: payload.email,
        admissionNumber: payload.admissionNumber,
        dateOfBirth: payload.dateOfBirth,
      });
    } else {
      const alreadyExists = await StaffModel.findOne({ staffID: payload.staffID });
      if (alreadyExists) {
        otpStore.delete(email);
        return res.status(409).json({ success: false, msg: "Staff already exists" });
      }

      created = await StaffModel.create({
        fullName: payload.fullName,
        email: payload.email,
        staffID: payload.staffID,
        dateOfBirth: payload.dateOfBirth,
        role: "staff",
      });
    }

    // ── Cleanup OTP ───────────────────────────────────────────────
    otpStore.delete(email);

    return res.status(201).json({
      success: true,
      msg: `${role === "student" ? "Student" : "Staff"} account created successfully 🎉`,
      [role]: {
        id: created._id,
        fullName: created.fullName,
        email: created.email,
      },
    });
  } catch (error) {
    console.error("verify-otp error:", error);
    return res.status(500).json({ success: false, msg: "Internal Server Error" });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /resend-otp
// Body: { email }
// Resends OTP using the already-stored payload (no re-submit of form)
// ─────────────────────────────────────────────────────────────────
router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, msg: "email is required" });
    }

    const record = otpStore.get(email);

    if (!record) {
      return res.status(400).json({
        success: false,
        msg: "No pending registration found. Please start over.",
      });
    }

    // ── Throttle: prevent resend within 30 seconds ────────────────
    const timeLeft = record.expiresAt - Date.now();
    const alreadySentRecently = timeLeft > OTP_EXPIRY_MS - 30_000;
    if (alreadySentRecently) {
      return res.status(429).json({
        success: false,
        msg: "Please wait 30 seconds before requesting a new OTP.",
      });
    }

    // ── Fresh OTP ─────────────────────────────────────────────────
    const newOtp = generateOTP();
    record.otp = newOtp;
    record.expiresAt = Date.now() + OTP_EXPIRY_MS;
    otpStore.set(email, record);

    const firstName = record.payload.fullName.split(" ")[0];
    await sendRegistrationOtp(email, newOtp, firstName);

    return res.status(200).json({ success: true, msg: "New OTP sent to your email." });
  } catch (error) {
    console.error("resend-otp error:", error);
    return res.status(500).json({ success: false, msg: "Failed to resend OTP" });
  }
});

module.exports = router;