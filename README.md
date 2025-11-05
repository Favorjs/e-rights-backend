# Rights Issue Web App - Server

This is the backend server for the Rights Issue Web Application.

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v10 or higher)
- npm or yarn

## Setup

1. Copy `.env.example` to `.env` and update the values:
   ```bash
   cp .env.example .env
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up your PostgreSQL database and update the `.env` file with your database credentials.

## Running the Server

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

## Environment Variables

- `PORT` - Port the server will run on (default: 5000)
- `NODE_ENV` - Environment (development/production)
- `DB_*` - Database connection settings
- `JWT_SECRET` - Secret key for JWT token generation
- `JWT_EXPIRE` - JWT token expiration time
- `UPLOAD_DIR` - Directory for file uploads
- `MAX_FILE_SIZE` - Maximum file size for uploads

## API Documentation

API documentation is available at `http://localhost:2500/api-docs` when running in development mode.


\copy stockbrokers(name,code,created_at) FROM 'C:\Users\fadebowale\Desktop\APEL-WEBSITE\stockbrokers_list.csv' WITH (FORMAT csv, HEADER true, DELIMITER ',');

reg_account_number	name	holdings	rights_issue	holdings after	amount_due	created_at	updated_at


\copy shareholders(reg_account_number,name,holdings,rights_issue,holdings_after,amount_due,created_at,updated_at) FROM 'C:\Users\fadebowale\Desktop\APEL-WEBSITE\tip rights-issue_updated.csv' WITH (FORMAT csv, HEADER true, DELIMITER ',');