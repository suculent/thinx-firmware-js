# THiNX Lib (JavaScript)

[![Codacy Badge](https://api.codacy.com/project/badge/Grade/8dded023f3d14a69b3c38c9f5fd66a40)](https://www.codacy.com/app/suculent/thinx-firmware-js?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=suculent/thinx-firmware-js&amp;utm_campaign=Badge_Grade) [![Greenkeeper badge](https://badges.greenkeeper.io/suculent/thinx-firmware-js.svg)](https://greenkeeper.io/)

JavaScript client library for [Remote Things Management](https://rtm.thinx.cloud) using [THiNX](https://thinx.cloud) platform. Connects to WiFI and reports to main THiNX server; or through thinx-connect proxy, if found on your local network.

# What's New

* Example of Slack webhook as Status Transformer

## Installation

## QuickStart

1. Fork the base repository.
2. Edit configuration file in `conf/config.json`.
3. Start with `node test.js`

## Using NPM

1. Install the node package: `npm install thinx-firmware`
2. Create ./conf/config.json file and insert your THiNX API Key and Owner ID
3. Run following code:

```javascript

var thinx = require('thinx-firmware');
var defaults = require("./conf/config.json");
thinx.init(defaults.thinx.api_key, defaults.thinx.owner);

thinx.setCheckinCallback(function() {
  console.log("Checkin completed.");
});

```

### Configurations Priority

0. JavaScript version of the library expects device to be already configured for network connections.

1. THiNXLib is built with null default values (mostly).

2. THiNXLib is configured from thinx.json file.

3. Additional data are saved into local storage, where saved Owner ID takes precedence before user value to support OTA device migration.

4. On successful checkin, incoming data incl. UDID (unique device identifier) and Owner ID is stored for further use after reboot.

5. Configuration Push can be used to inject custom Environment Variables over the network, without need to have them stored anywhere in the code on the device (e.g. WiFi credentials)

### Finalize callback

When THiNX connects safely to network and connection is working, you'll get this callback.
```
thx.setCheckinCallback(function() {
  /* Called after library gets connected and registered */
});
```

### Location Support

You can update your device's location acquired e.g. by GPS module using `thx.setLocation(double lat, double lon)`.

Device will be forced to checked in when you change those values.
