import { defineConfig, loadEnv, Plugin } from "vite";
import fs from "fs";
import path from "path";

// Create a plugin to generate build-info.json during build
const generateBuildInfoPlugin = (): Plugin => ({
  name: 'generate-build-info',
  closeBundle() {
    // Generate a unique build hash (timestamp + random string)
    const buildInfo = {
      buildHash: Date.now().toString(36) + Math.random().toString(36).substring(2),
      timestamp: Date.now()
    };
    
    // Ensure the dist directory exists
    const distDir = path.resolve(__dirname, 'dist');
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }
    
    // Write to the output directory
    fs.writeFileSync(
      path.resolve(distDir, 'build-info.json'),
      JSON.stringify(buildInfo, null, 2)
    );
    
    console.log('Generated build-info.json with hash:', buildInfo.buildHash);
  }
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    server: {
      port: 3003,
      open: false, // open the browser where app is started
      proxy: {
        // Proxy PostHog requests to avoid CORS issues
        '/posthog': {
          target: 'https://eu.i.posthog.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/posthog/, ''),
        },
      },
    },
    define: {
      // Make non-prefixed CODER_URL available to import.meta.env
      'import.meta.env.CODER_URL': JSON.stringify(env.CODER_URL),
    },
    publicDir: "public",
    plugins: [
      generateBuildInfoPlugin(),
    ],
    optimizeDeps: {
      esbuildOptions: {
        // Bumping to 2022 due to "Arbitrary module namespace identifier names" not being
        // supported in Vite's default browser target https://github.com/vitejs/vite/issues/13556
        target: "es2022",
        treeShaking: true,
      },
    },
  };
});
