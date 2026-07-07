const mongoose = require("mongoose");

const WasteReportSchema = new mongoose.Schema(
  {
    reporterType: {
      type: String,
      enum: ["GUEST", "student", "staff","admin"],
      default: "GUEST",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "userModel",
      default: null,
    },
    userModel: {
      type: String,
      enum: ["Student", "Staff", null],
      default: null,
    },
    guestName: { type: String, trim: true, default: "" },
    guestPhone: { type: String, trim: true, default: "" },
    wasteImage: { type: [String], required: true, default: [] },
    wasteQty: {
      type: String,
      required: [true, "Waste quantity is required"],
      enum: {
        values: ["SMALL", "MEDIUM", "LARGE"],
        message: "Must be SMALL, MEDIUM, or LARGE",
      },
      trim: true,
      uppercase: true,
    },
    wasteLocation: { type: String, required: true, trim: true },
    landmark: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    wasteCategory: {
      type: String,
      required: true,
      enum: ["PLASTIC", "ORGANIC", "PAPER", "OTHERS"],
    },
    status: {
      type: String,
      enum: ["PENDING", "IN_PROGRESS", "RESOLVED", "REJECTED"],
      default: "PENDING",
    },

    // ── Admin assign ──────────────────────────────────────────────────
    assignedTo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CleaningStaff",
        default: [],
      },
    ],
    assignedStaffModel: { type: String, default: "CleaningStaff" },
    assignedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, default: "" },

    verificationImages: { type: [String], default: [] },

    // ── Self-clean ────────────────────────────────────────────────────
    selfCleanedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "selfCleanedByModel",
      default: null,
    },
    selfCleanedByModel: {
      type: String,
      enum: ["Staff", "Student"],
      default: null,
    },
    selfCleanStartedAt: { type: Date, default: null },

    // ── Staff team assignment ─────────────────────────────────────────
    assignedStaff: [
      {
        staff: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "CleaningStaff",
          required: true,
        },
        joinedAt: { type: Date, default: Date.now },
        team: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CleaningStaff",
            default: [],
          },
        ],
        startedAt: Date,
        completedAt: Date,
        timeTakenMinutes: { type: Number, default: 0 },
      },
    ],

    resolvedBy: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Staff",
      default: [],
    },
    resolvedAt: { type: Date },
    aiConfidence: { type: Number, default: null },
    aiDistribution: { type: Array, default: [] },
  },
  { timestamps: true },
);

module.exports = mongoose.model("WasteReport", WasteReportSchema);
