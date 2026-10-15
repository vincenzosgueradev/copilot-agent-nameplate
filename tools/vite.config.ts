import { defineConfig } from "vite";

export default defineConfig((configEnv) => {
  return {
    base: "./",
    root: "./src",
    build: {
      outDir: "../dist",
      // Senza, ogni build lascia i file con hash precedenti: dopo qualche giro la
      // cartella e' piena di CSS e JS morti e non si capisce piu' quale sia il buono.
      emptyOutDir: true,
      assetsDir: "assets",
      cssCodeSplit: false,
      sourcemap: configEnv.mode === "development",
      rollupOptions: {
        output: {
          // Use IIFE format for compatibility with iframe srcdoc loading
          // ES modules can have issues when loaded via file:// URLs in iframes
          format: "iife",
          // Bundle everything into a single file to avoid module loading issues
          inlineDynamicImports: true,
          // Disable chunking since we're bundling everything
          manualChunks: undefined,
        },
      },
    },
  };
});
