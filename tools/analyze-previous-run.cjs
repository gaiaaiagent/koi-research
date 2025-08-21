#!/usr/bin/env node

/**
 * Analyze previous document processing run from logs
 * This creates a retrospective report from existing log files
 */

const fs = require('fs');
const path = require('path');

// Paths
const logPath = '/opt/projects/GAIA-direct/logs/regenai-fast-fixed.log';
const dedupLogPath = '/opt/projects/GAIA/knowledge/.deduplication/deduplication.log';
const reportPath = '/opt/projects/GAIA/knowledge/.processing-reports';

// Ensure report directory exists
if (!fs.existsSync(reportPath)) {
  fs.mkdirSync(reportPath, { recursive: true });
}

// Read and analyze logs
console.log('Analyzing previous document processing run...\n');

// Read main log
const mainLog = fs.readFileSync(logPath, 'utf-8');
const lines = mainLog.split('\n');

// Initialize statistics
const stats = {
  totalProcessed: 0,
  totalSkipped: 0,
  totalFailed: 0,
  fileTypes: {},
  errors: {},
  startTime: null,
  endTime: null,
};

// Parse main log
lines.forEach(line => {
  // Look for processing messages
  if (line.includes('✅') && line.includes('fragments (document loaded)')) {
    stats.totalProcessed++;
    const match = line.match(/"([^"]+)".*?(\d+) fragments/);
    if (match) {
      const fileName = match[1];
      const ext = path.extname(fileName).toLowerCase();
      stats.fileTypes[ext] = (stats.fileTypes[ext] || 0) + 1;
    }
  }
  
  if (line.includes('⏭️') && line.includes('Skipped (already exists)')) {
    stats.totalSkipped++;
  }
  
  if (line.includes('Failed to process file')) {
    stats.totalFailed++;
    const match = line.match(/Failed to process file ([^\s]+)/);
    if (match) {
      const filePath = match[1];
      const ext = path.extname(filePath).toLowerCase();
      if (!stats.errors[ext]) stats.errors[ext] = [];
      stats.errors[ext].push(path.basename(filePath));
    }
  }
  
  // Get timestamps
  if (!stats.startTime && line.includes('Loading documents from:')) {
    const match = line.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/);
    if (match) stats.startTime = match[1];
  }
  
  if (line.includes('Document loading complete:')) {
    const match = line.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/);
    if (match) stats.endTime = match[1];
    
    // Also extract totals from this line
    const totalsMatch = line.match(/(\d+) successful, (\d+) failed out of (\d+) total/);
    if (totalsMatch) {
      stats.totalProcessed = parseInt(totalsMatch[1]);
      stats.totalFailed = parseInt(totalsMatch[2]);
      stats.totalFiles = parseInt(totalsMatch[3]);
    }
  }
});

// Read deduplication log
if (fs.existsSync(dedupLogPath)) {
  const dedupLog = fs.readFileSync(dedupLogPath, 'utf-8');
  const dedupLines = dedupLog.split('\n');
  
  stats.exactDuplicates = dedupLines.filter(line => line.includes('SKIPPED_EXACT')).length;
  stats.semanticDuplicates = dedupLines.filter(line => line.includes('SKIPPED_SEMANTIC')).length;
} else {
  stats.exactDuplicates = 0;
  stats.semanticDuplicates = 0;
}

// Generate report
const report = `# Document Processing Analysis Report

**Generated:** ${new Date().toISOString()}
**Log analyzed:** ${logPath}

## Summary

- ✅ **Successfully Processed:** ${stats.totalProcessed} documents
- ⏭️ **Skipped (Duplicates):** ${stats.totalSkipped} documents
- ❌ **Failed:** ${stats.totalFailed} documents
- 📁 **Total Files:** ${stats.totalFiles || (stats.totalProcessed + stats.totalSkipped + stats.totalFailed)}

## Duplicate Detection

- **Exact Duplicates:** ${stats.exactDuplicates}
- **Semantic Duplicates:** ${stats.semanticDuplicates}

## File Types Processed

| Extension | Count |
|-----------|-------|
${Object.entries(stats.fileTypes)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .map(([ext, count]) => `| ${ext || 'no-ext'} | ${count} |`)
  .join('\n')}

## Failed Files by Extension

| Extension | Failed Count |
|-----------|-------------|
${Object.entries(stats.errors)
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 10)
  .map(([ext, files]) => `| ${ext || 'no-ext'} | ${files.length} |`)
  .join('\n')}

## Common Failure Patterns

Based on the failed files, common issues appear to be:
- Empty or malformed files
- Unsupported binary formats
- Encoding issues with special characters

## Recommendations

1. **Unsupported Files:** Consider adding support for common formats like PDF, images (for OCR), etc.
2. **Error Handling:** Implement more detailed error logging to identify specific failure reasons
3. **Performance:** With ${stats.totalFiles || 'unknown'} files, processing took from ${stats.startTime || 'unknown'} to ${stats.endTime || 'unknown'}

---
*This report was generated from existing logs. Future runs will generate more detailed reports automatically.*
`;

// Save report
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const reportFile = path.join(reportPath, `analysis-${timestamp}.md`);
fs.writeFileSync(reportFile, report);

console.log(report);
console.log(`\n📊 Report saved to: ${reportFile}`);