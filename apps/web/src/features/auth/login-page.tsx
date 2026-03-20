export function LoginPage() {
  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 360, margin: '80px auto', padding: '0 20px' }}>
      <h1>Logga in</h1>
      <form onSubmit={(e) => e.preventDefault()}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>E-post</label>
          <input
            type="email"
            disabled
            placeholder="namn@klinik.se"
            style={{ width: '100%', padding: '10px 12px', fontSize: 16, borderRadius: 6, border: '1px solid #ccc' }}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>Lösenord</label>
          <input
            type="password"
            disabled
            style={{ width: '100%', padding: '10px 12px', fontSize: 16, borderRadius: 6, border: '1px solid #ccc' }}
          />
        </div>
        <button
          disabled
          style={{ width: '100%', padding: '12px', fontSize: 16, borderRadius: 8, background: '#0070f3', color: '#fff', border: 'none', opacity: 0.5 }}
        >
          Logga in
        </button>
      </form>
      <p style={{ color: '#999', fontSize: 12, marginTop: 16, textAlign: 'center' }}>
        Backend ej ansluten ännu.
      </p>
    </div>
  );
}
