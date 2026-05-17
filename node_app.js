/**
 * Root entry point for cPanel Node.js Selector
 * This file points to the bundled server code in dist/server.cjs
 */
console.log("Starting PsychLens Server...");

// Set production environment if not already set
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

console.log("Environment:", process.env.NODE_ENV);
console.log("Process CWD:", process.cwd());

import('./dist/server.cjs')
  .then(() => {
    console.log("Server bundle loaded successfully.");
  })
  .catch(err => {
    console.error("CRITICAL: Failed to load server bundle!");
    console.error(err);
    process.exit(1);
  });
