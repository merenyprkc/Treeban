import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const API  = env.VITE_API_URL || 'http://localhost:3001';

  return {
    server: {
      proxy: {
        '/api': { target: API, changeOrigin: true },
        '/socket.io': { target: API, ws: true, changeOrigin: true },
      },
    },
  };
});
