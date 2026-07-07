const express = require("express");
const { upload, saveAsWebP } = require("../../Utils/Multer");
const authMiddleware = require("../../Middleware/AuthMiddleware");
const roleMiddleware = require("../../Middleware/RoleBasedMiddlware");
const WasteReport = require("../../models/WasteReport");
const StudentsModel = require("../../models/StudentsModel");
const axios = require("axios");
const StaffModel = require("../../models/StaffModel");
const Router = express.Router();
const mongoose = require("mongoose");
const optionalAuth = require("../../Middleware/optionalAuth");

function analyzeWasteConcepts(concepts = []) {
  const text = concepts.map((c) => (c.name || "").toLowerCase()).join(" | ");

  const plasticKeys = [
    "plastic",
    "bottle",
    "bag",
    "wrapper",
    "cup",
    "polythene",
    "packet",
  ];
  const paperKeys = [
    "paper",
    "cardboard",
    "carton",
    "newspaper",
    "book",
    "magazine",
  ];
  const organicKeys = [
    "food",
    "fruit",
    "banana",
    "vegetable",
    "peel",
    "organic",
    "leftover",
    "garbage",
    "trash",
    "waste",
    "compost",
  ];

  const hasAny = (arr) => arr.some((k) => text.includes(k));

  if (hasAny(plasticKeys)) return { category: "PLASTIC", isWaste: true };
  if (hasAny(paperKeys)) return { category: "PAPER", isWaste: true };
  if (hasAny(organicKeys)) return { category: "ORGANIC", isWaste: true };

  return { category: "NOT_WASTE", isWaste: false };
}

Router.post(
  "/report/waste",
  optionalAuth,
  upload.array("wasteImage", 5),
  async (req, res) => {
    try {
      const userId = req.user?.id || null;
      const role = req.user?.role || "guest";
      const isGuest = !req.user;

      const {
        wasteLocation,
        description,
        landmark,
        wasteQty,
        guestName,
        guestPhone,
      } = req.body;

      if (!wasteLocation || wasteLocation.trim().length < 3) {
        return res.status(400).json({
          success: false,
          msg: "Waste location is required",
        });
      }

      if (!wasteQty) {
        return res.status(400).json({
          success: false,
          msg: "Please provide waste quantity",
        });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          msg: "wasteImage is required",
        });
      }

      const wasteImages = [];
      for (const file of req.files) {
        const fileName = await saveAsWebP(file.buffer, file.originalname);
        const url = `${req.protocol}://${req.get("host")}/uploads/${fileName}`;
        wasteImages.push(url);
      }

      // ✅ AI must succeed — default is blocked
      let aiMainCategory = null;
      let aiMainConfidence = null;
      let aiDistribution = [];
      let aiPassed = false;
      let aiBlockReason = "AI verification failed. Please try again later.";

      try {
        const PAT = process.env.CLARIFAI_PAT;
        const USER_ID = process.env.CLARIFAI_USER_ID || "clarifai";
        const APP_ID = process.env.CLARIFAI_APP_ID || "main";
        const MODEL_ID =
          process.env.CLARIFAI_MODEL_ID || "general-image-recognition";

        if (!PAT) throw new Error("CLARIFAI_PAT missing in .env");

        const firstImage = req.files[0];
        const base64 = firstImage.buffer.toString("base64");

        const clarifaiUrl = `https://api.clarifai.com/v2/users/${USER_ID}/apps/${APP_ID}/models/${MODEL_ID}/outputs`;

        // Nested try/catch so axios 4xx/5xx doesn't escape to outer catch
        let clarifaiRes;
        try {
          clarifaiRes = await axios.post(
            clarifaiUrl,
            { inputs: [{ data: { image: { base64 } } }] },
            {
              headers: {
                Authorization: `Key ${PAT}`,
                "Content-Type": "application/json",
              },
              timeout: 20000,
            }
          );
        } catch (axiosErr) {
          console.log("Clarifai HTTP error:", axiosErr.message);
          aiBlockReason = "AI service is unavailable. Please try again later.";
          throw new Error("AI_FAILED");
        }

        // API-level error in response body (e.g. 402 insufficient credits)
        const statusCode = clarifaiRes.data?.status?.code;
        if (statusCode && statusCode !== 10000) {
          console.log("Clarifai API error:", clarifaiRes.data?.status?.description);
          aiBlockReason = "AI service is unavailable. Please try again later.";
          throw new Error("AI_FAILED");
        }

        const concepts = clarifaiRes.data?.outputs?.[0]?.data?.concepts || [];

        if (!concepts.length) {
          console.log("No concepts returned from Clarifai.");
          aiBlockReason = "Could not analyze the image. Please upload a clearer photo.";
          throw new Error("AI_FAILED");
        }

        aiDistribution = concepts.slice(0, 10).map((c) => ({
          label: c.name,
          confidence: typeof c.value === "number" ? c.value : null,
        }));

        const result = analyzeWasteConcepts(concepts);

        // AI succeeded but image is not waste
        if (!result.isWaste) {
          aiBlockReason = "This image does not look like waste. Please upload a clear waste photo.";
          throw new Error("NOT_WASTE");
        }

        // ✅ All checks passed
        aiMainCategory = result.category;
        aiMainConfidence = aiDistribution[0]?.confidence ?? null;

        const allowed = ["ORGANIC", "PAPER", "PLASTIC", "OTHERS"];
        if (!allowed.includes(aiMainCategory)) aiMainCategory = "OTHERS";

        aiPassed = true;

      } catch (e) {
        console.log("AI verification blocked report:", e.message);
        // Any failure — block the report with the appropriate reason
        return res.status(400).json({
          success: false,
          msg: aiBlockReason,
        });
      }

      // Only reaches here if aiPassed === true
      let userModel = null;
      if (role === "staff") {
        userModel = "Staff";
      } else if (role === "student") {
        userModel = "Student";
      }

      const reportWaste = await WasteReport.create({
        reporterType: isGuest ? "GUEST" : role,
        userId,
        userModel,
        guestName: isGuest ? guestName || "" : "",
        guestPhone: isGuest ? guestPhone || "" : "",
        wasteLocation: wasteLocation.trim(),
        landmark,
        description,
        wasteCategory: aiMainCategory,
        wasteQty,
        wasteImage: wasteImages,
        status: "PENDING",
        aiConfidence: aiMainConfidence,
        aiDistribution,
      });

      return res.status(201).json({
        success: true,
        msg: "Waste report submitted successfully",
        reportWaste,
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        success: false,
        msg: error.message || "Internal Server Error",
      });
    }
  }
);

