import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// base "./" lets the build run from any path (GitHub Pages project site, or opened straight from disk as one file)
export default defineConfig({ base: "./", plugins: [react(), viteSingleFile()] });
