const cloudinary = require('cloudinary').v2;
require('dotenv').config();

// Validate configuration
const requiredEnvVars = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('Missing required Cloudinary environment variables:', missingEnvVars);
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Missing Cloudinary configuration: ${missingEnvVars.join(', ')}`);
  }
}

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

console.log('✓ Cloudinary configured successfully');
console.log(`  Environment: ${process.env.NODE_ENV}`);
console.log(`  Cloud Name: ${process.env.CLOUDINARY_CLOUD_NAME}`);

module.exports = cloudinary;