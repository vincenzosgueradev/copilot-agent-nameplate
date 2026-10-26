import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// La versione mostrata nell'header e' quella di package.json: scritta a mano era rimasta a v0.1.0.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig((configEnv) => {
  return {
    base: "./",
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
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
          // Nomi fissi, senza hash: l'host carica il tool da `dist/`, non da una CDN, quindi
          // non c'e' nessuna cache da invalidare. Con l'hash ogni build scriveva file nuovi e,
          // da quando `emptyOutDir` cancella i precedenti, una finestra gia' aperta restava a
          // puntare un file sparito e si svuotava.
          entryFileNames: "assets/index.js",
          chunkFileNames: "assets/[name].js",
          assetFileNames: "assets/[name][extname]",
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