Router.get("/get/reports", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "10", 10), 1),
      50,
    );
    const skip = (page - 1) * limit;

    const filter = { userId };

    if (req.query.status) filter.status = req.query.status;
    if (req.query.wasteCategory) filter.wasteCategory = req.query.wasteCategory;

    const [orders, total] = await Promise.all([
      WasteReport.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: "resolvedBy",
          select: "staffID fullName",
        })
        .populate({
          path: "userId",
          select: "fullName email studentID staffID",
        })

        .lean(),
      WasteReport.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      orders,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      msg: error.message || "Internal Server Error",
    });
  }
});

// Replace your existing GET /getAll/reports route with this

Router.get("/getAll/reports", authMiddleware, async (req, res) => {
  try {
    const page  = Math.max(parseInt(req.query.page  || "1",  10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "10", 10), 1), 50);
    const skip  = (page - 1) * limit;

    const { status, wasteCategory, start, end } = req.query;

    const filter = {};
    if (status)        filter.status        = status;
    if (wasteCategory) filter.wasteCategory = wasteCategory;
    if (start || end) {
      filter.createdAt = {};
      if (start) filter.createdAt.$gte = new Date(start);
      if (end)   filter.createdAt.$lte = new Date(end);
    }

    const [reports, total, statusCounts] = await Promise.all([
      WasteReport.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({ path: "userId",     select: "fullName email" })
        .populate({ path: "assignedTo", select: "fullName staffId phone" }) // ← fixed
        .lean(),

      WasteReport.countDocuments(filter),

      WasteReport.aggregate([
        { $match: filter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const statusSummary = { PENDING: 0, IN_PROGRESS: 0, RESOLVED: 0, REJECTED: 0 };
    statusCounts.forEach((item) => {
      if (statusSummary[item._id] !== undefined) statusSummary[item._id] = item.count;
    });

    return res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      statusSummary,
      reports,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, msg: error.message || "Internal Server Error" });
  }
});
Router.get("/getAll/reports/pending", authMiddleware, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "10", 10), 1),
      50,
    );
    const skip = (page - 1) * limit;

    const { status, wasteCategory, start, end } = req.query;

    const filter = { status: status || "PENDING" };

    if (wasteCategory) filter.wasteCategory = wasteCategory;

    // date range filter
    if (start || end) {
      filter.createdAt = {};
      if (start) filter.createdAt.$gte = new Date(start);
      if (end) filter.createdAt.$lte = new Date(end);
    }

    // 🔥 1️⃣ Get paginated reports
    const reportsPromise = WasteReport.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "userId",
        select: "fullName",
      })
      .populate({
        path: "assignedStaff",
        populate: [
          { path: "staff", select: "fullName staffID" },
          { path: "team", select: "fullName staffID" },
        ],
      })
      .lean();

    // 🔥 2️⃣ Get total count
    const totalPromise = WasteReport.countDocuments(filter);

    // 🔥 3️⃣ Get all status counts (WITHOUT pagination)
    const statusCountPromise = WasteReport.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const [reports, total, statusCounts] = await Promise.all([
      reportsPromise,
      totalPromise,
      statusCountPromise,
    ]);

    // Convert array to object
    const statusSummary = {
      PENDING: 0,
      IN_PROGRESS: 0,
      RESOLVED: 0,
    };

    statusCounts.forEach((item) => {
      statusSummary[item._id] = item.count;
    });

    return res.status(200).json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      statusSummary, // 🔥 added here
      reports,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      msg: error.message || "Internal Server Error",
    });
  }
});

