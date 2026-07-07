const mongoose = require("mongoose");

const cleaningStaffSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    staffId: {
      type: String,
      required: true,
      unique: true,
    },

    phone: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
    },

  
  },
  { timestamps: true }
);

module.exports = mongoose.model("CleaningStaff", cleaningStaffSchema);