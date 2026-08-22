import { CateringPlanner } from '../features/catering-plan';
import { ChatTester } from '../shared/ui';
import './App.css';

export function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';

  if (path === '/tester') {
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

  return <CateringPlanner />;
}

export default App;
