import { useParams } from 'react-router-dom';

export function DisplayBoardPage() {
  const { clinicSlug } = useParams<{ clinicSlug: string }>();

  return (
    <div style={{ fontFamily: 'system-ui', background: '#1a1a2e', color: '#fff', minHeight: '100vh', padding: 40 }}>
      <h1 style={{ fontSize: 48, marginBottom: 8 }}>VårdKö</h1>
      <h2 style={{ fontSize: 24, color: '#aaa', fontWeight: 'normal' }}>{clinicSlug}</h2>

      <div style={{ marginTop: 60, fontSize: 32, color: '#4ade80' }}>
        Nu betjänas
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 40, flexWrap: 'wrap' }}>
        <div style={{ background: '#16213e', borderRadius: 16, padding: '24px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: 64, fontWeight: 'bold' }}>—</div>
          <div style={{ fontSize: 18, color: '#aaa' }}>Rum 1</div>
        </div>
        <div style={{ background: '#16213e', borderRadius: 16, padding: '24px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: 64, fontWeight: 'bold' }}>—</div>
          <div style={{ fontSize: 18, color: '#aaa' }}>Rum 2</div>
        </div>
      </div>

      <div style={{ marginTop: 60, fontSize: 20, color: '#666' }}>
        0 väntar — Backend ej ansluten
      </div>
    </div>
  );
}
