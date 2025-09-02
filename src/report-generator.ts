import { logger } from '@elizaos/core';
import * as fs from 'fs';
import * as path from 'path';

export interface ProcessingStats {
  startTime: Date;
  endTime?: Date;
  duration?: number;
  totalFiles: number;
  successful: number;
  failed: number;
  skipped: number;
  exactDuplicates: number;
  semanticDuplicates: number;
}

export interface FileTypeStats {
  [extension: string]: {
    processed: number;
    failed: number;
    skipped: number;
  };
}

export interface ErrorStats {
  [errorType: string]: {
    count: number;
    files: string[];
  };
}

export interface ProcessingReport {
  timestamp: string;
  stats: ProcessingStats;
  fileTypes: FileTypeStats;
  errors: ErrorStats;
  duplicates: {
    exact: string[];
    semantic: Array<{
      file1: string;
      file2: string;
      similarity: number;
    }>;
  };
  failedFiles: Array<{
    path: string;
    reason: string;
    error?: string;
  }>;
}

export class ReportGenerator {
  public report: ProcessingReport;
  private reportPath: string;

  constructor(knowledgePath: string) {
    // Save reports in the logs directory, NOT in the knowledge folder
    // This prevents the system from trying to process reports as knowledge documents
    const projectRoot = process.cwd();
    this.reportPath = path.join(projectRoot, 'logs', 'knowledge-processing-reports');
    
    // Ensure report directory exists
    if (!fs.existsSync(this.reportPath)) {
      fs.mkdirSync(this.reportPath, { recursive: true });
    }

    // Initialize report
    this.report = {
      timestamp: new Date().toISOString(),
      stats: {
        startTime: new Date(),
        totalFiles: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        exactDuplicates: 0,
        semanticDuplicates: 0,
      },
      fileTypes: {},
      errors: {},
      duplicates: {
        exact: [],
        semantic: [],
      },
      failedFiles: [],
    };
  }

  /**
   * Record a processed file
   */
  recordProcessed(filePath: string, fragmentCount: number) {
    this.report.stats.successful++;
    const ext = path.extname(filePath).toLowerCase();
    this.updateFileTypeStats(ext, 'processed');
    
    logger.debug(`Recorded processed: ${filePath} with ${fragmentCount} fragments`);
  }

  /**
   * Record a skipped file (duplicate)
   */
  recordSkipped(filePath: string, reason: 'exact' | 'semantic', similarity?: number) {
    this.report.stats.skipped++;
    const ext = path.extname(filePath).toLowerCase();
    this.updateFileTypeStats(ext, 'skipped');

    if (reason === 'exact') {
      this.report.stats.exactDuplicates++;
      this.report.duplicates.exact.push(filePath);
    } else if (reason === 'semantic' && similarity) {
      this.report.stats.semanticDuplicates++;
      // Note: This would need the original file path for complete reporting
      this.report.duplicates.semantic.push({
        file1: filePath,
        file2: 'unknown', // Would need to track this
        similarity: similarity,
      });
    }
  }

  /**
   * Record a failed file
   */
  recordFailed(filePath: string, error: any) {
    this.report.stats.failed++;
    const ext = path.extname(filePath).toLowerCase();
    this.updateFileTypeStats(ext, 'failed');

    // Determine error type
    let errorType = 'Unknown Error';
    let errorMessage = '';
    
    if (error) {
      if (error.code === 'ENOENT') {
        errorType = 'File Not Found';
      } else if (error.code === 'EACCES') {
        errorType = 'Permission Denied';
      } else if (error.message?.includes('encoding')) {
        errorType = 'Encoding Error';
      } else if (error.message?.includes('parse')) {
        errorType = 'Parse Error';
      } else if (error.message?.includes('rate limit')) {
        errorType = 'Rate Limit Error';
      } else if (error.message?.includes('embedding')) {
        errorType = 'Embedding Error';
      } else if (error.message) {
        errorMessage = error.message;
      }
    }

    // Track error statistics
    if (!this.report.errors[errorType]) {
      this.report.errors[errorType] = { count: 0, files: [] };
    }
    this.report.errors[errorType].count++;
    this.report.errors[errorType].files.push(path.basename(filePath));

    // Record failed file details
    this.report.failedFiles.push({
      path: filePath,
      reason: errorType,
      error: errorMessage,
    });
  }

  /**
   * Record an unsupported file
   */
  recordUnsupported(filePath: string) {
    const ext = path.extname(filePath).toLowerCase();
    if (!this.report.errors['Unsupported File Type']) {
      this.report.errors['Unsupported File Type'] = { count: 0, files: [] };
    }
    this.report.errors['Unsupported File Type'].count++;
    this.report.errors['Unsupported File Type'].files.push(path.basename(filePath));
    
    this.updateFileTypeStats(ext, 'failed');
  }

  /**
   * Update file type statistics
   */
  private updateFileTypeStats(ext: string, action: 'processed' | 'failed' | 'skipped') {
    if (!ext) ext = 'no-extension';
    
    if (!this.report.fileTypes[ext]) {
      this.report.fileTypes[ext] = {
        processed: 0,
        failed: 0,
        skipped: 0,
      };
    }

    this.report.fileTypes[ext][action]++;
  }

