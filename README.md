# THiNX Lib (JavaScript)

[![Codacy Badge](https://api.codacy.com/project/badge/Grade/8dded023f3d14a69b3c38c9f5fd66a40)](https://www.codacy.com/app/suculent/thinx-firmware-js?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=suculent/thinx-firmware-js&amp;utm_campaign=Badge_Grade)

JavaScript client library for [Remote Things Management](https://rtm.thinx.cloud) using [THiNX](https://thinx.cloud) platform.

This package is using Rollbar for remote logging while in early development stages. If you don't need Rollbar, feel free to remove it (as it will be removed or optional later).

# What's New

* Device Simulator

### Usage

The class started by library is using configuration file in `conf/config.json`.

Connects to WiFI and reports to main THiNX server; or through proxy.

```javascript

var defaults = require("./conf/config.json");

var thinx = require('./lib/thinx/thinx.js');

thinx.init(defaults.thinx.api_key, defaults.thinx.owner);

thinx.setMQTTCallback(function(message) {
  // incoming mqtt message
});

thinx.setPushConfigCallback(function(configuration) {
  // incoming configuration change
});

thinx.setCheckinCallback(function() {
  // checkin completed
});
}

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
