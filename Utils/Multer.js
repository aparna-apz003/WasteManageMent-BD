// upload.js
import multer from "multer";
import path from "path";
import sharp from "sharp";
import fs from "fs";

// Ensure uploads folder exists
const uploadDir = "uploads/";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Multer storage (we'll save original temporarily before conversion)
const storageLocal = multer.memoryStorage(); // store in memory first

export const upload = multer({
  storage: storageLocal,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB

  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) cb(null, true);
    else cb(new Error("Only images allowed"));
  },
});

// Convert buffer to WebP and save locally
export const saveAsWebP = async (fileBuffer, originalName) => {
  const fileName = Date.now() + "-" + originalName.replace(/\s+/g, "_") + ".webp";
  const filePath = path.join(uploadDir, fileName);

  await sharp(fileBuffer)
    .webp({ quality: 80 })
    .toFile(filePath);

  return fileName; // return filename for database or response
};
