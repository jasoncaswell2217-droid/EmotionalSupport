/**
 * Root entry point for cPanel Node.js Selector
 * This file points to the bundled server code in dist/server.cjs
 */
console.log("Starting PsychLens Server...");

import('./dist/server.cjs')
  .then(() => {
    console.log("Server bundle loaded successfully.");
  })
  .catch(err => {
    console.error("CRITICAL: Failed to load server bundle!");
    console.error(err);
    process.exit(1);
  });
