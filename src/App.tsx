import { ChatTester } from './components/ChatTester';
import './App.css';

function App() {
  return (
    <main style={{ padding: '24px 0', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ marginBottom: '16px' }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '32px' }}>Byteforce AI Playground</h1>
        <p style={{ color: 'var(--text)', margin: 0 }}>
          Interactive test interface for Apertus v1.5 models (8B & 70B)
        </p>
      </header>

      <ChatTester />
    </main>
  );
}

export default App;
