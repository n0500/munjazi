import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ⚠️ غيّري 'munjazi' لاسم المستودع (repository) بالضبط اللي بتنشئينه بـGitHub
export default defineConfig({
  plugins: [react()],
  base: '/munjazi/',
});
