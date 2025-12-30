import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

export default function Home() {
  const navigate = useNavigate();

  const createDoc = () => {
    navigate(`/doc/${uuidv4()}`);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', 
      justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif',
      background: '#f0f2f5', color: '#333'
    }}>
      <h1 style={{ marginBottom: '2rem' }}>Collaborative Editor</h1>
      <button 
        onClick={createDoc}
        style={{
          padding: '1rem 2rem', fontSize: '1.2rem', cursor: 'pointer',
          background: '#007bff', color: 'white', border: 'none',
          borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        }}
      >
        + New Document
      </button>
    </div>
  );
}
