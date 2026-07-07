const express = require("express");
const authMiddleware = require("../../Middleware/AuthMiddleware");
const { upload, saveAsWebP } = require("../../Utils/Multer");
const campaignModel = require("../../models/campaignModel");
const StudentsModel = require("../../models/StudentsModel");
const StaffModel = require("../../models/StaffModel");
const router = express.Router();

// ── Create Campaign ───────────────────────────────────────────────
router.post(
  "/create",
  authMiddleware,
  upload.array("images", 5),
  async (req, res) => {
    try {
      const {
        title,
        description,
        campaignDate,
        startTime,
        endTime,
        maxVolunteers,
        location,
      } = req.body;

      let imageUrls = [];

      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const fileName = await saveAsWebP(file.buffer, file.originalname);
          const url = `${req.protocol}://${req.get("host")}/uploads/${fileName}`;
          imageUrls.push(url);
        }
      }

      const campaign = new campaignModel({
        title,
        description,
        campaignDate,
        startTime,
        endTime,
        maxVolunteers,
        location,
        images: imageUrls,
        createdBy: req.user.id,
      });

      await campaign.save();

      res.status(201).json({
        success: true,
        msg: "Campaign created",
        campaign,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        msg: error.message,
      });
    }
  }
);

// ── Get All Campaigns ─────────────────────────────────────────────
// GET /campaign/all?status=UPCOMING&page=1&limit=10
router.get("/all", authMiddleware, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const filter = {};
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    const [campaigns, total] = await Promise.all([
      campaignModel
        .find(filter)
        .populate("createdBy", "fullName email")
        .populate("volunteers.userId", "fullName email role staffID admissionNumber ")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      campaignModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      campaigns,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: error.message,
    });
  }
});

// ── Get Single Campaign ───────────────────────────────────────────
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const campaign = await campaignModel
      .findById(req.params.id)
      .populate("createdBy", "name email")
      .populate("volunteers", "name email role");

    if (!campaign) {
      return res.status(404).json({
        success: false,
        msg: "Campaign not found",
      });
    }

    res.status(200).json({
      success: true,
      campaign,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      msg: error.message,
    });
  }
});

// ── Join Campaign (Volunteer) ─────────────────────────────────────
// PATCH /campaign/:id/join
router.patch("/:id/join", authMiddleware, async (req, res) => {
  try {
    const campaign = await campaignModel.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        msg: "Campaign not found",
      });
    }

    const userRole = req.user.role?.toLowerCase();

    if (!["student", "staff"].includes(userRole)) {
      return res.status(403).json({
        success: false,
        msg: "Only students and staff can join campaigns",
      });
    }

    if (["COMPLETED", "CANCELLED"].includes(campaign.status)) {
      return res.status(400).json({
        success: false,
        msg: "This campaign is not open for joining",
      });
    }

    const alreadyJoined = campaign.volunteers.some(
      (v) => v.userId?.toString() === req.user.id.toString()
    );

    if (alreadyJoined) {
      return res.status(400).json({
        success: false,
        msg: "You have already joined this campaign",
      });
    }

    if (campaign.volunteers.length >= campaign.maxVolunteers) {
      return res.status(400).json({
        success: false,
        msg: "Campaign is full. No more volunteers can join",
      });
    }

    campaign.volunteers.push({
      userId: req.user.id,
      userModel: userRole === "staff" ? "Staff" : "Student",
      registeredAt: new Date(),
      attended: false,
    });

    await campaign.save();

    return res.status(200).json({
      success: true,
      msg: "You have successfully joined the campaign",
      volunteersCount: campaign.volunteers.length,
      campaign,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      msg: error.message,
    });
  }
});

// ── Leave Campaign (Volunteer) ────────────────────────────────────
// PATCH /campaign/:id/leave
router.patch("/:id/leave", authMiddleware, async (req, res) => {
  try {
    const campaign = await campaignModel.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        msg: "Campaign not found",
      });
    }

    if (campaign.status === "COMPLETED") {
      return res.status(400).json({
        success: false,
        msg: "Cannot leave a completed campaign",
      });
    }

    const index = campaign.volunteers.findIndex(
      (v) => v.toString() === req.user.id.toString()
    );

    if (index === -1) {
      return res.status(400).json({
        success: false,
        msg: "You are not part of this campaign",
      });
    }

    campaign.volunteers.splice(index, 1);
    await campaign.save();

    res.status(200).json({
      success: true,
      msg: "You have left the campaign",
      volunteersCount: campaign.volunteers.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      msg: error.message,
    });
  }
});

