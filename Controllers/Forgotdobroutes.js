const express = require("express");
const crypto = require("crypto");
const { sendForgotDob } = require("../utils/emailService"); // OTP version
const StudentsModel = require("../models/StudentsModel");
const StaffModel = require("../models/StaffModel");

const router = express.Router();

// ── OTP store (replace with Redis in production) ────────────────
// Structure: { [otp]: { userId, userModel, expiresAt } }
const otpStore = new Map();

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// ── Helper: generate 6-digit OTP ────────────────────────────────
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

// ─────────────────────────────────────────────────────────────────
// POST /forgot-dob
// Body: { email, role: "student"|"staff" }
// Generates OTP, stores it, and sends it via email
// ─────────────────────────────────────────────────────────────────
router.post("/forgot-dob", async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!email || !role) {
      return res.status(400).json({ success: false, msg: "email and role are required" });
    }

    if (!["student", "staff"].includes(role)) {
      return res.status(400).json({ success: false, msg: "role must be 'student' or 'staff'" });
    }

    const Model = role === "student" ? StudentsModel : StaffModel;
    const user = await Model.findOne({ email }).lean();
    console.log(user);
    

    // Always respond with same message to prevent email enumeration
 if (!user) {
  // This line should never be reached, but just in case:
  return res.status(404).json({ success: false, msg: "User not found" });
}

    // Remove any existing OTP for this user (prevents multiple valid OTPs)
    for (const [storedOtp, record] of otpStore.entries()) {
      if (record.userId === user._id.toString() && record.userModel === role) {
        otpStore.delete(storedOtp);
      }
    }

    // Generate and store new OTP
    const otp = generateOtp();
    const expiresAt = Date.now() + OTP_EXPIRY_MS;

    otpStore.set(otp, {
      userId: user._id.toString(),
      userModel: role === "student" ? "Student" : "Staff",
      expiresAt,
    });

    // Send OTP via email (your updated sendForgotDob expects OTP, not a link)
    const firstName = user.fullName?.split(" ")[0] || "Valued Member";
    await sendForgotDob(email, otp, firstName);

    return res.status(200).json({
      success: true,
      msg: "If that email is registered, an OTP has been sent.",
    });
  } catch (error) {
    console.error("forgot-dob error:", error);
    return res.status(500).json({ success: false, msg: "Internal Server Error" });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /verify-dob
// Body: { otp, newDateOfBirth }
// Validates OTP → updates DOB → invalidates OTP
// ─────────────────────────────────────────────────────────────────
router.post("/verify-dob", async (req, res) => {
  try {
    const { otp, newDateOfBirth } = req.body;

    if (!otp || !newDateOfBirth) {
      return res.status(400).json({ success: false, msg: "otp and newDateOfBirth are required" });
    }

    const record = otpStore.get(otp);

    if (!record) {
      return res.status(400).json({ success: false, msg: "Invalid or expired OTP. Please request a new one." });
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(otp);
      return res.status(410).json({ success: false, msg: "OTP has expired. Please request a new one." });
    }

    // Update DOB
    const Model = record.userModel === "Student" ? StudentsModel : StaffModel;
    const updated = await Model.findByIdAndUpdate(
      record.userId,
      { $set: { dateOfBirth: newDateOfBirth } },
      { new: true }
    ).select("fullName email");

    if (!updated) {
      otpStore.delete(otp);
      return res.status(404).json({ success: false, msg: "User not found" });
    }

    // Invalidate OTP (one-time use)
    otpStore.delete(otp);

    return res.status(200).json({
      success: true,
      msg: "Date of Birth updated successfully.",
      user: {
        fullName: updated.fullName,
        email: updated.email,
      },
    });
  } catch (error) {
    console.error("verify-dob error:", error);
    return res.status(500).json({ success: false, msg: "Internal Server Error" });
  }
});

module.exports = router;