import fs from 'fs';
import { AnalysisResult } from '../types.js';

export function generateHTMLReport(result: AnalysisResult, outputPath: string): void {
  const html = generateHTML(result);
  fs.writeFileSync(outputPath, html);
}

function generateHTML(result: AnalysisResult): string {
  const recommendations = result.recommendations
    .map(rec => `
      <div class="recommendation ${rec.severity}">
        <div class="rec-icon">${rec.severity === 'critical' ? '🔴' : rec.severity === 'warning' ? '🟡' : '🟢'}</div>
        <div class="rec-content">
          <div class="rec-message">${escapeHtml(rec.message)}</div>
          <div class="rec-action">Action: ${escapeHtml(rec.action)}</div>
        </div>
      </div>
    `)
    .join('');

  const topModules = result.bundleStats.modules
    .slice(0, 10)
    .map(m => `
      <tr>
        <td>${escapeHtml(m.name.slice(-50))}</td>
        <td>${(m.size / 1024).toFixed(2)} KB</td>
        <td>${m.percentage.toFixed(2)}%</td>
      </tr>
    `)
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Package Analysis Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #333;
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header {
      background: white;
      padding: 30px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    h1 { color: #667eea; font-size: 28px; margin-bottom: 10px; }
    .timestamp { color: #999; font-size: 12px; }
    
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }
    .metric-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    .metric-label { color: #999; font-size: 12px; text-transform: uppercase; margin-bottom: 10px; }
    .metric-value { font-size: 24px; font-weight: bold; color: #667eea; }
    
    .section {
      background: white;
      padding: 25px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    .section h2 { color: #333; margin-bottom: 15px; font-size: 18px; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    
    .recommendation {
      display: flex;
      gap: 15px;
      padding: 15px;
      margin-bottom: 10px;
      border-radius: 6px;
      border-left: 4px solid;
    }
    .recommendation.critical { background: #fff5f5; border-left-color: #f56565; }
    .recommendation.warning { background: #fffaf0; border-left-color: #ed8936; }
    .recommendation.info { background: #ebf8ff; border-left-color: #4299e1; }
    
    .rec-icon { font-size: 24px; }
    .rec-content { flex: 1; }
    .rec-message { font-weight: 600; margin-bottom: 5px; }
    .rec-action { font-size: 13px; color: #666; }
    
    table { width: 100%; border-collapse: collapse; }
    th { background: #f7f7f7; padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #eee; }
    td { padding: 12px; border-bottom: 1px solid #eee; }
    tr:hover { background: #f9f9f9; }
    
    footer { text-align: center; color: #999; font-size: 12px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>📊 Package Analysis Report</h1>
      <div class="timestamp">Generated: ${new Date(result.timestamp).toLocaleString()}</div>
    </header>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Total Size</div>
        <div class="metric-value">${(result.metrics.totalSize / 1024 / 1024).toFixed(2)} MB</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Gzip Size</div>
        <div class="metric-value">${(result.metrics.totalGzipSize / 1024 / 1024).toFixed(2)} MB</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Modules</div>
        <div class="metric-value">${result.metrics.moduleCount}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Chunks</div>
        <div class="metric-value">${result.metrics.chunkCount}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Avg Module Size</div>
        <div class="metric-value">${(result.metrics.averageModuleSize / 1024).toFixed(2)} KB</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Largest Module</div>
        <div class="metric-value">${(result.metrics.largestModule.size / 1024).toFixed(2)} KB</div>
      </div>
    </div>

    ${result.recommendations.length > 0 ? `
      <div class="section">
        <h2>💡 Recommendations</h2>
        ${recommendations}
      </div>
    ` : ''}

    <div class="section">
      <h2>📦 Top 10 Modules by Size</h2>
      <table>
        <thead>
          <tr>
            <th>Module Name</th>
            <th>Size</th>
            <th>Percentage</th>
          </tr>
        </thead>
        <tbody>
          ${topModules}
        </tbody>
      </table>
    </div>

    <footer>
      <p>Package Analyzer Plus v1.0.0 - Advanced Package Analysis Tool</p>
    </footer>
  </div>
</body>
</html>
  `;
}

function escapeHtml(text: string): string {
  const map: {[key: string]: string} = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, char => map[char]);
}