router.patch("/:id/volunteers/:userId/attend", authMiddleware, async (req, res) => {
  try {
   

    const campaign = await campaignModel.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({ success: false, msg: "Campaign not found" });
    }

    // ── Only allow attendance marking after campaign is completed ──
    if (campaign.status !== "COMPLETED") {
      return res.status(400).json({
        success: false,
        msg: `Attendance can only be marked after the campaign is completed. Current status: ${campaign.status}`,
      });
    }

    const volunteer = campaign.volunteers.find(
      (v) => v.userId?.toString() === req.params.userId
    );

    if (!volunteer) {
      return res.status(404).json({ success: false, msg: "Volunteer not found in this campaign" });
    }

    // Toggle attended
    volunteer.attended = !volunteer.attended;
    await campaign.save();

    // Award or deduct 50 points based on toggle direction
    const pointChange = volunteer.attended ? 50 : -50;
    const userModel   = volunteer.userModel; // "Student" | "Staff"

    if (userModel === "Student") {
      await StudentsModel.findByIdAndUpdate(
        req.params.userId,
        { $inc: { rewardPoint: pointChange } }
      );
    } else if (userModel === "Staff") {
      await StaffModel.findByIdAndUpdate(
        req.params.userId,
        { $inc: { rewardPoint: pointChange } }
      );
    }

    return res.status(200).json({
      success: true,
      msg: volunteer.attended
        ? "Marked as attended · +50 reward points awarded"
        : "Marked as absent · 50 reward points deducted",
      attended:    volunteer.attended,
      pointChange,
      userId:      req.params.userId,
    });
  } catch (error) {
    return res.status(500).json({ success: false, msg: error.message });
  }
});

router.delete("/:id/volunteers/:userId", authMiddleware, async (req, res) => {
  try {
   
 
    const campaign = await campaignModel.findById(req.params.id);
 
    if (!campaign) {
      return res.status(404).json({ success: false, msg: "Campaign not found" });
    }
 
    const index = campaign.volunteers.findIndex(
      (v) => v.userId?.toString() === req.params.userId
    );
 
    if (index === -1) {
      return res.status(404).json({ success: false, msg: "Volunteer not found in this campaign" });
    }
 
    const removed = campaign.volunteers[index];
    campaign.volunteers.splice(index, 1);
    await campaign.save();
 
    return res.status(200).json({
      success: true,
      msg: "Volunteer removed from campaign",
      volunteersCount: campaign.volunteers.length,
      removedUserId: removed.userId,
    });
  } catch (error) {
    return res.status(500).json({ success: false, msg: error.message });
  }
});
// ── Edit Campaign (Admin only) ────────────────────────────────────
// PATCH /campaign/:id/edit
router.patch(
  "/:id/edit",
  authMiddleware,
  upload.array("images", 5),
  async (req, res) => {
    try {
      
    

      const campaign = await campaignModel.findById(req.params.id);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          msg: "Campaign not found",
        });
      }

      const {
        title,
        description,
        campaignDate,
        startTime,
        endTime,
        maxVolunteers,
        status,
        replaceImages, // "true" → replace all images, omit/false → append
      } = req.body;

      // Apply text field updates only if provided
      if (title) campaign.title = title;
      if (description) campaign.description = description;
      if (campaignDate) campaign.campaignDate = campaignDate;
      if (startTime) campaign.startTime = startTime;
      if (endTime) campaign.endTime = endTime;
      if (maxVolunteers) campaign.maxVolunteers = Number(maxVolunteers);
      if (status) campaign.status = status;

      // Handle nested location — supports both formats:
      // { location: { building, area } }  OR  location[building] / location[area]
      const building =
        req.body?.location?.building || req.body["location[building]"];
      const area =
        req.body?.location?.area || req.body["location[area]"];

      if (building || area) {
        campaign.location = {
          building: building || campaign.location?.building,
          area: area || campaign.location?.area,
        };
      }

      // Handle image uploads
      if (req.files && req.files.length > 0) {
        const newImageUrls = [];
        for (const file of req.files) {
          const fileName = await saveAsWebP(file.buffer, file.originalname);
          const url = `${req.protocol}://${req.get("host")}/uploads/${fileName}`;
          newImageUrls.push(url);
        }

        if (replaceImages === "true") {
          campaign.images = newImageUrls;
        } else {
          // Append and cap at 5
          campaign.images = [...campaign.images, ...newImageUrls].slice(0, 5);
        }
      }

      await campaign.save();

      res.status(200).json({
        success: true,
        msg: "Campaign updated successfully",
        campaign,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        msg: error.message,
      });
    }
  }
);

// ── Delete Campaign ───────────────────────────────────────────────
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const campaign = await campaignModel.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        msg: "Campaign not found",
      });
    }

  
   

    await campaignModel.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      msg: "Campaign deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      msg: error.message,
    });
  }
});

module.exports = router;