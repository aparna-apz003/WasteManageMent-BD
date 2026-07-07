const express = require("express");
const StudentsModel = require("../../models/StudentsModel");
const jwt = require("jsonwebtoken");
const authMiddleware = require("../../Middleware/AuthMiddleware");
const router = express.Router();
const mongoose = require("mongoose");
const WasteReport = require("../../models/WasteReport");
const StaffModel = require("../../models/StaffModel");
router.post("/create/student", async (req, res) => {
  try {
    const { admissionNumber, dateOfBirth, fullName,email,role } = req.body;

  
    if (!admissionNumber || !dateOfBirth) {
      return res.status(400).json({
        success: false,
        msg: "All fields are required",
      });
    }

 
    const existingStudent = await StudentsModel.findOne({ admissionNumber });
    if (existingStudent) {
      return res.status(409).json({
        success: false,
        msg: "Student already exists",
      });
    }

    const student = await StudentsModel.create({
      admissionNumber,
      dateOfBirth,
      fullName,
      email,role
    });

    res.status(201).json({
      success: true,
      msg: "Student created successfully",
      student,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      msg: "Internal Server Error",
    });
  }
});

router.post("/login/student", async (req, res) => {
  try {
    const { identifier, dateOfBirth } = req.body; // identifier can be admissionNumber OR email

    // validation
    if (!identifier || !dateOfBirth) {
      return res.status(400).json({
        success: false,
        msg: "Identifier (admission number or email) and date of birth are required",
      });
    }

    let student;

    // Check if identifier looks like an email (contains '@')
    const isEmail = identifier.includes('@');

    if (isEmail) {
      // Search by email
      student = await StudentsModel.findOne({ email: identifier });
    } else {
      // Search by admission number
      student = await StudentsModel.findOne({ admissionNumber: identifier });
    }

    if (!student) {
      return res.status(404).json({
        success: false,
        msg: "Student not found",
      });
    }

    // Verify date of birth
    if (student.dateOfBirth !== dateOfBirth) {
      return res.status(401).json({
        success: false,
        msg: "Invalid credentials",
      });
    }

    // Create JWT token
    const token = jwt.sign(
      {
        id: student._id,
        role: student.role,
        userModel: "Student"
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      success: true,
      msg: "Login successful",
      token,
      student: {
        id: student._id,
        admissionNumber: student.admissionNumber,
        email: student.email,          // include email in response
        fullName: student.fullName,
        role: student.role
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      msg: "Internal Server Error",
    });
  }
});

  


router.get("/get/me", authMiddleware, async (req, res) => {
  try {
    const { id, userModel } = req.user;

    const Model = userModel === "Staff" ? StaffModel : StudentsModel;

    
    let user = await Model.findById(id).select("-dateOfBirth").lean();
    if (!user) return res.status(404).json({ success: false, msg: "User not found" });

    
    if (userModel === "Staff" && user.status === "ONLINE" || user.status === "IN_WORK") {
     const TWELVE_HOURS = 12 * 60 * 60 * 1000;

      const last = user.statusUpdatedAt ? new Date(user.statusUpdatedAt).getTime() : 0;
      const now = Date.now();

      if (last && now - last > TWELVE_HOURS) {
        await StaffModel.updateOne(
          { _id: id },
          { $set: { status: "OFFLINE", statusUpdatedAt: new Date() } }
        );

        user = { ...user, status: "OFFLINE", statusUpdatedAt: new Date() };
      }
    }
   
   

    const wastereports = await WasteReport.find({ userId: id })
      .sort({ createdAt: -1 })
      .limit(4)
      .populate({ path: "resolvedBy", select: "staffID fullName" })
      .lean();

    return res.status(200).json({
      success: true,
      userModel,
      user: { ...user, wastereports },
    });
  } catch (err) {
    return res.status(500).json({ success: false, msg: err.message });
  }
});

router.get("/get/all-students", authMiddleware, async (req, res) => {
  try {
   
 

    const page = Math.max(parseInt(req.query.page || "1"), 1);
    const limit = Math.min(parseInt(req.query.limit || "10"), 50);
    const skip = (page - 1) * limit;

    const [students, total] = await Promise.all([
      StudentsModel.find()
        .select("-dateOfBirth") // remove sensitive field
        .sort({ rewardPoint: -1 }) // highest points first (leaderboard style)
        .skip(skip)
        .limit(limit)
        .lean(),

      StudentsModel.countDocuments(),
    ]);

    res.status(200).json({
      success: true,
      page,
      total,
      totalPages: Math.ceil(total / limit),
      students,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      msg: error.message || "Internal Server Error",
    });
  }
});

router.get("/leaderboard", async (req, res) => {
  try {
    const topStudents = await StudentsModel.find()
      .select("fullName rewardPoint role")
      .sort({ rewardPoint: -1 })
      .limit(10)
      .lean();

    res.status(200).json({
      success: true,
      students: topStudents,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      msg: error.message,
    });
  }
});

/* ─── UPDATE STUDENT ────────────────────────────────────────────── */
router.patch("/edit/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Prevent manual updating of reward points through this route for security
    delete updateData.rewardPoint;

    const updatedStudent = await StudentsModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-dateOfBirth");

    if (!updatedStudent) {
      return res.status(404).json({
        success: false,
        msg: "Student not found",
      });
    }

    res.status(200).json({
      success: true,
      msg: "Student updated successfully",
      student: updatedStudent,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      msg: error.message || "Error updating student",
    });
  }
});

/* ─── DELETE STUDENT ────────────────────────────────────────────── */
router.delete("/delete/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Optional: Only allow certain roles to delete (e.g., Admins)
    // if (req.user.role !== 'Admin') return res.status(403).json({ msg: "Unauthorized" });

    const deletedStudent = await StudentsModel.findByIdAndDelete(id);

    if (!deletedStudent) {
      return res.status(404).json({
        success: false,
        msg: "Student not found",
      });
    }

    // Clean up related data if necessary (e.g., WasteReports)
    // await WasteReport.deleteMany({ userId: id });

    res.status(200).json({
      success: true,
      msg: "Student record deleted successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      msg: error.message || "Error deleting student",
    });
  }
});


module.exports = router;
