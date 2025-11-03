const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Simple file-based storage for testing (replace with database in production)
const USERS_FILE = path.join(__dirname, '../data/users.json');

// JWT Secret (use environment variable in production)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Load users from file
function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading users:', error);
  }
  return [];
}

// Save users to file
function saveUsers(users) {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(USERS_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Error saving users:', error);
  }
}

// Initialize users from file
let users = loadUsers();

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
    const existingUser = users.find(user => user.email === email);
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'User already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const newUser = {
      id: Date.now().toString(),
      email,
      passwordHash,
      subscriptionStatus: 'free', // 'free', 'pro', 'cancelled'
      stripeCustomerId: null,
      createdAt: new Date(),
      queryCount: 0, // Track free tier usage
      lastQueryReset: new Date()
    };

    users.push(newUser);
    saveUsers(users); // PERSIST TO FILE

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: newUser.id, 
        email: newUser.email,
        subscriptionStatus: newUser.subscriptionStatus 
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
        subscriptionStatus: newUser.subscriptionStatus
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

    // Reload users from file (in case another instance updated it)
    users = loadUsers();

    // Find user
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        subscriptionStatus: user.subscriptionStatus 
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
        subscriptionStatus: user.subscriptionStatus,
        queryCount: user.queryCount
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// Get user profile
router.get('/profile', authenticateToken, (req, res) => {
  try {
    // Reload users from file
    users = loadUsers();
    
    const user = users.find(u => u.id === req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        subscriptionStatus: user.subscriptionStatus,
        queryCount: user.queryCount,
        createdAt: user.createdAt
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
function requireSubscription(req, res, next) {
  authenticateToken(req, res, (err) => {
    if (err) return;

    // Reload users from file
    users = loadUsers();
    
    const user = users.find(u => u.id === req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Check if free user has exceeded query limit
    if (user.subscriptionStatus === 'free') {
      // Reset query count if it's a new day
      const today = new Date().toDateString();
      const lastReset = new Date(user.lastQueryReset).toDateString();
      
      if (today !== lastReset) {
        user.queryCount = 0;
        user.lastQueryReset = new Date();
        saveUsers(users); // PERSIST CHANGES
      }

      // Check free tier limit (5 queries per day)
      if (user.queryCount >= 5) {
        return res.status(403).json({ 
          success: false, 
          error: 'Free tier limit reached. Upgrade to Pro for unlimited access.',
          upgradeRequired: true
        });
      }

      // Increment query count
      user.queryCount++;
      saveUsers(users); // PERSIST CHANGES
    }

    next();
  });
}

// Export middleware functions
module.exports = router;
module.exports.authenticateToken = authenticateToken;
module.exports.requireSubscription = requireSubscription;
