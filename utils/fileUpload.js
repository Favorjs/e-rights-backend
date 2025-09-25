// utils/fileUpload.js
const cloudinary = require('../config/cloudinary');

class FileUpload {
  static folders = {
    SIGNATURES: 'rights-submissions/signatures',
    RECEIPTS: 'rights-submissions/receipts',
    FILLED_FORMS: 'rights-submissions/filled-forms'
  };

  // Upload buffer to Cloudinary
  static async uploadBuffer(buffer, fileName, folder = 'rights-submissions') {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'auto',
          public_id: fileName.replace(/\.[^/.]+$/, ""), // Remove extension
          folder: folder,
          overwrite: true,
          format: this.getFileFormat(fileName)
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(buffer);
    });
  }

  // Upload signature with specific settings
  static async uploadSignature(buffer, fileName) {
    return this.uploadBuffer(buffer, fileName, this.folders.SIGNATURES);
  }

  // Upload receipt with specific settings
  static async uploadReceipt(buffer, fileName) {
    return this.uploadBuffer(buffer, fileName, this.folders.RECEIPTS);
  }

  // Upload filled form
  static async uploadFilledForm(buffer, fileName) {
    return this.uploadBuffer(buffer, fileName, this.folders.FILLED_FORMS);
  }

  // Get file format for Cloudinary
  static getFileFormat(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const imageFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const documentFormats = ['pdf', 'doc', 'docx'];
    
    if (imageFormats.includes(ext)) return ext;
    if (documentFormats.includes(ext)) return ext;
    return 'auto'; // Let Cloudinary detect
  }

  // Delete file from Cloudinary
  static async deleteFile(publicId) {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.destroy(publicId, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
  }

  // Get download URL
  static getDownloadUrl(publicId, fileName = null) {
    const options = {
      secure: true,
      flags: fileName ? `attachment:${fileName}` : 'attachment'
    };
    
    return cloudinary.url(publicId, options);
  }

  // Get preview URL
  static getPreviewUrl(publicId) {
    return cloudinary.url(publicId, { secure: true });
  }
}

module.exports = FileUpload;