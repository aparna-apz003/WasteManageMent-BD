const express = require("express");
const jwt = require("jsonwebtoken");
const StaffModel = require("../../models/StaffModel");
const authMiddleware = require("../../Middleware/AuthMiddleware");
const router = express.Router();

// ── Create Staff ──────────────────────────────────────────────────
router.post("/create/staff", async (req, res) => {
  try {
    const { staffID, dateOfBirth, fullName, email, phone, department, role } = req.body;

    if (!staffID || !dateOfBirth || !fullName) {
      return res.status(400).json({
        success: false,
        msg: "staffID, fullName and dateOfBirth are required",
      });
    }

    const existingStaff = await StaffModel.findOne({ staffID });
    if (existingStaff) {
      return res.status(409).json({ success: false, msg: "Staff with this ID already exists" });
    }

    const staff = await StaffModel.create({
      staffID, dateOfBirth, fullName, email,
      phone, department, role: role || "staff",
    });

    res.status(201).json({ success: true, msg: "Staff created successfully", staff });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, msg: "Internal Server Error" });
  }
});

// ── Staff Login ───────────────────────────────────────────────────
router.post("/login/staff", async (req, res) => {
  try {
    const { staffID, email, dateOfBirth } = req.body;

    // At least one identifier (staffID or email) must be provided
    if ((!staffID && !email) || !dateOfBirth) {
      return res.status(400).json({
        success: false,
        msg: "Staff ID or Email, and date of birth are required",
      });
    }

    // Build query: find by staffID if provided, otherwise by email
    let query = {};
    if (staffID) {
      query.staffID = staffID;
    } else if (email) {
      query.email = email;
    }

    const staff = await StaffModel.findOne(query);

    if (!staff) {
      return res.status(404).json({
        success: false,
        msg: staffID ? "Staff not found with this Staff ID" : "Staff not found with this Email",
      });
    }

    // Validate date of birth
    if (staff.dateOfBirth !== dateOfBirth) {
      return res.status(401).json({ success: false, msg: "Invalid date of birth" });
    }

    // Auto set ONLINE on login (if you have an onlineStatus field)
    // staff.onlineStatus = "ONLINE";
    await staff.save();

    const token = jwt.sign(
      { id: staff._id, role: staff.role, userModel: "Staff" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      success: true,
      msg: "Login successful",
      token,
      staff: {
        id: staff._id,
        staffID: staff.staffID,
        fullName: staff.fullName,
        email: staff.email,
        phone: staff.phone,
        department: staff.department,
        role: staff.role,
        rewardPoint: staff.rewardPoint,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, msg: "Internal Server Error" });
  }
});

// ── Update Own Status ─────────────────────────────────────────────
// PATCH /staff/status
// router.patch("/staff/status", authMiddleware, async (req, res) => {
//   try {
//     const { status } = req.body;

//     if (!["ONLINE", "IN_WORK", "OFFLINE"].includes(status)) {
//       return res.status(400).json({ success: false, msg: "Status must be ONLINE, IN_WORK or OFFLINE" });
//     }

//     const updated = await StaffModel.findByIdAndUpdate(
//       req.user.id,
//       { status, statusUpdatedAt: new Date() },
//       { new: true }
//     ).select("status statusUpdatedAt fullName staffID");

//     if (!updated) return res.status(404).json({ success: false, msg: "Staff not found" });

//     return res.status(200).json({ success: true, status: updated.status, staff: updated });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ success: false, msg: "Server error" });
//   }
// });

// GET /staff/all
router.get("/staff/all", authMiddleware, async (req, res) => {
  try {
    const { role } = req.user;

    // Admin gets full details, others get limited view
    // const selectFields =
    //   role === "admin"
    //     ? "_id fullName staffID email phone department  statusUpdatedAt role rewardPoint createdAt"
    //     : "_id fullName staffID status statusUpdatedAt role";

    const staff = await StaffModel.find()
    
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      total: staff.length,
      staff,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      msg: "Internal Server Error",
      error: error.message,
    });
  }
});

// ── Get Single Staff ──────────────────────────────────────────────
// GET /staff/:id
router.get("/staff/:id", authMiddleware, async (req, res) => {
  try {
    const staff = await StaffModel.findById(req.params.id).select("-dateOfBirth").lean();

    if (!staff) return res.status(404).json({ success: false, msg: "Staff not found" });

    return res.status(200).json({ success: true, staff });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, msg: error.message || "Internal Server Error" });
  }
});

// ── Edit Staff (Admin only) ───────────────────────────────────────
// PATCH /staff/:id/edit
router.patch("/staff/:id/edit", authMiddleware, async (req, res) => {
  try {
  

    const staff = await StaffModel.findById(req.params.id);
    if (!staff) return res.status(404).json({ success: false, msg: "Staff not found" });

    const allowedFields = ["fullName", "email", "phone", "department", "staffID", "role"];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) staff[field] = req.body[field];
    });

    await staff.save();

    return res.status(200).json({
      success: true,
      msg: "Staff updated successfully",
      staff: {
        _id: staff._id,
        fullName: staff.fullName,
        email: staff.email,
        phone: staff.phone,
        department: staff.department,
        staffID: staff.staffID,
       
        role: staff.role,
        rewardPoint: staff.rewardPoint,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, msg: error.message || "Internal Server Error" });
  }
});

// ── Delete Staff (Admin only) ─────────────────────────────────────
// DELETE /staff/:id
router.delete("/staff/:id", authMiddleware, async (req, res) => {
  try {
  

    if (req.params.id === req.user.id.toString()) {
      return res.status(400).json({ success: false, msg: "You cannot delete your own account" });
    }

    const staff = await StaffModel.findByIdAndDelete(req.params.id);
    if (!staff) return res.status(404).json({ success: false, msg: "Staff not found" });

    return res.status(200).json({
      success: true,
      msg: `Staff member "${staff.fullName}" deleted successfully`,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, msg: error.message || "Internal Server Error" });
  }
});

module.exports = router;