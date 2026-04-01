const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fileUpload = require('express-fileupload');
require('dotenv').config();
const FormData = require("form-data"); // form-data v4.0.1
const Mailgun = require("mailgun.js"); // mailgun.js v11.1.0


const app = express();

// Import database initialization
const initDatabase = require('./config/init-db');

// Import routes
const shareholderRoutes = require('./routes/shareholders');
const formRoutes = require('./routes/forms');
const walletRoutes = require('./routes/wallet');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/uploads');

// CORS configuration - MOVE THIS TO THE TOP
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests, or same-origin)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'http://localhost:3000', // React dev server
      'http://localhost:5000',
      'https://LASACO.apel.com.ng',
      'https://www.LASACO.apel.com.ng'
    ];

    // Check if the origin is in the allowed list or if it's a localhost origin
    if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('localhost')) {
      callback(null, true);
    } else {
      console.log('CORS blocked for origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

// Apply CORS middleware FIRST
app.use(cors(corsOptions));

// Other middleware
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(fileUpload({
  createParentPath: true,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  abortOnLimit: true,
  useTempFiles: true,
  tempFileDir: require('os').tmpdir()
}));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client/build')));

// Routes
app.use('/api/shareholders', shareholderRoutes);
app.use('/api/forms', formRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/uploads', uploadRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Rights Web App API is running',
    timestamp: new Date().toISOString()
  });
});

// Serve React app in production - make sure this comes after API routes
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
// });

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);

  // Handle CORS errors specifically
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'CORS Error',
      message: 'Origin not allowed'
    });
  }

  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

const PORT = process.env.PORT || 5000;



// async function sendSimpleMessage() {
//   const mailgun = new Mailgun(FormData);
//   const mg = mailgun.client({
//     username: "api",
//     key: process.env.MAILGUN_API_KEY,
//     // When you have an EU-domain, you must specify the endpoint:
//     // url: "https://api.eu.mailgun.net"
//   });
//   try {
//     const data = await mg.messages.create("registrars.apel.com.ng", {
//       from: "LASACO Assurance E-rights <alerts@registrars.apel.com.ng>",
//       to: ["<itservices@apelasset.com>"],
//       subject: "Hello IT",
//       text: "Congratulations IT, you just sent an email with Mailgun! You are truly awesome!",
//     });

//     console.log(data); // logs response data
//   } catch (error) {
//     console.log(error); //logs any error
//   }
// }

// sendSimpleMessage();
// Background Jobs
const processProofRequests = require('./scripts/processProofRequests');

// Initialize database and start server
const startServer = async () => {
  try {
    // Initialize database
    await initDatabase();
    console.log('Database initialized successfully');

    // Run background jobs on startup
    processProofRequests().catch(err => console.error('Initial background job failed:', err));

    // Schedule background jobs (every hour)
    setInterval(() => {
      processProofRequests().catch(err => console.error('Scheduled background job failed:', err));
    }, 60 * 60 * 1000);

    // Start server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();