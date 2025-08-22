const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Search shareholders by name
// In your backend route




router.get('/search', async (req, res) => {
  try {
    const { name, page = 1, limit = 10 } = req.query;
    
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ 
        error: 'Name must be at least 2 characters!' 
      });
    }

    const offset = (page - 1) * limit;
    const searchTerms = name.trim().split(/\s+/); // Split into words

    // Build a flexible WHERE clause (matches any order of names)
    const whereClause = searchTerms
      .map(term => `LOWER(name) LIKE LOWER('%${term}%')`)
      .join(' AND ');

    // Count total matches
    const countQuery = `
      SELECT COUNT(*) 
      FROM shareholders 
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery);
    const total = parseInt(countResult.rows[0].count);

    // Fetch paginated results IN RANDOM ORDER
    const query = `
      SELECT 
        id,
        reg_account_number,
        name,
        holdings,
        rights_issue,
        holdings_after,
        amount_due
      FROM shareholders 
      WHERE ${whereClause}
      ORDER BY RANDOM()  -- This makes results shuffle each time!
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, [limit, offset]);
    
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      error: 'Search failed!',
      message: error.message 
    });
  } 
});
// Get shareholder by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate that ID is a positive integer
    if (!/^\d+$/.test(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid shareholder ID. Must be a positive integer.'
      });
    }
    
    const query = `
      SELECT 
        id,
        reg_account_number,
        name,
        holdings,
        rights_issue,
        holdings_after,
        amount_due,
        created_at
      FROM shareholders 
      WHERE id = $1
    `;

    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Shareholder not found' 
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error getting shareholder:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get shareholder',
      message: error.message 
    });
  }
});

// Get shareholder by registration account number
router.get('/reg/:regNumber', async (req, res) => {
  try {
    const { regNumber } = req.params;
    
    const query = `
      SELECT 
        id,
        reg_account_number,
        name,
        holdings,
        rights_issue,
        holdings_after,
        amount_due,
        created_at
      FROM shareholders 
      WHERE reg_account_number = $1
    `;

    const result = await pool.query(query, [regNumber]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Shareholder not found' 
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error getting shareholder by reg number:', error);
    res.status(500).json({ 
      error: 'Failed to get shareholder',
      message: error.message 
    });
  }
});

// Get a single shareholder by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT 
        id,
        reg_account_number,
        name,
        holdings,
        rights_issue,
        holdings_after,
        amount_due,
        created_at
      FROM shareholders
      WHERE id = $1
    `;
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Shareholder not found' 
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error getting shareholder:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get shareholder',
      message: error.message 
    });
  }
});

// Get all shareholders (for admin use)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        id,
        reg_account_number,
        name,
        holdings,
        rights_issue,
        holdings_after,
        amount_due,
        created_at
      FROM shareholders
    `;
    
    let countQuery = 'SELECT COUNT(*) FROM shareholders';
    let queryParams = [];
    
    if (search) {
      query += ' WHERE LOWER(name) LIKE LOWER($1) OR reg_account_number LIKE $1';
      countQuery += ' WHERE LOWER(name) LIKE LOWER($1) OR reg_account_number LIKE $1';
      queryParams.push(`%${search}%`);
    }
    
    query += ' ORDER BY name ASC LIMIT $' + (queryParams.length + 1) + ' OFFSET $' + (queryParams.length + 2);
    queryParams.push(limit, offset);
    
    const [result, countResult] = await Promise.all([
      pool.query(query, queryParams),
      pool.query(countQuery, search ? [`%${search}%`] : [])
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
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error getting shareholders:', error);
    res.status(500).json({ 
      error: 'Failed to get shareholders',
      message: error.message 
    });
  }
});

module.exports = router; 