const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const bcrypt = require('bcrypt');

// Get dashboard statistics
router.post('/admin-signup',async (req,res)=>{
  try{
const {email,password} = req.body
const hashedPassword = await bcrypt.hash(password,10);
const createAdminUser = await pool.query('INSERT INTO admin_users (email,password) VALUES ($1,$2)', [email,hashedPassword]);

return res.status(200).json({
  success: true,
  message: 'Admin signup successful'
});

  }catch(error){
    console.error('Error logging in:', error);
    res.status(500).json({ 
      error: 'Failed to signup',
      message: error.message 
    });
  }
})

router.post('/admin-login', async (req, res) => {
  try {
const {email,password} =req.body;

const adminUser = await pool.query('SELECT * FROM admin_users WHERE email = $1', [email]);

if(adminUser.rows.length === 0){
  return res.status(401).json({
    success: false,
    message: 'Invalid email or password'
  });
}

const validPassword = await bcrypt.compare(password, adminUser.rows[0].password);

if(!validPassword){
  return res.status(401).json({
    success: false,
    message: 'Invalid email or password'
  });
}


return res.status(200).json({
  success: true,
  message: 'Admin login successful'
});
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ 
      error: 'Failed to log in',
      message: error.message 
    });
  }
});


router.get('/dashboard', async (req, res) => {
  try {
    // Get total shareholders count
    const shareholdersCountQuery = 'SELECT COUNT(*) FROM shareholders';
    const shareholdersCount = await pool.query(shareholdersCountQuery);

    // Get total submissions count (forms + rights submissions)
    const formsCountQuery = 'SELECT COUNT(*) FROM forms';
    const rightsCountQuery = 'SELECT COUNT(*) FROM rights_submissions';
    
    const formsCount = await pool.query(formsCountQuery);
    const rightsCount = await pool.query(rightsCountQuery);
    
    const totalSubmissions = parseInt(formsCount.rows[0].count) + parseInt(rightsCount.rows[0].count);
    const totalShareholders = parseInt(shareholdersCount.rows[0].count);
    const rightsSubmissions = parseInt(rightsCount.rows[0].count);

    res.json({
      success: true,
      data: {
        totalShareholders,
        totalSubmissions,
        rightsSubmissions
      }
    });
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    res.status(500).json({ 
      error: 'Failed to get dashboard statistics',
      message: error.message 
    });
  }
});

// Get all form submissions with pagination and filtering
router.get('/submissions', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      status,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        f.id,
        f.shareholder_id,
        s.reg_account_number,
        s.name,
        s.holdings,
        s.rights_issue,
        s.holdings_after,
        f.acceptance_type,
        f.shares_accepted,
        f.shares_renounced,
        f.additional_shares_applied,
        f.amount_payable,
        f.payment_account_number,
        f.contact_name,
        f.email,
        f.status,
        f.signature_file,
        f.receipt_file,
        f.created_at,
        f.updated_at
        f.amount_payable
      FROM forms f
      JOIN shareholders s ON f.shareholder_id = s.id
    `;
    
    let countQuery = `
      SELECT COUNT(*) 
      FROM forms f
      JOIN shareholders s ON f.shareholder_id = s.id
    `;
    
    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;
    
    if (search) {
      whereConditions.push(`(LOWER(s.name) LIKE LOWER($${paramIndex}) OR s.reg_account_number LIKE $${paramIndex} OR LOWER(f.email) LIKE LOWER($${paramIndex}))`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }
    
    if (status) {
      whereConditions.push(`f.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }
    
    if (whereConditions.length > 0) {
      const whereClause = 'WHERE ' + whereConditions.join(' AND ');
      query += ' ' + whereClause;
      countQuery += ' ' + whereClause;
    }
    
    // Validate sort parameters
    const allowedSortFields = ['created_at', 'name', 'reg_account_number', 'status', 'amount_payable'];
    const allowedSortOrders = ['ASC', 'DESC'];
    
    if (!allowedSortFields.includes(sortBy)) sortBy = 'created_at';
    if (!allowedSortOrders.includes(sortOrder.toUpperCase())) sortOrder = 'DESC';
    
    query += ` ORDER BY ${sortBy} ${sortOrder}`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);
    
    const [result, countResult] = await Promise.all([
      pool.query(query, queryParams),
      pool.query(countQuery, queryParams.slice(0, -2))
    ]);
    
    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);
    
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error getting submissions:', error);
    res.status(500).json({ 
      error: 'Failed to get submissions',
      message: error.message 
    });
  }
});

