import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// If deploying to GitHub Pages at https://<user>.github.io/<repo>/,
// set base to "/<repo>/". If deploying to Vercel/Netlify, leave it as "/".
export default defineConfig({
  plugins: [react()],
  base: "/attendance-platform/",
});
