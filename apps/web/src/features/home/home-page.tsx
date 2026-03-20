export function HomePage() {
  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 600, margin: '80px auto', padding: '0 20px' }}>
      <h1>VårdKö</h1>
      <p>Köhanteringssystem för vårdcentraler</p>
      <p style={{ color: '#666', fontSize: 14 }}>
        Skanna QR-koden vid receptionen för att ställa dig i kön.
      </p>
    </div>
  );
}