// Get submission details by ID
router.get('/submissions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT 
        f.*,
        s.reg_account_number,
        s.name as shareholder_name,
        s.holdings,
        s.rights_issue,
        s.holdings_after
        s.amount_payable
      FROM forms f
      JOIN shareholders s ON f.shareholder_id = s.id
      WHERE f.id = $1
    `;

    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Submission not found' 
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error getting submission details:', error);
    res.status(500).json({ 
      error: 'Failed to get submission details',
      message: error.message 
    });
  }
});

// Update submission status
router.patch('/submissions/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['pending', 'completed', 'rejected'].includes(status)) {
      return res.status(400).json({ 
        error: 'Invalid status. Must be pending, completed, or rejected' 
      });
    }

    const query = `
      UPDATE forms 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [status, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Submission not found' 
      });
    }

    res.json({
      success: true,
      message: 'Submission status updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating submission status:', error);
    res.status(500).json({ 
      error: 'Failed to update submission status',
      message: error.message 
    });
  }
});

// Export submissions data
router.get('/export', async (req, res) => {
  try {
    const { format = 'json' } = req.query;
    
    const query = `
      SELECT 
        s.reg_account_number,
        s.name,
        s.holdings,
        s.rights_issue,
        s.holdings_after,
        f.acceptance_type,
        f.shares_accepted,
        f.shares_renounced,
        f.additional_shares_applied,
        f.amount_payable,
        f.payment_account_number,
        f.contact_name,
        f.email,
        f.status,
        f.created_at
      FROM forms f
      JOIN shareholders s ON f.shareholder_id = s.id
      ORDER BY f.created_at DESC
    `;

    const result = await pool.query(query);
    
    if (format === 'csv') {
      const csvHeader = 'Subscription Date,Registrars Account Number,Surname,Other Names,CHN,BVN,Phone Number,Email,Holdings,Rights Issue,Additional Shares,Holdings After,Amount Payable,Total Shares Accepted & Paid For,Shares Renounced\n';
      const csvData = result.rows.map(row => 
        `"${row.created_at ? new Date(row.created_at).toLocaleDateString('en-NG') : ''}","${row.reg_account_number}","${row.name}",${row.holdings},${row.rights_issue},${row.holdings_after},"${row.acceptance_type}",${row.shares_accepted || ''},${row.shares_renounced || ''},${row.additional_shares_applied || ''},${row.amount_payable || ''},"${row.payment_account_number || ''}","${row.contact_name}","${row.email}","${row.status}","${row.created_at}"`
      ).join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=submissions.csv');
      res.send(csvHeader + csvData);
    } else {
      res.json({
        success: true,
        data: result.rows,
        count: result.rows.length
      });
    }
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ 
      error: 'Failed to export data',
      message: error.message 
    });
  }
});

