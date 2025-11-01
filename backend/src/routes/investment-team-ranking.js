// SECURE: Team ranking calculations (replaces computeSelectedMarketRanking() + computeOppositeMarketRanking())
router.post('/teams-ranking', (req, res) => {
  try {
    const { selectedLeague, selectedSeason, selectedMarket, t9TeamsActive } = req.body;
    
    const csvData = parseCSVData();
    
    // PROTECTED: Calculate rankings for both markets
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
    res.status(500).json({ success: false, error: 'Ranking calculation failed' });
  }
});
