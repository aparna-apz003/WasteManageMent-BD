const mongoose = require("mongoose");

const campaignSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },

    description: {
      type: String,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },

    // optional: campaign created based on a waste report
    reportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WasteReport",
    },

    location: {
      building: String,
      area: String,
      coordinates: {
        lat: Number,
        lng: Number,
      },
    },

    campaignDate: {
      type: Date,
      required: true,
    },

    startTime: String,
    endTime: String,

    maxVolunteers: {
      type: Number,
      default: 20,
    },

    volunteers: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          refPath: "volunteers.userModel",
        },
        userModel: {
          type: String,
          enum: ["Student", "Staff"],
        },
        registeredAt: {
          type: Date,
          default: Date.now,
        },
        attended: {
          type: Boolean,
          default: false,
        },
      },
    ],

    wasteCategory: {
      type: String,
      enum: ["PLASTIC", "FOOD", "METAL", "PAPER", "OTHER"],
    },

    status: {
      type: String,
      enum: ["UPCOMING", "ONGOING", "COMPLETED", "CANCELLED"],
      default: "UPCOMING",
    },

    images: [String],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Campaign", campaignSchema);