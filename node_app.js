/**
 * Root entry point for cPanel Node.js Selector
 */
console.log("--- PSYCHELENS BOOTSTRAP START ---");
console.log("Time:", new Date().toISOString());
console.log("CWD:", process.cwd());
console.log("ExecPath:", process.execPath);

// Force production mode
process.env.NODE_ENV = 'production';

// Attempt to load the server bundle
const bundlePath = './dist/server.cjs';
console.log(`Loading bundle from: ${bundlePath}`);

import(bundlePath)
  .then(() => {
    console.log("--- PSYCHELENS BUNDLE LOADED ---");
  })
  .catch(err => {
    console.error("!!! CRITICAL BOOTSTRAP FAILURE !!!");
    console.error(err);
    // Explicitly log the stack trace
    if (err.stack) console.error(err.stack);
    process.exit(1);
  });
