import qrcodegen from 'qrcode-generator';

interface QrCodeProps {
  url: string;
  size?: number;
  className?: string;
}

export function QrCodeSvg({ url, size = 256, className }: QrCodeProps) {
  const qr = qrcodegen(0, 'M');
  qr.addData(url);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const cellSize = size / moduleCount;

  let path = '';
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        const x = col * cellSize;
        const y = row * cellSize;
        path += `M${x},${y}h${cellSize}v${cellSize}h${-cellSize}z`;
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`QR-kod för ${url}`}
    >
      <rect width={size} height={size} fill="white" />
      <path d={path} fill="black" />
    </svg>
  );
}

export function generateQrDataUrl(url: string, size = 512): string {
  const qr = qrcodegen(0, 'M');
  qr.addData(url);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const cellSize = size / moduleCount;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Black modules
  ctx.fillStyle = '#000000';
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        ctx.fillRect(
          col * cellSize,
          row * cellSize,
          cellSize,
          cellSize,
        );
      }
    }
  }

  return canvas.toDataURL('image/png');
}

export function downloadQrPng(url: string, filename: string, size = 512) {
  const dataUrl = generateQrDataUrl(url, size);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function copyQrToClipboard(url: string, size = 512) {
  const qr = qrcodegen(0, 'M');
  qr.addData(url);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const cellSize = size / moduleCount;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#000000';
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
      }
    }
  }

  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/png');
  });

  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': blob }),
  ]);
}
