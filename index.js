/*
 * JavaScript client library for Remote Things Management using THiNX platform.
 */

var defaults = require("./conf/config.json");
var thinx = require('./lib/thinx/thinx.js');

/*
  Custom settings START
*/

thinx.setCheckinInterval(10);
thinx.setLocation(51,14);
thinx.setStatus("[SLACKME]");

thinx.setMQTTCallback(function(message) {
  // incoming mqtt message
});

thinx.setPushConfigCallback(function(configuration) {
  // incoming configuration change
});

thinx.setCheckinCallback(function() {
  // checkin completed
});

/*
  Custom settings END
*/

thinx.init(defaults.thinx.api_key, defaults.thinx.owner);
