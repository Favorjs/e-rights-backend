const express = require('express');
const router = express.Router();
const FileUpload = require('../utils/fileUpload');

// Upload signature to Cloudinary
router.post('/signature', async (req, res) => {
  try {
    if (!req.files || !req.files.signature) {
      return res.status(400).json({ 
        error: 'No signature file uploaded' 
      });
    }

    const signatureFile = req.files.signature;
    const result = await FileUpload.uploadSignature(
      signatureFile.data,
      signatureFile.name
    );

    res.json({
      success: true,
      message: 'Signature uploaded successfully to Cloudinary',
      data: {
        publicId: result.public_id,
        url: result.secure_url,
        folder: FileUpload.folders.SIGNATURES,
        originalName: signatureFile.name,
        size: signatureFile.size,
        mimetype: signatureFile.mimetype
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

// Upload receipt to Cloudinary
// Upload receipt
router.post('/receipt', async (req, res) => {
  try {
    if (!req.files || !req.files.receipt) {
      return res.status(400).json({ 
        error: 'No receipt file uploaded' 
      });
    }

    const receiptFile = req.files.receipt;
    const result = await FileUpload.uploadReceipt(
      receiptFile.data,
      receiptFile.name
    );

    res.json({
      success: true,
      message: 'Receipt uploaded successfully to Cloudinary',
      data: {
        publicId: result.public_id,
        url: result.secure_url,
        folder: FileUpload.folders.RECEIPTS,
        originalName: receiptFile.name,
        size: receiptFile.size,
        mimetype: receiptFile.mimetype
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
// Upload both signature and receipt to Cloudinary
router.post('/both', async (req, res) => {
  try {
    if (!req.files) {
      return res.status(400).json({ 
        error: 'No files uploaded' 
      });
    }

    const uploadedFiles = {};
    const files = req.files;

    if (files.signature) {
      const signatureFile = Array.isArray(files.signature) ? files.signature[0] : files.signature;
      const signatureResult = await FileUpload.uploadBuffer(
        signatureFile.data,
        signatureFile.name,
        'rights-submissions/signatures'
      );
      
      uploadedFiles.signature = {
        publicId: signatureResult.public_id,
        url: signatureResult.secure_url,
        originalName: signatureFile.name,
        size: signatureFile.size,
        mimetype: signatureFile.mimetype
      };
    }

    if (files.receipt) {
      const receiptFile = Array.isArray(files.receipt) ? files.receipt[0] : files.receipt;
      const receiptResult = await FileUpload.uploadBuffer(
        receiptFile.data,
        receiptFile.name,
        'rights-submissions/receipts'
      );
      
      uploadedFiles.receipt = {
        publicId: receiptResult.public_id,
        url: receiptResult.secure_url,
        originalName: receiptFile.name,
        size: receiptFile.size,
        mimetype: receiptFile.mimetype
      };
    }

    res.json({
      success: true,
      message: 'Files uploaded successfully to Cloudinary',
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

// Get file download URL from Cloudinary
router.get('/download/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;
    const { filename } = req.query;

    const cloudinary = require('../config/cloudinary');
    const downloadUrl = cloudinary.url(publicId, {
      secure: true,
      flags: filename ? `attachment:${filename}` : 'attachment'
    });

    res.json({
      success: true,
      data: {
        downloadUrl: downloadUrl,
        publicId: publicId
      }
    });
  } catch (error) {
    console.error('Error generating download URL:', error);
    res.status(500).json({ 
      error: 'Failed to generate download URL',
      message: error.message 
    });
  }
});

// Delete file from Cloudinary
router.delete('/file/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;
    
    const result = await FileUpload.deleteFile(publicId);
    
    res.json({
      success: true,
      message: 'File deleted successfully from Cloudinary',
      data: result
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ 
      error: 'Failed to delete file',
      message: error.message 
    });
  }
});

// Get file info from Cloudinary
router.get('/file/:publicId/info', async (req, res) => {
  try {
    const { publicId } = req.params;
    
    const cloudinary = require('../config/cloudinary');
    const result = await cloudinary.api.resource(publicId);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting file info:', error);
    res.status(500).json({ 
      error: 'Failed to get file info',
      message: error.message 
    });
  }
});

module.exports = router;