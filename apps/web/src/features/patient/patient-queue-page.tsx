import { useParams } from 'react-router-dom';

export function PatientQueuePage() {
  const { clinicSlug } = useParams<{ clinicSlug: string }>();

  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 400, margin: '60px auto', padding: '0 20px', textAlign: 'center' }}>
      <h1>VårdKö</h1>
      <h2>{clinicSlug}</h2>
      <p>Ange ditt personnummer för att ställa dig i kön.</p>
      <input
        type="text"
        placeholder="ÅÅÅÅMMDD-XXXX"
        disabled
        style={{ fontSize: 18, padding: '12px 16px', width: '100%', maxWidth: 280, textAlign: 'center', borderRadius: 8, border: '2px solid #ccc' }}
      />
      <br />
      <button
        disabled
        style={{ marginTop: 16, fontSize: 16, padding: '12px 32px', borderRadius: 8, background: '#0070f3', color: '#fff', border: 'none', opacity: 0.5 }}
      >
        Ställ dig i kön
      </button>
      <p style={{ color: '#999', fontSize: 12, marginTop: 24 }}>
        Backend ej ansluten ännu — detta är en placeholder.
      </p>
    </div>
  );
}
