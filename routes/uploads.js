const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const uploadsDir = path.join(__dirname, '../../uploads');
const signaturesDir = path.join(uploadsDir, 'signatures');
const receiptsDir = path.join(uploadsDir, 'receipts');

[uploadsDir, signaturesDir, receiptsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Determine destination based on file type
    if (file.fieldname === 'signature') {
      cb(null, signaturesDir);
    } else if (file.fieldname === 'receipt') {
      cb(null, receiptsDir);
    } else {
      cb(null, uploadsDir);
    }
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  // Allow only image and PDF files
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and PDF files are allowed.'), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Upload signature
router.post('/signature', upload.single('signature'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No signature file uploaded' 
      });
    }

    const filePath = `signatures/${req.file.filename}`;
    
    res.json({
      success: true,
      message: 'Signature uploaded successfully',
      data: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        filePath: filePath,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Error uploading signature:', error);
    res.status(500).json({ 
      error: 'Failed to upload signature',
      message: error.message 
    });
  }
});

// Upload receipt
router.post('/receipt', upload.single('receipt'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No receipt file uploaded' 
      });
    }

    const filePath = `receipts/${req.file.filename}`;
    
    res.json({
      success: true,
      message: 'Receipt uploaded successfully',
      data: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        filePath: filePath,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Error uploading receipt:', error);
    res.status(500).json({ 
      error: 'Failed to upload receipt',
      message: error.message 
    });
  }
});

// Upload both signature and receipt
router.post('/both', upload.fields([
  { name: 'signature', maxCount: 1 },
  { name: 'receipt', maxCount: 1 }
]), (req, res) => {
  try {
    const files = req.files;
    const uploadedFiles = {};

    if (files.signature) {
      uploadedFiles.signature = {
        filename: files.signature[0].filename,
        originalName: files.signature[0].originalname,
        filePath: `signatures/${files.signature[0].filename}`,
        size: files.signature[0].size,
        mimetype: files.signature[0].mimetype
      };
    }

    if (files.receipt) {
      uploadedFiles.receipt = {
        filename: files.receipt[0].filename,
        originalName: files.receipt[0].originalname,
        filePath: `receipts/${files.receipt[0].filename}`,
        size: files.receipt[0].size,
        mimetype: files.receipt[0].mimetype
      };
    }

    res.json({
      success: true,
      message: 'Files uploaded successfully',
      data: uploadedFiles
    });
  } catch (error) {
    console.error('Error uploading files:', error);
    res.status(500).json({ 
      error: 'Failed to upload files',
      message: error.message 
    });
  }
});

// Get file by path
router.get('/file/:type/:filename', (req, res) => {
  try {
    const { type, filename } = req.params;
    
    if (!['signatures', 'receipts'].includes(type)) {
      return res.status(400).json({ 
        error: 'Invalid file type' 
      });
    }

    const filePath = path.join(__dirname, '../../uploads', type, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        error: 'File not found' 
      });
    }

    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ 
      error: 'Failed to serve file',
      message: error.message 
    });
  }
});

// Delete file
router.delete('/file/:type/:filename', (req, res) => {
  try {
    const { type, filename } = req.params;
    
    if (!['signatures', 'receipts'].includes(type)) {
      return res.status(400).json({ 
        error: 'Invalid file type' 
      });
    }

    const filePath = path.join(__dirname, '../../uploads', type, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        error: 'File not found' 
      });
    }

    fs.unlinkSync(filePath);
    
    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ 
      error: 'Failed to delete file',
      message: error.message 
    });
  }
});

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: 'File too large. Maximum size is 5MB.' 
      });
    }
    return res.status(400).json({ 
      error: 'File upload error',
      message: error.message 
    });
  }
  
  if (error) {
    return res.status(400).json({ 
      error: 'Upload error',
      message: error.message 
    });
  }
  
  next();
});

module.exports = router; 