Router.patch("/take/task/:id", authMiddleware, async (req, res) => {
  const session = await mongoose.startSession();

  try {
    if (req.user.role !== "staff") {
      return res
        .status(403)
        .json({ success: false, msg: "Only staff can take tasks" });
    }

    const { id } = req.params;
    let { team = [] } = req.body;

    // ✅ sanitize team: remove duplicates + remove self
    team = [...new Set(team.map(String))].filter(
      (x) => x !== String(req.user.id),
    );

    await session.withTransaction(async () => {
      // 1) Main staff must be ONLINE -> set to IN_WORK
      const staff = await StaffModel.findOneAndUpdate(
        { _id: req.user.id, status: "ONLINE" },
        { $set: { status: "IN_WORK", statusUpdatedAt: new Date() } },
        { new: true, session },
      );

      if (!staff) {
        throw new Error("You must be ONLINE to take a task.");
      }

      // 2) Team staff: only update those who are ONLINE
      // (If you want to REQUIRE all team to be ONLINE, see below)
      if (team.length > 0) {
        await StaffModel.updateMany(
          { _id: { $in: team }, status: "ONLINE" },
          { $set: { status: "IN_WORK", statusUpdatedAt: new Date() } },
          { session },
        );
      }

      // 3) Update report
      const report = await WasteReport.findOneAndUpdate(
        { _id: id, "assignedStaff.staff": { $ne: req.user.id } },
        {
          $set: { status: "IN_PROGRESS" },
          $push: {
            assignedStaff: {
              staff: req.user.id,
              team,
              joinedAt: new Date(),
              startedAt: new Date(),
            },
          },
        },
        { new: true, session },
      );

      if (!report) {
        // revert main staff
        await StaffModel.findByIdAndUpdate(
          req.user.id,
          { $set: { status: "ONLINE", statusUpdatedAt: new Date() } },
          { session },
        );

        // revert team too (best effort)
        if (team.length > 0) {
          await StaffModel.updateMany(
            { _id: { $in: team } },
            { $set: { status: "ONLINE", statusUpdatedAt: new Date() } },
            { session },
          );
        }

        throw new Error("Report not found OR you already took this task.");
      }

      res.status(200).json({ success: true, msg: "Task taken", report });
    });
  } catch (error) {
    return res.status(400).json({ success: false, msg: error.message });
  } finally {
    session.endSession();
  }
});

