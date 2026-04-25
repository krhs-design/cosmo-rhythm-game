import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/cosmo-rhythm-game/",
  server: {
    host: true,
  },
});
