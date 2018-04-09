/*
 * JavaScript client library for Remote Things Management using THiNX platform.
 */

var defaults = require("./conf/config.json");
var thinx = require('./lib/thinx/thinx.js');

/*
  Custom settings START
*/

thinx.setCheckinInterval(300);
thinx.setLocation(51,14);

thinx.setMQTTCallback(function(message) {
  // incoming mqtt message
});

thinx.setPushConfigCallback(function(configuration) {
  // incoming configuration change
});

thinx.setFinalizeCallback(function() {
  // mqtt connection estabilished
  console.log("// Finalize callback");

  /*
    SetStatus message can be processed by transformers.
    Set one at https://rtm.thinx.cloud
  */
  thinx.setStatus("[SLACKME]");
});

thinx.setCheckinCallback(function() {
  // checkin completed
  console.log("// Checkin callback")
});

/*
  Custom settings END
*/

thinx.init(defaults.thinx.api_key, defaults.thinx.owner);
