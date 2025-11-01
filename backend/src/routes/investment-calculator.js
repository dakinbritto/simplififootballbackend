const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// T9 Teams data (PROTECTED)
const t9Teams = {
  EPL: ['Everton', 'Aston Villa', 'Man United', 'Crystal Palace', 'Sunderland'],
  German1: ['Bayern Munich', 'Stuttgart', 'Dortmund', 'Mgladbach', 'Leverkusen', 'Hoffenheim', 'Werder Bremen', 'RB Leipzig', 'Ein Frankfurt', 'Freiburg', 'Wolfsburg'],
  Scottish: ['Celtic', 'Rangers', 'Hibernian', 'Motherwell'],
  laliga: ['Sociedad', 'Ath Bilbao', 'Osasuna', 'Vallecano', 'Mallorca', 'Getafe', 'Alaves'],
  Championship: ['QPR', 'Millwall', 'West Brom', 'Coventry', 'Cardiff', 'Preston', 'Stoke', 'Hull','Sheffield United'],
  SeriaB: ['Juve Stabia', 'Cremonese', 'Reggiana', 'Frosinone', 'Pisa', 'Spezia']
};

// PROTECTED: Helper function to parse CSV data
function parseCSVData() {
  try {
    const csvPath = path.join(__dirname, '../../data/MAINRAW.csv');
    const csvText = fs.readFileSync(csvPath, 'utf8');
    
    const lines = csvText.split('\n');
    const headers = lines[0].split(',');
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        const values = lines[i].split(',');
        const row = {};
        headers.forEach((header, index) => {
          const value = values[index] ? values[index].trim() : '';
          if (value && !isNaN(value) && value !== '') {
            row[header.trim()] = Number(value);
          } else {
            row[header.trim()] = value;
          }
        });
        data.push(row);
      }
    }
    
    return data;
  } catch (error) {
    console.error('Error parsing CSV:', error);
    return [];
  }
}

// PROTECTED: Helper function to get total goals (SECURE SERVER-SIDE)
function getTotalGoals(row) {
  const toNum = (v) => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      return isNaN(n) ? NaN : n;
    }
    return NaN;
  };

  const homeKeys = ['FTHG', 'HomeGoals', 'HG', 'home_goals', 'FHG', 'HomeG'];
  const awayKeys = ['FTAG', 'AwayGoals', 'AG', 'away_goals', 'FAG', 'AwayG'];

  let h = NaN, a = NaN;
  for (const k of homeKeys) {
    if (k in row) { h = toNum(row[k]); break; }
  }
  for (const k of awayKeys) {
    if (k in row) { a = toNum(row[k]); break; }
  }
  if (!isNaN(h) && !isNaN(a)) return h + a;

  const scoreKeys = ['FTScore', 'Score', 'FullTimeScore', 'Result'];
  for (const k of scoreKeys) {
    const v = row[k];
    if (typeof v === 'string') {
      const m = v.match(/(\d+)\s*[-:]\s*(\d+)/);
      if (m) return Number(m[1]) + Number(m[2]);
    }
  }

  if (typeof row['Goals'] === 'number') return row['Goals'];
  if (typeof row['totalgoals'] === 'number') return row['totalgoals'];

  return NaN;
}

// PROTECTED: Process Under 6 Goals market with grouping logic (SECURE ALGORITHM)
function processUnder6Market(filteredData, startingCapital, stakePercentage) {
  const stakeAmount = (startingCapital * stakePercentage) / 100;
  let runningCapital = startingCapital;
  const groupedTrades = [];

  // Group fixtures into sets of 3
  for (let i = 0; i < filteredData.length; i += 3) {
    const group = filteredData.slice(i, i + 3);
    
    // Only process complete groups of 3
    if (group.length === 3) {
      // Check if all 3 fixtures are under 6 goals
      let allUnder6 = true;
      for (const game of group) {
        const totalGoals = getTotalGoals(game);
        if (isNaN(totalGoals) || totalGoals >= 6) {
          allUnder6 = false;
          break;
        }
      }

      // Use first fixture to represent the trade
      const representativeGame = group[0];
      const odds = parseFloat(representativeGame.odd3) || 0;
      const isWin = allUnder6;
      
      let profit = 0;
      if (isWin) {
        profit = stakeAmount * (odds - 1);
      } else {
        profit = -stakeAmount;
      }

      runningCapital = runningCapital + profit;

      // Create new trade with t1, t2, t3... numbering
      const tradeEntry = {
        ...representativeGame,
        Trade: `t${groupedTrades.length + 1}`,
        stake: stakeAmount,
        isWin,
        outcome: isWin ? 'win' : 'loss',
        profit,
        capitalMovement: runningCapital,
        gameNumber: groupedTrades.length + 1,
        marketType: 'under6',
        oddsUsed: odds
      };

      groupedTrades.push(tradeEntry);
    }
  }

  return groupedTrades;
}