  /**
   * Finalize and save the report
   */
  async finalize(): Promise<string> {
    this.report.stats.endTime = new Date();
    this.report.stats.duration = 
      (this.report.stats.endTime.getTime() - this.report.stats.startTime.getTime()) / 1000;

    const timestamp = this.report.timestamp.replace(/[:.]/g, '-');
    
    // Save JSON report
    const jsonPath = path.join(this.reportPath, `report-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(this.report, null, 2));
    
    // Save Markdown report
    const mdPath = path.join(this.reportPath, `report-${timestamp}.md`);
    fs.writeFileSync(mdPath, this.generateMarkdownReport());
    
    // Save latest report symlink
    const latestJsonPath = path.join(this.reportPath, 'latest.json');
    const latestMdPath = path.join(this.reportPath, 'latest.md');
    
    if (fs.existsSync(latestJsonPath)) fs.unlinkSync(latestJsonPath);
    if (fs.existsSync(latestMdPath)) fs.unlinkSync(latestMdPath);
    
    fs.symlinkSync(jsonPath, latestJsonPath);
    fs.symlinkSync(mdPath, latestMdPath);
    
    logger.info(`Processing report saved to: ${mdPath}`);
    return mdPath;
  }

  /**
   * Generate human-readable Markdown report
   */
  private generateMarkdownReport(): string {
    const { stats, fileTypes, errors, duplicates, failedFiles } = this.report;
    const duration = stats.duration ? `${Math.round(stats.duration)} seconds` : 'unknown';
    
    let md = `# Document Processing Report\n\n`;
    md += `**Date:** ${new Date(this.report.timestamp).toLocaleString()}\n`;
    md += `**Duration:** ${duration}\n\n`;
    
    // Summary
    md += `## Summary\n\n`;
    md += `- ✅ **Successfully Processed:** ${stats.successful} documents\n`;
    md += `- ⏭️ **Skipped (Duplicates):** ${stats.skipped} documents\n`;
    md += `- ❌ **Failed:** ${stats.failed} documents\n`;
    md += `- 📁 **Total Files Scanned:** ${stats.totalFiles}\n\n`;
    
    // Duplicate Detection
    md += `## Duplicate Detection\n\n`;
    md += `### Exact Duplicates: ${stats.exactDuplicates}\n`;
    if (duplicates.exact.length > 0) {
      md += `- Content-based hash matches found\n`;
      md += `- First 10 duplicates:\n`;
      duplicates.exact.slice(0, 10).forEach(file => {
        md += `  - ${path.basename(file)}\n`;
      });
      if (duplicates.exact.length > 10) {
        md += `  - ... and ${duplicates.exact.length - 10} more\n`;
      }
    }
    md += `\n`;
    
    md += `### Semantic Duplicates: ${stats.semanticDuplicates}\n`;
    if (duplicates.semantic.length > 0) {
      md += `- Near-duplicates found (>95% similarity)\n`;
      duplicates.semantic.slice(0, 5).forEach(dup => {
        md += `  - ${path.basename(dup.file1)} ↔ ${path.basename(dup.file2)} (${(dup.similarity * 100).toFixed(1)}%)\n`;
      });
    } else {
      md += `- No near-duplicates found\n`;
    }
    md += `\n`;
    
    // Failed Files Analysis
    if (stats.failed > 0) {
      md += `## Failed Files Analysis\n\n`;
      md += `### By Error Type:\n`;
      Object.entries(errors).forEach(([errorType, data]) => {
        md += `- **${errorType}:** ${data.count} files\n`;
      });
      md += `\n`;
      
      // Show file extensions with failures
      md += `### File Types with Failures:\n`;
      const failedTypes = Object.entries(fileTypes)
        .filter(([_, stats]) => stats.failed > 0)
        .sort((a, b) => b[1].failed - a[1].failed);
      
      failedTypes.slice(0, 10).forEach(([ext, stats]) => {
        md += `- **${ext}:** ${stats.failed} failed\n`;
      });
      md += `\n`;
      
      // Show first few failed files with reasons
      md += `### Sample Failed Files:\n`;
      failedFiles.slice(0, 10).forEach(file => {
        md += `- \`${path.basename(file.path)}\`: ${file.reason}`;
        if (file.error) md += ` - ${file.error}`;
        md += `\n`;
      });
      if (failedFiles.length > 10) {
        md += `- ... and ${failedFiles.length - 10} more\n`;
      }
    }
    
    // File Type Statistics
    md += `\n## File Type Statistics\n\n`;
    md += `| Extension | Processed | Skipped | Failed | Total |\n`;
    md += `|-----------|-----------|---------|--------|-------|\n`;
    
    const sortedTypes = Object.entries(fileTypes)
      .sort((a, b) => {
        const totalA = a[1].processed + a[1].skipped + a[1].failed;
        const totalB = b[1].processed + b[1].skipped + b[1].failed;
        return totalB - totalA;
      });
    
    sortedTypes.slice(0, 20).forEach(([ext, stats]) => {
      const total = stats.processed + stats.skipped + stats.failed;
      md += `| ${ext} | ${stats.processed} | ${stats.skipped} | ${stats.failed} | ${total} |\n`;
    });
    
    if (sortedTypes.length > 20) {
      md += `| ... | ... | ... | ... | ... |\n`;
    }
    
    // Performance Metrics
    md += `\n## Performance Metrics\n\n`;
    if (stats.duration && stats.successful > 0) {
      const avgTime = stats.duration / stats.successful;
      md += `- **Average processing time:** ${avgTime.toFixed(2)} seconds/document\n`;
    }
    md += `- **Total processing time:** ${duration}\n`;
    
    return md;
  }
}