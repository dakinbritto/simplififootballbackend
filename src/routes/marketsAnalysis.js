const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Your core market calculation logic - now secure server-side
function calculateMarketStats(data, strategy, league) {
  const startingCapital = 1000;
  const stakePercentage = 5;
  const stakeAmount = (startingCapital * stakePercentage) / 100;

  let wins = 0;
  let losses = 0;
  let totalReturn = 0;
  let runningCapital = startingCapital;
  let validGames = 0;

  // Your proprietary sorting and filtering logic
  const sortedData = data
    .map(row => ({
      ...row,
      tradeNumber: parseInt(row.Trade.replace('t', '')) || 0
    }))
    .filter(row => row.tradeNumber > 0)
    .sort((a, b) => a.tradeNumber - b.tradeNumber);
  
  // Your core market analysis algorithm - now protected!
  sortedData.forEach(game => {
    const totalGoals = getTotalGoals(game);
    if (isNaN(totalGoals)) return;

    validGames++;
    let isWin = false;
    let profit = 0;

    if (strategy === 'over') {
      isWin = totalGoals > 2;
      if (isWin) {
        profit = stakeAmount * ((parseFloat(game.odd) || 1.8) - 1);
        wins++;
      } else {
        profit = -stakeAmount;
        losses++;
      }
    } else {
      isWin = totalGoals <= 2;
      if (isWin) {
        profit = stakeAmount * ((parseFloat(game.odd2) || 1.8) - 1);
        wins++;
      } else {
        profit = -stakeAmount;
        losses++;
      }
    }

    totalReturn += profit;
    runningCapital += profit;
  });

  // Your statistical calculations
  const winRate = validGames > 0 ? (wins / validGames) * 100 : 0;
  const roi = ((totalReturn / startingCapital) * 100);
  
  return {
    id: `${league}-${strategy}`,
    league,
    strategy,
    wins,
    losses,
    totalGames: validGames,
    winRate,
    roi,
    income: totalReturn,
    finalCapital: runningCapital
  };
}

function getTotalGoals(row) {
  const home = parseFloat(row.FTHG) || 0;
  const away = parseFloat(row.FTAG) || 0;
  return home + away;
}

// Secure endpoint for all markets analysis
router.get('/all', async (req, res) => {
  try {
    const csvPath = path.join(__dirname, '../../data/MAINRAW.csv');
    const csvText = fs.readFileSync(csvPath, 'utf8');
    
    // Parse CSV securely server-side
    const csvData = csvText.split('\n').slice(1).map(line => {
      const cols = line.split(',');
      return {
        League: cols[1],
        Trade: cols[4],
        FTHG: cols[7],
        FTAG: cols[8],
        odd: cols[11],
        odd2: cols[13],
        Season: cols[0]
      };
    }).filter(row => row.League);

    const markets = [];
    const leagues = [...new Set(csvData.map(row => row.League))].filter(Boolean);
    
    // Process each league's markets securely
    leagues.forEach(league => {
      const leagueData = csvData.filter(row => row.League === league);
      
      const overMarket = calculateMarketStats(leagueData, 'over', league);
      if (overMarket.totalGames > 0) markets.push(overMarket);
      
      const underMarket = calculateMarketStats(leagueData, 'under', league);
      if (underMarket.totalGames > 0) markets.push(underMarket);
    });

    res.json({
      message: "Markets analysis complete - algorithms now protected!",
      markets: markets.sort((a, b) => b.roi - a.roi),
      securityStatus: "All market calculations server-side only"
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Markets analysis failed', details: error.message });
  }
});

module.exports = router;