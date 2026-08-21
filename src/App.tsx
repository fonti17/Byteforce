import { ChatTester } from './components/ChatTester';
import './App.css';

function App() {
  return (
    <main className="app-container">
      <header className="app-header">
        <h1>Byteforce AI Playground</h1>
        <p>Interactive test interface for Apertus v1.5 models (8B &amp; 70B)</p>
      </header>

      <ChatTester />
    </main>
  );
}

export default App;
