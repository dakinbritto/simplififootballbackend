const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Helper function to parse CSV data
function parseCSVData() {
  try {
    const csvPath = path.join(__dirname, '../../data/MAINRAW.csv');
    const csvText = fs.readFileSync(csvPath, 'utf8');
    
    // Simple CSV parser (you can replace with a library if needed)
    const lines = csvText.split('\n');
    const headers = lines[0].split(',');
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        const values = lines[i].split(',');
        const row = {};
        headers.forEach((header, index) => {
          const value = values[index] ? values[index].trim() : '';
          // Try to convert to number if it looks like a number
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

// Helper function to get total goals (SECURE SERVER-SIDE)
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
  for (const k of homeKeys) { if (k in row) { h = toNum(row[k]); break; } }
  for (const k of awayKeys) { if (k in row) { a = toNum(row[k]); break; } }
  if (!isNaN(h) && !isNaN(a)) return h + a;
  return NaN;
}

// SECURE: Calculate team popularity metrics (PROTECTED ALGORITHM)
function calculateTeamPopularity(csvData, seasonFilter = 'all') {
  const teamPopularity = {};
  
  // Apply season filtering
  let filteredData = csvData;
  if (seasonFilter !== 'all') {
    const allSeasons = [...new Set(csvData.map(row => row.Season))].filter(Boolean);
    const sortedSeasons = allSeasons.sort();
    const startIndex = sortedSeasons.indexOf(seasonFilter);
    const seasonsToInclude = startIndex >= 0 ? sortedSeasons.slice(startIndex) : [];
    filteredData = csvData.filter(row => seasonsToInclude.includes(row.Season));
  }
  
  const leagues = [...new Set(filteredData.map(row => row.League))].filter(Boolean);
  
  leagues.forEach(league => {
    teamPopularity[league] = {};
    const leagueData = filteredData.filter(row => row.League === league);
    const teams = [...new Set([
      ...leagueData.map(row => row.HomeTeam),
      ...leagueData.map(row => row.AwayTeam)
    ])].filter(Boolean);

    teams.forEach(team => {
      const teamMatches = leagueData.filter(row => row.HomeTeam === team || row.AwayTeam === team);
      if (teamMatches.length > 0) {
        const validMatches = teamMatches.filter(match => !isNaN(getTotalGoals(match)));
        const over25Count = validMatches.filter(match => getTotalGoals(match) > 2).length;
        const under25Count = validMatches.filter(match => getTotalGoals(match) <= 2).length;
        const under6Count = validMatches.filter(match => getTotalGoals(match) < 6).length;

        teamPopularity[league][team] = {
          over25Percentage: validMatches.length > 0 ? (over25Count / validMatches.length) * 100 : 0,
          under25Percentage: validMatches.length > 0 ? (under25Count / validMatches.length) * 100 : 0,
          under6Percentage: validMatches.length > 0 ? (under6Count / validMatches.length) * 100 : 0,
          totalMatches: teamMatches.length,
          validMatches: validMatches.length,
          over25Count,
          under25Count,
          under6Count
        };
      }
    });
  });
  
  return teamPopularity;
}

// SECURE: Process investment data (PROTECTED ALGORITHM)
function processInvestmentData(data, startingCapital, stakePercentage, market) {
  const stakeAmount = (startingCapital * stakePercentage) / 100;
  let runningCapital = startingCapital;

  // Handle Under 6 Goals market with grouping logic
  if (market === 'under6') {
    const groupedTrades = [];

    // Group fixtures into sets of 3
    for (let i = 0; i < data.length; i += 3) {
      const group = data.slice(i, i + 3);
      
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
        if (isWin && odds > 0) {
          profit = stakeAmount * (odds - 1);
        } else {
          profit = -stakeAmount;
        }

        runningCapital = runningCapital + profit;

        // Create trade entry for the 3-game group
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

  // Handle other markets (over2.5, under2.5) with individual game logic
  return data.map((game, index) => {
    let outcome = 'loss';
    let odds = 0;

    // PROTECTED: Core betting logic
    if (market === 'over2.5') {
      outcome = (game['over2.5goals'] === 0 || game['over2.5goals'] === '0') ? 'win' : 'loss';
      odds = parseFloat(game.odd) || 0;
    } else if (market === 'under2.5') {
      outcome = (game['Under2.5'] === 1 || game['Under2.5'] === '1') ? 'win' : 'loss';
      odds = parseFloat(game.odd2) || 0;
    }

    const isWin = outcome === 'win';
    let profit = 0;
    if (isWin && odds > 0) {
      profit = stakeAmount * (odds - 1);
    } else {
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
      marketType: market,
      oddsUsed: odds
    };
  });
}

// SECURE: Calculate statistics (PROTECTED ALGORITHM)
function calculateStats(data, startingCapital) {
  if (!data.length) {
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

  const totalGames = data.length;
  const finalCapital = data[data.length - 1].capitalMovement;
  const totalReturn = finalCapital - startingCapital;
  const wins = data.filter(g => g.isWin).length;
  const winRate = (wins / totalGames) * 100;
  const maxCapital = Math.max(...data.map(g => g.capitalMovement));
  const minCapital = Math.min(...data.map(g => g.capitalMovement));
  const roi = ((totalReturn / startingCapital) * 100);

  return { totalGames, finalCapital, totalReturn, winRate, maxCapital, minCapital, roi };
}

// API ENDPOINTS

// Get team popularity data (SECURE)
router.get('/teams', (req, res) => {
  try {
    const csvData = parseCSVData();
    const seasonFilter = req.query.season || 'all';
    const teamPopularity = calculateTeamPopularity(csvData, seasonFilter);
    
    res.json({
      success: true,
      teamPopularity,
      totalTeams: Object.values(teamPopularity).reduce((sum, league) => sum + Object.keys(league).length, 0)
    });
  } catch (error) {
    console.error('Error in /teams endpoint:', error);
    res.status(500).json({ success: false, error: 'Failed to calculate team data' });
  }
});

// Get available seasons (SECURE)
router.get('/seasons', (req, res) => {
  try {
    const csvData = parseCSVData();
    const seasons = [...new Set(csvData.map(row => row.Season))].filter(Boolean).sort();
    
    res.json({
      success: true,
      seasons
    });
  } catch (error) {
    console.error('Error in /seasons endpoint:', error);
    res.status(500).json({ success: false, error: 'Failed to get seasons' });
  }
});

// Run backtest (SECURE)
router.post('/run', (req, res) => {
  try {
    const { selectedTeams, market, seasonFilter, startingCapital = 1000, stakePercentage = 5 } = req.body;
    
    if (!selectedTeams || selectedTeams.length === 0) {
      return res.status(400).json({ success: false, error: 'No teams selected' });
    }
    
    const csvData = parseCSVData();
    
    // Apply season filtering first
    let seasonFilteredData = csvData;
    if (seasonFilter !== 'all') {
      const allSeasons = [...new Set(csvData.map(row => row.Season))].filter(Boolean);
      const sortedSeasons = allSeasons.sort();
      const startIndex = sortedSeasons.indexOf(seasonFilter);
      const seasonsToInclude = startIndex >= 0 ? sortedSeasons.slice(startIndex) : [];
      seasonFilteredData = csvData.filter(row => seasonsToInclude.includes(row.Season));
    }

    // Filter by selected teams
    const selectedTeamSet = new Set(selectedTeams);
    let filteredData = seasonFilteredData.filter(row => {
      const homeTeamKey = `${row.League}:${row.HomeTeam}`;
      const awayTeamKey = `${row.League}:${row.AwayTeam}`;
      return selectedTeamSet.has(homeTeamKey) || selectedTeamSet.has(awayTeamKey);
    });

    filteredData = filteredData
      .map(row => ({ ...row, tradeNumber: parseInt(String(row.Trade || '').replace('t', '')) || 0 }))
      .filter(row => row.tradeNumber > 0)
      .sort((a, b) => a.tradeNumber - b.tradeNumber);

    // SECURE: Process investment data with protected algorithms
    const processedData = processInvestmentData(filteredData, startingCapital, stakePercentage, market);
    const stats = calculateStats(processedData, startingCapital);
    
    res.json({
      success: true,
      processedData,
      stats,
      totalGames: processedData.length,
      selectedTeamsCount: selectedTeams.length
    });
    
  } catch (error) {
    console.error('Error in /run endpoint:', error);
    res.status(500).json({ success: false, error: 'Backtest calculation failed' });
  }
});

module.exports = router;
