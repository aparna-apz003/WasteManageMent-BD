const express = require("express");
const router = express.Router();

const cleaningStaffModel = require("../../models/cleaningStaffModel");


// CREATE staff
// POST /api/cleaning-staff/create
router.post("/cleaning-staff/create", async (req, res) => {
  try {
    const { fullName, staffId, phone, email, } = req.body;

    if (!fullName || !staffId || !phone) {
      return res.status(400).json({
        success: false,
        msg: "fullName, staffId, and phone are required",
      });
    }

    const existingStaff = await cleaningStaffModel.findOne({ staffId });
    if (existingStaff) {
      return res.status(409).json({
        success: false,
        msg: "Staff ID already exists",
      });
    }

    const newStaff = await cleaningStaffModel.create({
      fullName,
      staffId,
      phone,
      email,
    
    });

    return res.status(201).json({
      success: true,
      msg: "Cleaning staff created successfully",
      data: newStaff,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Failed to create cleaning staff",
      error: error.message,
    });
  }
});


// GET all staff
// GET /api/cleaning-staff/all
router.get("/cleaning-staff/all", async (req, res) => {
  try {
    const staffList = await cleaningStaffModel.find().sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: staffList.length,
      data: staffList,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Failed to fetch cleaning staff",
      error: error.message,
    });
  }
});


// GET single staff by id
// GET /api/cleaning-staff/:id
router.get("/cleaning-staff/:id", async (req, res) => {
  try {
    const staff = await cleaningStaffModel.findById(req.params.id);

    if (!staff) {
      return res.status(404).json({
        success: false,
        msg: "Cleaning staff not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: staff,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Failed to fetch cleaning staff",
      error: error.message,
    });
  }
});


// UPDATE staff
// PUT /api/cleaning-staff/update/:id
router.put("/cleaning-staff/update/:id", async (req, res) => {
  try {
    const { fullName, staffId, phone, email,  } = req.body;

    const existingStaff = await cleaningStaffModel.findById(req.params.id);
    if (!existingStaff) {
      return res.status(404).json({
        success: false,
        msg: "Cleaning staff not found",
      });
    }

    if (staffId && staffId !== existingStaff.staffId) {
      const duplicateStaffId = await cleaningStaffModel.findOne({ staffId });
      if (duplicateStaffId) {
        return res.status(409).json({
          success: false,
          msg: "Staff ID already exists",
        });
      }
    }

    existingStaff.fullName = fullName ?? existingStaff.fullName;
    existingStaff.staffId = staffId ?? existingStaff.staffId;
    existingStaff.phone = phone ?? existingStaff.phone;
    existingStaff.email = email ?? existingStaff.email;
    

    await existingStaff.save();

    return res.status(200).json({
      success: true,
      msg: "Cleaning staff updated successfully",
      data: existingStaff,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Failed to update cleaning staff",
      error: error.message,
    });
  }
});


// DELETE staff
// DELETE /api/cleaning-staff/delete/:id
router.delete("/cleaning-staff/delete/:id", async (req, res) => {
  try {
    const deletedStaff = await cleaningStaffModel.findByIdAndDelete(req.params.id);

    if (!deletedStaff) {
      return res.status(404).json({
        success: false,
        msg: "Cleaning staff not found",
      });
    }

    return res.status(200).json({
      success: true,
      msg: "Cleaning staff deleted successfully",
      data: deletedStaff,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: "Failed to delete cleaning staff",
      error: error.message,
    });
  }
});

module.exports = router;