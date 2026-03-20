export function SuperAdminPage() {
  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 800, margin: '60px auto', padding: '0 20px' }}>
      <h1>System</h1>
      <p style={{ color: '#999' }}>Kräver superadmin-autentisering med 2FA.</p>
    </div>
  );
}