Router.patch(
  "/update/status/:id",
  authMiddleware,
  upload.array("verificationImages", 5),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const allowed = ["PENDING", "IN_PROGRESS", "RESOLVED"];
      if (!status || !allowed.includes(status)) {
        return res.status(400).json({ success: false, msg: "Invalid status" });
      }

      if (req.user.role !== "staff" && req.user.role !== "admin") {
        return res
          .status(403)
          .json({ success: false, msg: "Only staff/admin can update status" });
      }

      if (status === "RESOLVED" && (!req.files || req.files.length === 0)) {
        return res.status(400).json({
          success: false,
          msg: "Proof image is required when resolving a report",
        });
      }

      let proofImages = [];
      if (req.files?.length) {
        for (const file of req.files) {
          const fileName = await saveAsWebP(file.buffer, file.originalname);
          const url = `${req.protocol}://${req.get("host")}/uploads/${fileName}`;
          proofImages.push(url);
        }
      }

      const updateData = { $set: { status } };

      if (proofImages.length > 0) {
        updateData.$push = { verificationImages: { $each: proofImages } };
      }

      if (status === "RESOLVED") {
        updateData.$set.resolvedAt = new Date();
        updateData.$addToSet = { resolvedBy: req.user.id };
      }

      const updated = await WasteReport.findByIdAndUpdate(id, updateData, {
        new: true,
      }).lean();

      if (!updated) {
        return res
          .status(404)
          .json({ success: false, msg: "Report not found" });
      }

      // ✅ Update staff status (main + team) when resolved
      if (status === "RESOLVED") {
        // pick the assignment for this staff if exists, else last assignment
        const myAssign =
          updated.assignedStaff?.find(
            (a) => String(a.staff) === String(req.user.id),
          ) || updated.assignedStaff?.[updated.assignedStaff.length - 1];

        const teamIds = myAssign?.team || [];
        const staffIdsToOnline = [req.user.id, ...teamIds];

        await StaffModel.updateMany(
          { _id: { $in: staffIdsToOnline } },
          { $set: { status: "ONLINE", statusUpdatedAt: new Date() } },
        );
      }

      return res.status(200).json({
        success: true,
        msg: "Status updated successfully",
        report: updated,
      });
    } catch (error) {
      console.log(error);
      return res.status(500).json({
        success: false,
        msg: error.message || "Internal Server Error",
      });
    }
  },
);

// ── Step 1: Start Self-Clean (Staff + Student) ───────────────────────────────
// PATCH /self-clean/start/:id
// User clicks "Self Cleaning" → sets status to IN_PROGRESS, records who is cleaning
Router.patch("/self-clean/start/:id", authMiddleware, async (req, res) => {
  try {
    const { role, id: userId } = req.user;

    if (!["staff", "student"].includes(role)) {
      return res.status(403).json({
        success: false,
        msg: "Only staff and students can self-clean reports",
      });
    }

    const report = await WasteReport.findById(req.params.id);

    if (!report) {
      return res.status(404).json({ success: false, msg: "Report not found" });
    }

    if (report.status === "RESOLVED") {
      return res.status(400).json({ success: false, msg: "Report is already resolved" });
    }

    if (report.status === "REJECTED") {
      return res.status(400).json({ success: false, msg: "Cannot clean a rejected report" });
    }

    // ── Block self-clean if admin already assigned a cleaning staff ──
    if (report.assignedTo.length > 0) {
      return res.status(400).json({
        success: false,
        msg: "This report has been assigned to a cleaning staff by admin. Self-cleaning is not allowed.",
      });
    }

    if (report.status === "IN_PROGRESS" && report.selfCleanedBy) {
      return res.status(400).json({
        success: false,
        msg: "Someone is already cleaning this report",
      });
    }

    const updated = await WasteReport.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status: "IN_PROGRESS",
          selfCleanedBy: userId,
          selfCleanedByModel: role === "staff" ? "Staff" : "Student",
          selfCleanStartedAt: new Date(),
        },
      },
      { new: true }
    )
      .populate("userId", "fullName email")
      .lean();

    return res.status(200).json({
      success: true,
      msg: "Self-cleaning started! Upload proof when done.",
      report: updated,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      msg: error.message || "Internal Server Error",
    });
  }
});

