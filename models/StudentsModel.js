const mongoose = require("mongoose");

const StudentSchema = new mongoose.Schema(
  {
    admissionNumber: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    dateOfBirth: {
      type: String,
      required: true,
    },
    fullName:{
      type: String,
      required: true,
      trim: true,
    },
    email:{
      type: String,
      trim: true,
    },
    role:{
      type:String,
      default:"student"
    },
        rewardPoint: {
      type: Number,
      default: 0,
    },

  },
  { timestamps: true }
);

module.exports = mongoose.model("Student", StudentSchema);