// PROTECTED: Process standard markets (SECURE ALGORITHM)
function processStandardMarket(filteredData, startingCapital, stakePercentage, selectedMarket) {
  const stakeAmount = (startingCapital * stakePercentage) / 100;
  let runningCapital = startingCapital;

  return filteredData.map((game, index) => {
    const totalGoals = getTotalGoals(game);

    // Market-specific logic
    let outcome = 'loss';
    let odds = 0;
    
    if (!isNaN(totalGoals)) {
      if (selectedMarket === 'over2.5') {
        // Over 2.5 Goals: win if totalGoals > 2, loss if totalGoals <= 2
        outcome = totalGoals > 2 ? 'win' : 'loss';
        odds = parseFloat(game.odd) || 0;
      } else if (selectedMarket === 'under2.5') {
        // Under 2.5 Goals: win if totalGoals <= 2, loss if totalGoals > 2
        outcome = totalGoals <= 2 ? 'win' : 'loss';
        odds = parseFloat(game.odd2) || 0;
      }
    }

    const isWin = outcome === 'win';
    let profit = 0;
    if (outcome === 'win') {
      profit = stakeAmount * (odds - 1);
    } else if (outcome === 'loss') {
      profit = -stakeAmount;
    }

    runningCapital = runningCapital + profit;

    return {
      ...game,
      stake: stakeAmount,
      isWin,
      outcome,
      profit,
      capitalMovement: runningCapital,
      gameNumber: index + 1,
      marketType: selectedMarket,
      oddsUsed: odds
    };
  });
}

// PROTECTED: Calculate investment statistics (SECURE ALGORITHM)
function calculateInvestmentStats(processedData, startingCapital) {
  if (!processedData.length) {
    return {
      totalGames: 0,
      finalCapital: startingCapital,
      totalReturn: 0,
      winRate: 0,
      maxCapital: startingCapital,
      minCapital: startingCapital,
      roi: 0
    };
  }

  const totalGames = processedData.length;
  const finalCapital = processedData[processedData.length - 1].capitalMovement;
  const totalReturn = finalCapital - startingCapital;
  const wins = processedData.filter(g => g.isWin).length;
  const winRate = (wins / totalGames) * 100;
  const maxCapital = Math.max(...processedData.map(g => g.capitalMovement));
  const minCapital = Math.min(...processedData.map(g => g.capitalMovement));
  const roi = ((totalReturn / startingCapital) * 100);

  return {
    totalGames,
    finalCapital,
    totalReturn,
    winRate,
    maxCapital,
    minCapital,
    roi
  };
}

// PROTECTED: Filter data by parameters (SECURE ALGORITHM)
function filterDataByParams(csvData, selectedSeason, selectedLeague) {
  let filteredData;

  if (selectedSeason === 'Max') {
    filteredData = csvData.filter(row => row.League === selectedLeague);
  } else {
    filteredData = csvData.filter(row => row.League === selectedLeague && row.Season === selectedSeason);
  }

  // Sort by trade number
  filteredData = filteredData
    .map(row => ({
      ...row,
      tradeNumber: parseInt(row.Trade.replace('t', '')) || 0
    }))
    .filter(row => row.tradeNumber > 0)
    .sort((a, b) => a.tradeNumber - b.tradeNumber);

  return filteredData;
}

// PROTECTED: Apply T9 teams filter (SECURE ALGORITHM)
function applyT9Filter(filteredData, selectedLeague) {
  if (t9Teams[selectedLeague]) {
    const leagueT9Teams = t9Teams[selectedLeague];
    return filteredData.filter(game =>
      leagueT9Teams.includes(game.HomeTeam) || leagueT9Teams.includes(game.AwayTeam)
    );
  }
  return filteredData;
}

// PROTECTED: Compute market ranking (SECURE ALGORITHM)
function computeMarketRanking(csvData, selectedLeague, selectedSeason, selectedMarket, t9TeamsActive) {
  const limitToT9 = t9TeamsActive && t9Teams[selectedLeague];
  const allowed = limitToT9 ? new Set(t9Teams[selectedLeague]) : null;

  const counts = new Map();
  for (const row of (csvData || [])) {
    if (!row) continue;
    if (row.League !== selectedLeague) continue;
    if (selectedSeason !== 'Max' && row.Season !== selectedSeason) continue;
    if (allowed && !(allowed.has(row.HomeTeam) || allowed.has(row.AwayTeam))) continue;

    const total = getTotalGoals(row);
    if (isNaN(total)) continue;

    let success = false;
    if (selectedMarket === 'over2.5') {
      success = total > 2;
    } else if (selectedMarket === 'under2.5') {
      success = total <= 2;
    } else if (selectedMarket === 'under6') {
      success = total < 6;
    }
    
    if (!success) continue;

    // Count for both teams involved in the successful market outcome
    const teams = [row.HomeTeam, row.AwayTeam].filter(Boolean);
    for (const t of teams) {
      if (limitToT9 && !allowed.has(t)) continue;
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }

  // Sort descending by count
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 30);
  return {
    labels: top.map(([t]) => t),
    values: top.map(([, c]) => c)
  };
}

