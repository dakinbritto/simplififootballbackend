// SECURE: Filter data (replaces populateFilters())
router.get('/filters', (req, res) => {
  try {
    const csvData = parseCSVData();
    
    // PROTECTED: Extract unique values
    const seasons = [...new Set(csvData.map(row => row.Season))].filter(Boolean).sort();
    const leagues = [...new Set(csvData.map(row => row.League))].filter(Boolean).sort();
    
    res.json({
      success: true,
      seasons,
      leagues,
      t9Teams // T9 teams configuration
    });

  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load filters' });
  }
});
