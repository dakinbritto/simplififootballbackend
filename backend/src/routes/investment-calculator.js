// SECURE: Main investment processing (replaces processData() + calculateStats())
router.post('/calculate', (req, res) => {
  try {
    const { 
      startingCapital, 
      stakePercentage, 
      selectedSeason, 
      selectedLeague, 
      selectedMarket,
      t9TeamsActive 
    } = req.body;

    const csvData = parseCSVData(); // Server-side CSV parsing
    
    // PROTECTED: Filter and process data
    let filteredData = filterDataByParams(csvData, selectedSeason, selectedLeague);
    
    // PROTECTED: Apply T9 teams filter
    if (t9TeamsActive && t9Teams[selectedLeague]) {
      filteredData = applyT9Filter(filteredData, selectedLeague);
    }

    // PROTECTED: Handle Under 6 Goals special logic
    if (selectedMarket === 'under6') {
      processedData = processUnder6Market(filteredData, startingCapital, stakePercentage);
    } else {
      processedData = processStandardMarket(filteredData, startingCapital, stakePercentage, selectedMarket);
    }

    // PROTECTED: Calculate statistics
    const stats = calculateInvestmentStats(processedData, startingCapital);
    
    res.json({
      success: true,
      processedData,
      stats,
      chartData: processedData.map(d => ({ x: d.gameNumber, y: d.capitalMovement }))
    });

  } catch (error) {
    res.status(500).json({ success: false, error: 'Calculation failed' });
  }
});