// ── Step 2: Complete Self-Clean with proof ────────────────────────────────────
// PATCH /self-clean/complete/:id
// User uploads proof → status → RESOLVED + +100 reward points
Router.patch(
  "/self-clean/complete/:id",
  authMiddleware,
  upload.array("verificationImages", 4),
  async (req, res) => {
    try {
      const { role, id: userId } = req.user;

      if (!["staff", "student"].includes(role)) {
        return res.status(403).json({
          success: false,
          msg: "Only staff and students can submit cleaning proof",
        });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          msg: "At least one proof image is required",
        });
      }

      const report = await WasteReport.findById(req.params.id);

      if (!report) {
        return res.status(404).json({ success: false, msg: "Report not found" });
      }

      if (report.status === "RESOLVED") {
        return res.status(400).json({ success: false, msg: "Report is already resolved" });
      }

      if(report.status === "REJECTED"){
          return res.status(400).json({
          success: false,
          msg: "Rejected this waste report",
        });
      }

      if (report.status !== "IN_PROGRESS") {
        return res.status(400).json({
          success: false,
          msg: "Start self-cleaning first before submitting proof",
        });
      }

      // Verify the same user who started is completing
      if (report.selfCleanedBy?.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          msg: "Only the user who started cleaning can complete this",
        });
      }

      // Upload proof images
      const proofImages = [];
      for (const file of req.files) {
        const fileName = await saveAsWebP(file.buffer, file.originalname);
        const url = `${req.protocol}://${req.get("host")}/uploads/${fileName}`;
        proofImages.push(url);
      }

      // Mark as RESOLVED
      const updated = await WasteReport.findByIdAndUpdate(
        req.params.id,
        {
          $set: {
            status: "RESOLVED",
            resolvedAt: new Date(),
          },
          $push: { verificationImages: { $each: proofImages } },
          $addToSet: { resolvedBy: userId },
        },
        { new: true }
      )
        .populate("userId", "fullName email")
        .lean();

        //Self reward

      // Award +100 reward points
      if (role === "staff") {
        await StaffModel.findByIdAndUpdate(
          userId,
          { $inc: { rewardPoint: 100 } }
        );
      } else if (role === "student") {
        await StudentsModel.findByIdAndUpdate(
          userId,
          { $inc: { rewardPoint: 100 } }
        );
      }

      return res.status(200).json({
        success: true,
        msg: "Cleaning verified! You earned +100 reward points 🌿",
        rewardEarned: 100,
        report: updated,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        success: false,
        msg: error.message || "Internal Server Error",
      });
    }
  }
);



// ── Step 3: Cancel Self-Clean (Staff + Student) ───────────────────────────────
// PATCH /self-clean/cancel/:id
// User cancels an ongoing self-cleaning → reverts status to PENDING,
// removes self-cleaning fields, no points awarded.
Router.patch("/self-clean/cancel/:id", authMiddleware, async (req, res) => {
  try {
    const { role, id: userId } = req.user;

    if (!["staff", "student"].includes(role)) {
      return res.status(403).json({
        success: false,
        msg: "Only staff and students can cancel self-cleaning",
      });
    }

    const report = await WasteReport.findById(req.params.id);

    if (!report) {
      return res.status(404).json({ success: false, msg: "Report not found" });
    }

    // Only IN_PROGRESS reports with an active self-clean can be cancelled
    if (report.status !== "IN_PROGRESS") {
      return res.status(400).json({
        success: false,
        msg: "Only reports that are 'In Progress' can be cancelled",
      });
    }

    if (!report.selfCleanedBy) {
      return res.status(400).json({
        success: false,
        msg: "This report was not started as a self-clean task",
      });
    }

    // Ensure the same user who started is cancelling
    if (report.selfCleanedBy.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        msg: "Only the user who started cleaning can cancel it",
      });
    }

    // Revert status to PENDING and clear self-clean fields
    const updated = await WasteReport.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status: "PENDING",
          selfCleanedBy: null,
          selfCleanedByModel: null,
          selfCleanStartedAt: null,
        },
      },
      { new: true }
    )
      .populate("userId", "fullName email")
      .lean();

    return res.status(200).json({
      success: true,
      msg: "Self-cleaning cancelled successfully. No points were awarded.",
      report: updated,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      msg: error.message || "Internal Server Error",
    });
  }
});
// ─── ADD THESE ROUTES TO YOUR EXISTING wasteReportRouter.js ─────────────────
// All routes below require admin role

// ── Approve Report (PENDING → IN_PROGRESS, or IN_PROGRESS → RESOLVED) ────────
// PATCH /approve/report/:id
Router.patch("/approve/report/:id", authMiddleware, async (req, res) => {
  try {
  

    const report = await WasteReport.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, msg: "Report not found" });
    }

    if (report.status === "RESOLVED") {
      return res.status(400).json({ success: false, msg: "Report already resolved" });
    }
    if (report.status === "REJECTED") {
      return res.status(400).json({ success: false, msg: "Cannot approve a rejected report" });
    }

    const nextStatus = report.status === "PENDING" ? "IN_PROGRESS" : "RESOLVED";

    const updated = await WasteReport.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status: nextStatus,
          ...(nextStatus === "RESOLVED" ? { resolvedAt: new Date() } : {}),
        },
      },
      { new: true }
    )
      .populate("userId", "fullName email")
      .populate("assignedTo", "fullName staffId phone")
      .lean();

    return res.status(200).json({
      success: true,
      msg: `Report ${nextStatus === "IN_PROGRESS" ? "approved — now In Progress" : "marked as Resolved"}`,
      report: updated,
    });
  } catch (error) {
    return res.status(500).json({ success: false, msg: error.message });
  }
});

