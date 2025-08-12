const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Get dashboard statistics
router.get('/dashboard', async (req, res) => {
  try {
    // Get total shareholders count
    const shareholdersCountQuery = 'SELECT COUNT(*) FROM shareholders';
    const shareholdersCount = await pool.query(shareholdersCountQuery);

    // Get forms statistics
    const formsStatsQuery = `
      SELECT 
        COUNT(*) as total_forms,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_forms,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_forms,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_forms
      FROM forms
    `;
    const formsStats = await pool.query(formsStatsQuery);

    const stats = formsStats.rows[0];
    const totalShareholders = parseInt(shareholdersCount.rows[0].count);
    const completionRate = totalShareholders > 0 ? ((stats.completed_forms / totalShareholders) * 100).toFixed(1) : '0.0';

    res.json({
      success: true,
      data: {
        totalShareholders,
        completedForms: parseInt(stats.completed_forms),
        pendingForms: parseInt(stats.pending_forms),
        rejectedForms: parseInt(stats.rejected_forms),
        completionRate: `${completionRate}%`
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
      const csvHeader = 'Reg Account Number,Name,Holdings,Rights Issue,Holdings After,Acceptance Type,Shares Accepted,Shares Renounced,Additional Shares,Amount Payable,Payment Account,Contact Name,Email,Status,Created At\n';
      const csvData = result.rows.map(row => 
        `"${row.reg_account_number}","${row.name}",${row.holdings},${row.rights_issue},${row.holdings_after},"${row.acceptance_type}",${row.shares_accepted || ''},${row.shares_renounced || ''},${row.additional_shares_applied || ''},${row.amount_payable || ''},"${row.payment_account_number || ''}","${row.contact_name}","${row.email}","${row.status}","${row.created_at}"`
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

module.exports = router; 