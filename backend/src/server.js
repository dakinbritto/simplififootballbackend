const express = require("express");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Import and use secure routes (corrected paths)
const marketRoutes = require('./src/routes/markets');
const marketsAnalysisRoutes = require('./src/routes/marketsAnalysis');
const backtestingRoutes = require('./src/routes/backtesting');
const investmentRoutes = require('./src/routes/investment-calculator');
const authRoutes = require('./src/routes/auth');

app.use('/api/markets', marketRoutes);
app.use('/api/marketsAnalysis', marketsAnalysisRoutes);
app.use('/api/backtesting', backtestingRoutes);
app.use('/api/investment', investmentRoutes);
app.use('/api/auth', authRoutes);

app.get("/", function(req, res) {
  res.json({message: "Simplifi Backend is running!"});
});

// For Vercel deployment
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, function() {
    console.log("Server running on port " + PORT);
  });
}

// Export for Vercel
module.exports = app;