// ── Reject Report ─────────────────────────────────────────────────────────────
// PATCH /reject/report/:id
Router.patch("/reject/report/:id", authMiddleware, async (req, res) => {
  try {
    // 1. Only admin can reject reports
  

    const { rejectionReason } = req.body;
    const report = await WasteReport.findById(req.params.id);

    if (!report) {
      return res.status(404).json({ success: false, msg: "Report not found" });
    }

    if (report.status === "REJECTED") {
      return res.status(400).json({ success: false, msg: "Report is already rejected" });
    }

    // 2. Handle point deduction if report was self‑cleaned and resolved
    if (report.status === "RESOLVED" && report.selfCleanedBy) {
      const userId = report.selfCleanedBy;
      const userModel = report.selfCleanedByModel; // "Student" or "Staff"

      try {
        if (userModel === "Student") {
          await StudentsModel.findByIdAndUpdate(userId, {
            $inc: { rewardPoint: -100 },
          });
        } else if (userModel === "Staff") {
          await StaffModel.findByIdAndUpdate(userId, {
            $inc: { rewardPoint: -100 },
          });
        }
        // If user is not found, the deduction is silently skipped,
        // but the report is still rejected.
      } catch (pointErr) {
        console.error("Failed to deduct reward points:", pointErr);
        // Continue with rejection – do not block the admin action
      }
    }

    // 3. Update report status to REJECTED
    const updated = await WasteReport.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status: "REJECTED",
          rejectionReason: rejectionReason || "",
        },
      },
      { new: true }
    )
      .populate("userId", "fullName email")
      .lean();

    return res.status(200).json({
      success: true,
      msg: "Report rejected successfully" + (report.status === "RESOLVED" && report.selfCleanedBy ? " (100 points deducted)" : ""),
      report: updated,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, msg: error.message });
  }
});

// ── Assign Cleaning Staff ─────────────────────────────────────────────────────
// PATCH /assign/report/:id
Router.patch("/assign/report/:id", authMiddleware, async (req, res) => {
  try {
    // assignedTo is now an ARRAY of staff IDs
    const { assignedTo, staffModel } = req.body;

    // if (!assignedTo || !Array.isArray(assignedTo) || assignedTo.length === 0) {
    //   return res.status(400).json({ success: false, msg: "assignedTo must be a non-empty array of staff IDs" });
    // }

    const report = await WasteReport.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, msg: "Report not found" });
    }

    if (report.status === "RESOLVED" || report.status === "REJECTED") {
      return res.status(400).json({
        success: false,
        msg: "Cannot assign staff to a resolved or rejected report",
      });
    }

    const updated = await WasteReport.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          assignedTo,                              // array of IDs
          assignedStaffModel: staffModel || "CleaningStaff",
          assignedAt: new Date(),
          ...(report.status === "PENDING" ? { status: "IN_PROGRESS" } : {}),
        },
      },
      { new: true }
    )
      .populate("userId", "fullName email")
      .populate("assignedTo", "fullName staffId phone")   // populates all
      .lean();

    return res.status(200).json({
      success: true,
      msg: "Staff assigned successfully",
      report: updated,
    });
  } catch (error) {
    return res.status(500).json({ success: false, msg: error.message });
  }
});

// ── Delete Report (Admin only) ────────────────────────────────────────────────
// DELETE /delete/report/:id
Router.delete("/delete/report/:id", authMiddleware, async (req, res) => {
  try {
  

    const report = await WasteReport.findByIdAndDelete(req.params.id);

    if (!report) {
      return res.status(404).json({ success: false, msg: "Report not found" });
    }

    return res.status(200).json({
      success: true,
      msg: "Report deleted successfully",
      deletedId: req.params.id,
    });
  } catch (error) {
    return res.status(500).json({ success: false, msg: error.message });
  }
});

module.exports = Router;
