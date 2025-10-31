const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

function readMarketData() {
  try {
    const csvPath = path.join(__dirname, '../../data/MAINRAW.csv');
    const csvData = fs.readFileSync(csvPath, 'utf8');
    const lines = csvData.split('\n');
    const headers = lines[0].split(',');
    return {
      totalMatches: lines.length - 1,
      headers: headers,
      status: "Data loaded securely server-side"
    };
  } catch (error) {
    throw new Error('Failed to load market data');
  }
}

router.get('/analysis', async (req, res) => {
  try {
    const marketData = readMarketData();
    const analysis = {
      message: "Market analysis complete - algorithms protected!",
      totalMatches: marketData.totalMatches,
      securityStatus: "Server-side calculations only"
    };
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: 'Analysis failed', details: error.message });
  }
});

module.exports = router;