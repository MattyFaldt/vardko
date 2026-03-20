#!/usr/bin/env npx tsx
/**
 * QR code generation utility for VårdKö clinic URLs.
 *
 * Usage:
 *   npx tsx scripts/generate-qr.ts --clinic kungsholmen --base-url https://vardko.vercel.app
 *
 * Outputs:
 *   - SVG to stdout
 *   - PNG  to scripts/output/<clinic>.png
 *   - HTML to scripts/output/<clinic>.html
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

// ── arg parsing ────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { clinic: string; baseUrl: string } {
  let clinic: string | undefined;
  let baseUrl: string | undefined;

  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--clinic' && argv[i + 1]) {
      clinic = argv[++i];
    } else if (argv[i] === '--base-url' && argv[i + 1]) {
      baseUrl = argv[++i];
    }
  }

  if (!clinic || !baseUrl) {
    console.error(
      'Usage: npx tsx scripts/generate-qr.ts --clinic <slug> --base-url <url>',
    );
    process.exit(1);
  }

  // Strip trailing slash
  baseUrl = baseUrl.replace(/\/+$/, '');

  return { clinic, baseUrl };
}

// ── main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { clinic, baseUrl } = parseArgs(process.argv);
  const queueUrl = `${baseUrl}/queue/${clinic}`;

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outputDir = join(__dirname, 'output');

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Generate SVG and print to stdout
  const svg = await QRCode.toString(queueUrl, { type: 'svg', margin: 2 });
  console.log(svg);

  // Generate PNG and save to file
  const pngPath = join(outputDir, `${clinic}.png`);
  await QRCode.toFile(pngPath, queueUrl, {
    type: 'png',
    width: 512,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  });
  console.error(`PNG saved to ${pngPath}`);

  // Generate HTML wrapper
  const svgDataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const html = `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VårdKö – ${clinic}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      font-family: system-ui, -apple-system, sans-serif;
      background: #f8fafc;
      color: #1e293b;
    }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p  { font-size: 1rem; color: #64748b; margin-bottom: 1.5rem; }
    img { width: 300px; height: 300px; }
    .url {
      margin-top: 1rem;
      font-size: 0.875rem;
      color: #94a3b8;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <h1>VårdKö</h1>
  <p>Skanna QR-koden för att ställa dig i kö – <strong>${clinic}</strong></p>
  <img src="${svgDataUri}" alt="QR-kod för ${queueUrl}" />
  <p class="url">${queueUrl}</p>
</body>
</html>`;

  const htmlPath = join(outputDir, `${clinic}.html`);
  writeFileSync(htmlPath, html, 'utf-8');
  console.error(`HTML saved to ${htmlPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
