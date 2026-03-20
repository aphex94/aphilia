import express from "express";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import dotenv from "dotenv";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});

const allowedMimeTypes = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error("Only video files are allowed."));
    }
    cb(null, true);
  },
});

function randomName(length = 6) {
  return crypto.randomBytes(length).toString("base64url");
}

function getExtension(originalName) {
  const ext = path.extname(originalName || "").toLowerCase();
  return ext || ".mp4";
}

app.use(express.static("public"));

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const providedKey = req.header("x-upload-key");

    if (!providedKey || providedKey !== process.env.UPLOAD_KEY) {
      return res.status(401).json({ error: "Unauthorized." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const ext = getExtension(req.file.originalname);
    const fileName = `${randomName()}${ext}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: fileName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      })
    );

    const publicUrl = `${process.env.PUBLIC_BASE_URL.replace(/\/$/, "")}/${fileName}`;

    res.json({
      success: true,
      fileName,
      url: publicUrl,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Upload failed.",
      details: error.message,
    });
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({
    error: err.message || "Unknown error.",
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});