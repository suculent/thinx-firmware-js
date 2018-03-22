/*
 * JavaScript client library for Remote Things Management using THiNX platform.
 */

var defaults = require("./conf/config.json");
var thinx = require('./lib/thinx/thinx.js');

thinx.init(defaults.thinx.api_key, defaults.thinx.owner);
