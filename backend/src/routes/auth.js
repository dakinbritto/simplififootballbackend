const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const router = express.Router();

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Create SQLite database
const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

// Initialize database table
function initializeDatabase() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        subscription_status TEXT DEFAULT 'free',
        stripe_customer_id TEXT,
        query_count INTEGER DEFAULT 0,
        last_query_reset DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('SQLite database initialized');
  });
}

// Initialize on startup
initializeDatabase();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    db.get('SELECT id FROM users WHERE email = ?', [email], async (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ success: false, error: 'Database error' });
      }

      if (row) {
        return res.status(400).json({ success: false, error: 'User already exists' });
      }

      // Hash password
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Create user
      db.run(
        'INSERT INTO users (email, password_hash, subscription_status) VALUES (?, ?, ?)',
        [email, passwordHash, 'free'],
        function(err) {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, error: 'Registration failed' });
          }

          const userId = this.lastID;

          // Generate JWT token
          const token = jwt.sign(
            { 
              userId: userId, 
              email: email,
              subscriptionStatus: 'free' 
            },
            JWT_SECRET,
            { expiresIn: '7d' }
          );

          res.json({
            success: true,
            token,
            user: {
              id: userId,
              email: email,
              subscriptionStatus: 'free'
            }
          });
        }
      );
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

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    // Find user
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ success: false, error: 'Database error' });
      }

      if (!user) {
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
      }

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
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// Get user profile
router.get('/profile', authenticateToken, (req, res) => {
  db.get('SELECT * FROM users WHERE id = ?', [req.user.userId], (err, user) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ success: false, error: 'Database error' });
    }

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

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
  });
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
function requireSubscription(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Invalid or expired token' });
    }

    req.user = decoded;

    // Get fresh user data from database
    db.get('SELECT * FROM users WHERE id = ?', [decoded.userId], (err, user) => {
      if (err || !user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      // Check if free user has exceeded query limit
      if (user.subscription_status === 'free') {
        const today = new Date().toDateString();
        const lastReset = new Date(user.last_query_reset).toDateString();
        
        if (today !== lastReset) {
          // Reset query count for new day
          db.run(
            'UPDATE users SET query_count = 0, last_query_reset = CURRENT_TIMESTAMP WHERE id = ?',
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
        db.run('UPDATE users SET query_count = query_count + 1 WHERE id = ?', [user.id]);
      }

      next();
    });
  });
}

module.exports = router;
module.exports.authenticateToken = authenticateToken;
module.exports.requireSubscription = requireSubscription;
