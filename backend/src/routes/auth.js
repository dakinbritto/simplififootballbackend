const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const router = express.Router();

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Database connection
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database table
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        subscription_status VARCHAR(50) DEFAULT 'free',
        stripe_customer_id VARCHAR(255),
        query_count INTEGER DEFAULT 0,
        last_query_reset TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Database table initialized');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// Initialize on startup
initializeDatabase();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'User already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, subscription_status) VALUES ($1, $2, $3) RETURNING id, email, subscription_status, created_at',
      [email, passwordHash, 'free']
    );

    const newUser = result.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: newUser.id, 
        email: newUser.email,
        subscriptionStatus: newUser.subscription_status 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        subscriptionStatus: newUser.subscription_status
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    // Find user
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        subscriptionStatus: user.subscription_status 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        subscriptionStatus: user.subscription_status,
        queryCount: user.query_count
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        subscriptionStatus: user.subscription_status,
        queryCount: user.query_count,
        createdAt: user.created_at
      }
    });

  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to get profile' });
  }
});

// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Middleware to check subscription status
async function requireSubscription(req, res, next) {
  try {
    // First authenticate
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ success: false, error: 'Access token required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    // Get fresh user data from database
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = result.rows[0];

    // Check if free user has exceeded query limit
    if (user.subscription_status === 'free') {
      // Reset query count if it's a new day
      const today = new Date().toDateString();
      const lastReset = new Date(user.last_query_reset).toDateString();
      
      if (today !== lastReset) {
        await pool.query(
          'UPDATE users SET query_count = 0, last_query_reset = CURRENT_TIMESTAMP WHERE id = $1',
          [user.id]
        );
        user.query_count = 0;
      }

      // Check free tier limit (5 queries per day)
      if (user.query_count >= 5) {
        return res.status(403).json({ 
          success: false, 
          error: 'Free tier limit reached. Upgrade to Pro for unlimited access.',
          upgradeRequired: true
        });
      }

      // Increment query count
      await pool.query(
        'UPDATE users SET query_count = query_count + 1 WHERE id = $1',
        [user.id]
      );
    }

    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    return res.status(403).json({ success: false, error: 'Invalid or expired token' });
  }
}

// Export middleware functions
module.exports = router;
module.exports.authenticateToken = authenticateToken;
module.exports.requireSubscription = requireSubscription;
