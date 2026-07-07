const express = require("express");
const adminModel = require("../../models/adminModel");
const jwt = require("jsonwebtoken");
const Router = express.Router();

Router.post("/create/admin", async (req, res) => {
  try {
    const { userName, password } = req.body;

    if (!userName || !password) {
      return res.status(401).json({ msg: "user Name Password required" });
    }

    const Admin = await adminModel.create({ userName, password });

    if (!Admin) {
      return res.status(404).json({ msg: "admin creating failed" });
    }

    res.status(201).json({ msg: "admin Created success" });
  } catch (error) {
    console.log(error);
  }
});

Router.post("/admin/login", async (req, res) => {
  try {
    const { userName, password } = req.body;

    if (!userName || !password) {
      return res.status(400).json({ msg: "Username and password required" });
    }

    const admin = await adminModel.findOne({ userName });
    if (!admin) {
      return res.status(404).json({ msg: "Admin not found" });
    }

    const isValidPassword = await admin.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ msg: "Invalid password" });
    }

    const token = jwt.sign(
      { id: admin._id, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      success: true,
      msg: "Login successful",
      token,
      userName:admin.userName,
      adminId: admin._id,
      role:admin.role
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = Router;
