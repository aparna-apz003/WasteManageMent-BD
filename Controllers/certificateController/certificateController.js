const express = require("express");
const PDFDocument = require("pdfkit");
const StudentsModel = require("../../models/StudentsModel");
const authMiddleware = require("../../Middleware/AuthMiddleware");

const router = express.Router();

router.get("/download/certificate", authMiddleware, async (req, res) => {
  try {
    const studentId = req.user.id;
    const student = await StudentsModel.findById(studentId);

    if (!student) {
      return res.status(404).json({ success: false, msg: "Student not found" });
    }

    if (student.rewardPoint < 5000) {
      return res.status(400).json({
        success: false,
        msg: "Minimum 5000 reward points required to download certificate",
      });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Certificate_${student.fullName.replace(/\s+/g, '_')}.pdf`
    );

    // Landscape A4
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 0, // We will handle margins manually for the border
    });

    doc.pipe(res);

    const width = doc.page.width;
    const height = doc.page.height;

    // --- DESIGN ELEMENTS ---

    // 1. Outer Border (Elegant Slate)
    doc
      .rect(20, 20, width - 40, height - 40)
      .lineWidth(2)
      .strokeColor("#1e293b")
      .stroke();

    // 2. Inner Decorative Border (Emerald Green)
    doc
      .rect(30, 30, width - 60, height - 60)
      .lineWidth(1)
      .strokeColor("#10b981")
      .stroke();

    // 3. Top-Right Green Accent Triangle
    doc
      .save()
      .moveTo(width - 150, 30)
      .lineTo(width - 30, 150)
      .lineTo(width - 30, 30)
      .fill("#10b981");

    // --- CONTENT ---

    // Header Title
    doc.moveDown(4);
    doc
      .fillColor("#065f46")
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("OFFICIAL ECO-RECOGNITION", { align: "center", characterSpacing: 2 });

    doc.moveDown(1);
    doc
      .fillColor("#1e293b")
      .fontSize(42)
      .font("Times-Bold")
      .text("Certificate of Achievement", { align: "center" });

    // Decorative Line
    doc
      .moveTo(width / 2 - 100, doc.y + 10)
      .lineTo(width / 2 + 100, doc.y + 10)
      .lineWidth(1)
      .strokeColor("#cbd5e1")
      .stroke();

    doc.moveDown(2);

    // Presentation Text
    doc
      .fillColor("#64748b")
      .fontSize(18)
      .font("Helvetica-Oblique")
      .text("This prestigious award is presented to", { align: "center" });

    doc.moveDown(1);

    // Student Name (Highlight)
    doc
      .fillColor("#10b981")
      .fontSize(36)
      .font("Helvetica-Bold")
      .text(student.fullName.toUpperCase(), { align: "center" });

    doc.moveDown(1);

    // Achievement Description
    doc
      .fillColor("#334155")
      .fontSize(16)
      .font("Helvetica")
      .text(
        "In recognition of your outstanding commitment to environmental sustainability",
        { align: "center" }
      );
    
    doc.text(
        "and active participation in the Smart Waste Management initiative.",
        { align: "center" }
    );

    doc.moveDown(2);

    // Reward Points Badge Area
    const badgeY = doc.y;
    doc
      .circle(width / 2, badgeY + 30, 45)
      .fillColor("#f8fafc")
      .fillAndStroke("#10b981");

    doc
      .fillColor("#064e3b")
      .fontSize(22)
      .font("Helvetica-Bold")
      .text(`${student.rewardPoint}`, width / 2 - 45, badgeY + 15, { width: 90, align: "center" });
    
    doc
      .fontSize(10)
      .text("POINTS", width / 2 - 45, badgeY + 40, { width: 90, align: "center" });

    // --- FOOTER (Signatures & Date) ---

    const footerY = height - 120;

    // Left: Date
    doc
      .fillColor("#64748b")
      .fontSize(12)
      .font("Helvetica")
      .text(`Issued on: ${new Date().toLocaleDateString()}`, 80, footerY);

    // Right: Verification ID
    const certId = `CERT-${student._id.toString().slice(-6).toUpperCase()}`;
    doc.text(`Verification ID: ${certId}`, width - 280, footerY, { align: "right", width: 200 });

    // Signature Line
    doc
      .moveTo(width / 2 - 80, height - 80)
      .lineTo(width / 2 + 80, height - 80)
      .strokeColor("#94a3b8")
      .stroke();

    doc
      .fontSize(10)
      .text("ECO-SYSTEM DIRECTOR", width / 2 - 80, height - 70, { width: 160, align: "center" });

    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, msg: "Server Error" });
  }
});

module.exports = router;