import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CateringPlanner } from '@/app/CateringPlanner';
import '@/app/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CateringPlanner />
  </StrictMode>
);