// PROTECTED: Compute opposite market ranking (SECURE ALGORITHM)
function computeOppositeMarketRanking(csvData, selectedLeague, selectedSeason, selectedMarket, t9TeamsActive) {
  const limitToT9 = t9TeamsActive && t9Teams[selectedLeague];
  const allowed = limitToT9 ? new Set(t9Teams[selectedLeague]) : null;

  // Determine opposite market logic
  let isOppositeOver = false;
  if (selectedMarket === 'under2.5') {
    isOppositeOver = true; // Opposite of under2.5 is over2.5
  } else if (selectedMarket === 'over2.5') {
    isOppositeOver = false; // Opposite of over2.5 is under2.5
  } else if (selectedMarket === 'under6') {
    isOppositeOver = true; // Default opposite for under6 is over2.5
  }

  const counts = new Map();

  for (const row of (csvData || [])) {
    if (!row) continue;
    if (row.League !== selectedLeague) continue;
    if (selectedSeason !== 'Max' && row.Season !== selectedSeason) continue;
    if (allowed && !(allowed.has(row.HomeTeam) || allowed.has(row.AwayTeam))) continue;

    const total = getTotalGoals(row);
    if (isNaN(total)) continue;

    const success = isOppositeOver ? total > 2 : total <= 2;
    if (!success) continue;

    const teams = [row.HomeTeam, row.AwayTeam].filter(Boolean);
    for (const t of teams) {
      if (limitToT9 && !allowed.has(t)) continue;
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 30);
  return {
    labels: top.map(([t]) => t),
    values: top.map(([, c]) => c)
  };
}

// API ENDPOINTS

// Main calculation endpoint (SECURE)
router.post('/calculate', (req, res) => {
  try {
    const {
      startingCapital = 1000,
      stakePercentage = 5,
      selectedSeason = 'Max',
      selectedLeague,
      selectedMarket = 'over2.5',
      t9TeamsActive = false
    } = req.body;

    if (!selectedLeague) {
      return res.status(400).json({ success: false, error: 'League is required' });
    }

    const csvData = parseCSVData();
    
    // Filter data by parameters
    let filteredData = filterDataByParams(csvData, selectedSeason, selectedLeague);
    
    // Apply T9 teams filter if active
    if (t9TeamsActive) {
      filteredData = applyT9Filter(filteredData, selectedLeague);
    }

    // Process data based on market type
    let processedData;
    if (selectedMarket === 'under6') {
      processedData = processUnder6Market(filteredData, startingCapital, stakePercentage);
    } else {
      processedData = processStandardMarket(filteredData, startingCapital, stakePercentage, selectedMarket);
    }

    // Calculate statistics
    const stats = calculateInvestmentStats(processedData, startingCapital);
    
    // Create chart data
    const chartData = processedData.map(d => ({
      x: d.gameNumber,
      y: d.capitalMovement
    }));

    res.json({
      success: true,
      processedData,
      stats,
      chartData,
      totalGames: processedData.length
    });

  } catch (error) {
    console.error('Error in /calculate endpoint:', error);
    res.status(500).json({ success: false, error: 'Calculation failed' });
  }
});

// Team ranking endpoint (SECURE)
router.post('/teams-ranking', (req, res) => {
  try {
    const {
      selectedLeague,
      selectedSeason = 'Max',
      selectedMarket = 'over2.5',
      t9TeamsActive = false
    } = req.body;

    if (!selectedLeague) {
      return res.status(400).json({ success: false, error: 'League is required' });
    }

    const csvData = parseCSVData();
    
    // Calculate rankings for both markets
    const selectedMarketRanking = computeMarketRanking(
      csvData, selectedLeague, selectedSeason, selectedMarket, t9TeamsActive
    );
    
    const oppositeMarketRanking = computeOppositeMarketRanking(
      csvData, selectedLeague, selectedSeason, selectedMarket, t9TeamsActive  
    );

    res.json({
      success: true,
      selectedMarketRanking,
      oppositeMarketRanking
    });

  } catch (error) {
    console.error('Error in /teams-ranking endpoint:', error);
    res.status(500).json({ success: false, error: 'Ranking calculation failed' });
  }
});

// Get available filters (SECURE)
router.get('/filters', (req, res) => {
  try {
    const csvData = parseCSVData();
    
    const seasons = [...new Set(csvData.map(row => row.Season))].filter(Boolean).sort();
    const leagues = [...new Set(csvData.map(row => row.League))].filter(Boolean).sort();
    
    res.json({
      success: true,
      seasons,
      leagues,
      t9Teams
    });

  } catch (error) {
    console.error('Error in /filters endpoint:', error);
    res.status(500).json({ success: false, error: 'Failed to load filters' });
  }
});

module.exports = router;
