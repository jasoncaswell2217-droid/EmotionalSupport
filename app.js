/**
 * PsychLens Server Entry Point for cPanel Node.js Selector
 * This script bootstraps the application from the bundled 'out/server.cjs'
 */
console.log("PsycheLens: Initializing specialized neural synth substrate...");
console.log("Current Directory:", process.cwd());

// Set environment to production
process.env.NODE_ENV = 'production';

// Load the bundled server
import('./out/server.cjs')
  .then(() => {
    console.log("PsycheLens: Core modules synthesized successfully.");
  })
  .catch(err => {
    console.error("PsycheLens: CRITICAL FAILURE in neural synthesis.");
    console.error(err);
    process.exit(1);
  });