// Get individual rights submission details
router.get('/rights-submissions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT *
      FROM rights_submissions
      WHERE id = $1
    `;

    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Rights submission not found' 
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error getting rights submission details:', error);
    res.status(500).json({ 
      error: 'Failed to get rights submission details',
      message: error.message 
    });
  }
});

// Get rights submissions with pagination and filtering
router.get('/rights-submissions', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      status,
      rightsClaiming, // New filter parameter
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        id,
        shareholder_id,
        chn,
        action_type,
        reg_account_number,
        name,
        bvn,
        COALESCE(mobile_phone, daytime_phone, '') as phone_number,
        email,
        shares_accepted,
        amount_payable, 
        additional_shares,
        additional_amount,
        apply_additional, 
        shares_renounced,
        payment_amount,
        COALESCE(
          CASE 
            WHEN additional_payment_cheque_number IS NOT NULL THEN 'Cheque'
            WHEN partial_payment_cheque_number IS NOT NULL THEN 'Cheque'
            WHEN payment_amount IS NOT NULL THEN 'Electronic Transfer'
            ELSE 'Cash'
          END, 'Cash'
        ) as payment_method,
        contact_name,
        holdings,
        rights_issue,
        holdings_after,
        amount_due,
        filled_form_path,
        receipt_path,
        status,
        created_at,
        updated_at
      FROM rights_submissions
    `;
    
    let countQuery = `
      SELECT COUNT(*) 
      FROM rights_submissions
    `;
    
    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;
    
    if (search) {
      whereConditions.push(`(LOWER(name) LIKE LOWER($${paramIndex}) OR reg_account_number LIKE $${paramIndex} OR chn LIKE $${paramIndex} OR LOWER(email) LIKE LOWER($${paramIndex}) OR bvn LIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }
    
    if (status && status !== 'All Status') {
      whereConditions.push(`status = $${paramIndex}`);
      queryParams.push(status.toLowerCase());
      paramIndex++;
    }
    
    // Add rights claiming filter
    if (rightsClaiming) {
      if (rightsClaiming === 'full') {
        whereConditions.push(`action_type = $${paramIndex}`);
        queryParams.push('full_acceptance');
      } else if (rightsClaiming === 'renounced') {
        whereConditions.push(`action_type = $${paramIndex}`);
        queryParams.push('renunciation_partial');
      }
      paramIndex++;
    }
    
    if (whereConditions.length > 0) {
      const whereClause = ' WHERE ' + whereConditions.join(' AND ');
      query += whereClause;
      countQuery += whereClause;
    }
    
    // Add sorting
    query += ` ORDER BY ${sortBy} ${sortOrder}`;
    
    // Add pagination
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(parseInt(limit), offset);
    
    // For count query, we need to remove the last two parameters (limit and offset)
    const countParams = queryParams.slice(0, -2);
    
    const [result, countResult] = await Promise.all([
      pool.query(query, queryParams),
      countQuery === query ? { rows: [{ count: '0' }] } : pool.query(countQuery, countParams)
    ]);
    
    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);
    
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalCount,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching rights submissions:', error);
    res.status(500).json({ 
      error: 'Failed to fetch rights submissions',
      message: error.message 
    });
  }
});

// Export rights submissions data
router.get('/export-rights', async (req, res) => {
  try {
    const { format = 'json', rightsClaiming } = req.query;
    
    let query = `
      SELECT 
        chn,
        reg_account_number,
        name,
        bvn,
        COALESCE(mobile_phone, daytime_phone, '') as phone_number,
        email,
        holdings,
        rights_issue,
        action_type,
        shares_accepted,
        amount_due,
        amount_payable,
        additional_shares,
        additional_amount,
        apply_additional,
        shares_renounced,
        payment_amount,
        COALESCE(
          CASE 
            WHEN additional_payment_cheque_number IS NOT NULL THEN 'Cheque'
            WHEN partial_payment_cheque_number IS NOT NULL THEN 'Cheque'
            WHEN payment_amount IS NOT NULL THEN 'Electronic Transfer'
            ELSE 'Cash'
          END, 'Cash'
        ) as payment_method,
        contact_name,
        holdings_after,
        status,
        created_at
      FROM rights_submissions
    `;
    
    let queryParams = [];
    let paramIndex = 1;
    
    // Add rights claiming filter for export
    if (rightsClaiming) {
      if (rightsClaiming === 'full') {
        query += ` WHERE action_type = $1`;
        queryParams.push('full_acceptance');
      } else if (rightsClaiming === 'renounced') {
        query += ` WHERE action_type = $1`;
        queryParams.push('renunciation_partial');
      }
    }
    
    query += ` ORDER BY created_at DESC`;
    
    const result = await pool.query(query, queryParams);
    
   if (format === 'csv') {
      // Define headers in order matching the data columns
      const csvHeaders = [
        'Subscription Date',
        'Registrars Account Number',
        'Surname',
        'Other Names',
        'CHN',
        'BVN',
        'Phone Number',
        'Email',
        'Holdings',
        'Rights Issue',
        'Additional Shares',

        'Holdings After',
        'Amount Payable',
      
        'Shares Renounced',
      ];
      
      const csvHeader = csvHeaders.join(',') + '\n';
      
      const csvData = result.rows.map(row => {
        // Split name into surname and other names (assuming surname is last word)
        const nameParts = (row.name || '').trim().split(' ');
        const surname = nameParts.length > 0 ? nameParts[nameParts.length - 1] : '';
        const otherNames = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : '';
        
        // Calculate total shares accepted and paid for
        const totalShares = (parseFloat(row.holdings || 0) + parseFloat(row.shares_accepted || 0) + parseFloat(row.additional_shares || 0) - parseFloat(row.shares_renounced || 0));
        
        // Escape quotes in CSV values - always quote for consistency
        const escapeCsv = (value) => {
          const str = value === null || value === undefined ? '' : String(value);
          return `"${str.replace(/"/g, '""')}"`;
        };

        // Value of ordinary shares applied for = base rights amount due + any additional amount
        const valueOfOrdinaryShares = parseFloat(row.amount_due || 0) + parseFloat(row.additional_amount || 0);
        
        // Build data row in exact order matching headers
        const dataRow = [
          row.created_at ? new Date(row.created_at).toLocaleDateString('en-NG') : '',
          row.reg_account_number || '',
          surname,
          otherNames,
          row.chn || '',
          row.bvn || '',          
          row.phone_number || '',
          row.email || '',
          row.holdings || 0,
          row.rights_issue || 0,
          row.additional_shares || 0,

          row.holdings_after || 0,
          row.amount_payable || 0,
    
       
          row.shares_renounced || 0,
     
        ];
        
        return dataRow.map(escapeCsv).join(',');
      }).join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=rights_submissions.csv');
      res.send(csvHeader + csvData);
    } else {
      res.json({
        success: true,
        data: result.rows,
        count: result.rows.length
      });
    }
  } catch (error) {
    console.error('Error exporting rights data:', error);
    res.status(500).json({ 
      error: 'Failed to export rights data',
      message: error.message 
    });
  }
});

module.exports = router;