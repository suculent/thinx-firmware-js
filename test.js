/*
 * JavaScript client library for Remote Things Management using THiNX platform.
 */

var defaults = require("./conf/config.json");
console.log("Initializing remote log...");

var thinx = require('./lib/thinx/thinx.js');
thinx.init(defaults.thinx.api_key, defaults.thinx.owner);
thinx.setCheckinCallback(function(){
  console.log("Test completed, exiting...");
  process.exit();
});
