/*
 * JavaScript client library for Remote Things Management using THiNX platform.
 */

var Thinx = (function() {

	var defaults = require("../../conf/config.json");

	// Override config from environment variables for Docker
	if ( (typeof(process.env.OWNER_ID) !== "undefined") && (process.env.OWNER_ID != null) ) {
		defaults.thinx.owner = process.env.OWNER_ID;
	}
	if ( (typeof(process.env.API_KEY) !== "undefined") && (process.env.API_KEY != null) ) {
		defaults.thinx.api_key = process.env.API_KEY;
	}

	// used to fetch current git revision and reboot when started in super-user
	var exec = require("child_process");

	// currently not used, great for creating and searching for files
	// var fs = require('fs-extra');

	// standard MQTT client, needs to be pinned for security and upgraded to mqtts
	var mqtt = require('mqtt');

	// this library does not support bare HTTP transfers by design

	var https = require("https");
	require('ssl-root-cas').inject();
	https.globalAgent.options.ca = require('ssl-root-cas');

	//
	// var moment = require("moment");

	// used as quick persistent storage drop-in, needs security check
	var storage = require('node-persist');

	// MDNS query is used to find local thinx-proxy (optional)
	var Mdns = require('mdns-discovery');

	require('getmac').getMac(function(err, macAddress) {
		if (err) {
			console.log("getmac error: " + err);

			const bb = (Math.random().toFixed(2) * 255).toString(16);
			const cc = (Math.random().toFixed(2) * 255).toString(16);
			_thinx_mac = "TH:iN:JS:" + aa + ":" + bb + ":" + cc;

			console.log("using generated mac: " + _thinx_mac);

		} else {
			console.log(macAddress);
			_thinx_mac = macAddress;
		}
	});

	var _latitude, _longitude, _status, _api_key, _owner_id, _app_version, _thinx_device_alias;
	var _checkin_interval, _last_checkin_timestamp, _last_checkin_millis, _reboot_interval;

	var _phase;

	var _thinx_udid = "0";
	var _thinx_status = 'Registered';

	var _checkinTimer;
	var _rebootTimer;

	var _mqtt_client;
	var _mqtt_connected = false;

	const payload_type = {
		Unknown: 0,
		UPDATE: 1, // Firmware Update Response Payload
		REGISTRATION: 2, // Registration Response Payload
		NOTIFICATION: 3, // Notification/Interaction Response Payload
		CONFIGURATION: 4, // Environment variables update
		Reserved: 255 // Reserved
	};

	const phase = {
		INIT: 0,
		CONNECT_WIFI: 1, // deprecated
		CONNECT_API: 2,
		CONNECT_MQTT: 3,
		COMPLETED: 4
	};

	var mdns = new Mdns({
		timeout: 4,
		returnOnFirstFound: true,
		name: '_tcp.local',
		find: 'thinx'
	});

	//
	var _private = {

		update_and_restart: function(url) {
			console.log("Updating...");
			_private.shell("git pull origin master; npm install .; node index.js");
			process.exit();
		},

		import_build_time_constants: function(callback) {
			// _api_key should be injected by user
			// _thinx_owner should be injected by user but rewritten on transfer and checkin
			_thinx_commit_id = _private.revision();
			_thinx_mqtt_url = defaults.thinx.mqtt_url;
			_thinx_cloud_url = defaults.thinx.cloud_url;
			_thinx_alias = defaults.thinx.device_alias;
			_thinx_owner = defaults.thinx.owner;
			_thinx_mqtt_port = defaults.thinx.mqtt_port;
			_thinx_api_port = defaults.thinx.api_port;
			_thinx_auto_update = defaults.thinx.auto_update;
			_thinx_forced_update = defaults.thinx.forced_update;
			_thinx_firmware_version = defaults.thinx.firmware_version;
			_thinx_firmware_version_short = defaults.thinx.firmware_version_short;
			_app_version = defaults.thinx.app_version;
			_thinx_device_alias = defaults.thinx.device_alias;
			_env = defaults.thinx.env;
		},

		restore_device_info: function() {

			storage.initSync();

			var alias = storage.getItemSync('alias');
			if (typeof(alias) !== "undefined" && alias !== null) {
				_thinx_alias = alias;
			}

			var udid = storage.getItemSync('udid');
			if (typeof(udid) !== "undefined" && udid !== null) {
				_thinx_udid = udid;
			}

			var apikey = storage.getItemSync('apikey');
			if (typeof(apikey) !== "undefined" && apikey !== null) {
				_api_key = apikey;
			}

			var owner = storage.getItemSync('owner');
			if (typeof(owner) !== "undefined" && owner !== null) {
				_owner_id = owner;
			}

			var available_update_url = storage.getItemSync('ott');
			if (typeof(available_update_url) !== "undefined" && available_update_url !== null) {
				_available_update_url = available_update_url;
			}

		},

		save_device_info: function() {

			storage.setItemSync('owner', _owner_id);
			storage.setItemSync('apikey', _api_key);
			storage.setItemSync('udid', _thinx_udid);

			if (typeof(_available_update_url) !== "undefined" && _available_update_url != null) {
				storage.setItemSync('update', _available_update_url);
			}

			console.log("Device info saved.");

		},

		thinx_mac: function() {
			return _thinx_mac;
		},

		setMqttConnected: function() {
			_mqtt_connected = true;
		},

		checkin: function() {
			_private.checkin_request(function(error, response) {
				if (!error) {
					_phase = phase.COMPLETED;
					console.log("Checkin successful.");
					if ((typeof(_checkin_callback) !== "undefined") && _checkin_callback !== null) {
						_checkin_callback(response);
					}
				}
			});
		},

		checkin_body: function() {
			return JSON.stringify({
				registration: {
					mac: _thinx_mac,
					firmware: _thinx_firmware_version,
					version: _thinx_firmware_version_short,
					commit: _private.revision(),
					owner: _owner_id,
					alias: _thinx_device_alias,
					udid: _thinx_udid,
					status: _thinx_status,
					platform: "nodejs",
					lat: _latitude,
					lon: _longitude,
				}
			});
		},

		revision: function() {
			return _private.shell("git rev-list HEAD --count");
		},

		shell: function(command) {
			return exec.execSync(command).toString().replace("\n", "");
		},

		checkin_request: function(send_callback) {

			if ((typeof(_api_key) == "undefined") || _api_key == null) {
				console.log("API Key and Owner ID is required for checkin! Exiting.");
				process.exit();
				return;
			};

			var options = {
				strictSSL: false,
				rejectUnauthorized: false, // TODO: remove this dirty hack! needs out public cert chain
				hostname: defaults.thinx.cloud_url,
				port: defaults.thinx.api_port,
				path: '/device/register',
				method: 'POST',
				headers: {
					'Authentication': _api_key,
					'Accept': 'application/json',
					'Content-type': 'application/json',
					'Origin': 'device',
					'User-Agent': 'THiNX-Client'
				}
			};

			var rbody = _private.checkin_body();

			var req = https.request(options, (res) => {
				var chunks = [];
				if (typeof(res) === "undefined") {
					console.log("No response.");
					if ((typeof(_finalize_callback) !== "undefined") && _finalize_callback !== null) {
						console.log("Using checkin callback...");
						callback(true); // (error)
					}
					return;
				}
				res.on('data', function(chunk) {
					chunks.push(chunk);
				}).on('end', function() {
					_private.parse(Buffer.concat(chunks));
					if ((typeof(send_callback) !== "undefined") && send_callback !== null) {
						send_callback(false, Buffer.concat(chunks));
					}
				});
			});

			req.on('error', (e) => {
				console.error(e);
			});

			req.write(rbody);
			req.end();
		},

		parse: function(body) {

			const payload = JSON.parse(body); // may throw on API failure

			//
			// Registration
			//

			const registration = payload.registration;
			if ((typeof(registration) !== "undefined") && registration !== null) {

				const success = registration["success"];
				const status = registration["status"];

				if (status == "OK") {

					const alias = registration["alias"];
					if ((typeof(alias) !== "undefined") && alias !== null) {
						_thinx_alias = alias;
					}

					const owner = registration["owner"];
					if ((typeof(owner) !== "undefined") && owner !== null) {
						_thinx_owner = owner;
					}

					const udid = registration["udid"];
					if ((typeof(owner) !== "undefined") && owner !== null) {
						_thinx_udid = udid;
					}

					const auto_update = registration["auto_update"];
					if ((typeof(auto_update) !== "undefined") && auto_update !== null) {
						thinx_auto_update = auto_update;
					}

					const forced_update = registration["auto_update"];
					if ((typeof(forced_update) !== "undefined") && forced_update !== null) {
						thinx_forced_update = forced_update;
					}

					const timestamp = registration["timestamp"];
					if ((typeof(timestamp) !== "undefined") && timestamp !== null) {
						_last_checkin_timestamp = timestamp;
						_last_checkin_millis = new Date().getMilliseconds();
					}

					_private.save_device_info();

				} else {
					console.log("Response status not OK: " + status);
				}

			}

			//
			// Update
			//

			const update = payload.FIRMWARE_UPDATE;
			if ((typeof(update) !== "undefined") && update !== null) {

				const mac = update["mac"];
				console.log("mac: " + mac);

				if (mac != _thinx_mac) {
					console.log(F("*TH: Firmware is dedicated to device with different MAC. Skipping update."));
					Serial.print("Local MAC: " + _thinx_mac);
					Serial.print("Remote MAC: " + mac);
					return;
				}

				const update_udid = root["udid"];
				if ((typeof(update_udid) !== "undefined") && update_udid !== null) {
					_thinx_udid = update_udid; // registration may return FIRMWARE_UPDATE, so we trust udid here
					console.log("Update for update_udid: " + update_udid);
				}

				// Check current firmware based on commit id and store Updated state...
				const commit = update["commit"];
				console.log("Update commit: " + commit);

				// Check current firmware based on version and store Updated state...
				const version = update["version"];
				console.log("Update version: " + version);

				// Well, the backend should not actually provide firmware when these two things are same,
				// following block may deprecate.
				if ((commit.equals(_thinx_commit_id)) && (version.equals(_thinx_version))) {
					if ((typeof(_available_update_url) != "undefined") && (_available_update_url != null)) {
						console.log(
							"*TH: firmware has same thx_commit_id as current and update availability is stored. Firmware has been installed."
						);
						_available_update_url = null;
						notify_on_successful_update();
						return;
					} else {
						console.log(F(
							"*TH: Info: firmware has same thx_commit_id as current and no update is available."));
					}
				}

				save_device_info();

				// In case automatic updates are disabled,
				// we must ask user to commence firmware update.
				if (_thinx_auto_update == false) {
					if (_mqtt_connected) {
						console.log(F("* TH: Update availability notification..."));
						_public.publish(
							_private.thinx_mqtt_channel, {
								title: "Update Available",
								body: "There is an update available for this device. Do you want to install it now?",
								type: "success"
							}
						);
					}
				} else if (_thinx_auto_update || _thinx_forced_update) {
					console.log("*TH: Update not implemented...");
					update_and_restart();
				}
			}

			const notification = payload.notification;
			if ((typeof(notification) !== "undefined") && notification !== null) {

				// Currently, this is used for update only, can be extended with request_category or similar.

				const type = notification["response_type"];

				if ((type == "bool") || (type == "boolean")) {
					const bool_response = notification["response"];
					if (bool_response == true) {
						console.log("*TH: User allowed update using boolean.");
						if (_available_update_url) {
							update_and_restart(_available_update_url);
						}
					} else {
						console.log(F("*TH: User denied update using boolean."));
					}
				}

				if ((type == "string") || (type == "String")) {
					const string_response = notification["response"];
					if (string_response == "yes") {
						console.log("*TH: User allowed update using string.");
						if (_available_update_url) {
							update_and_restart(_available_update_url);
						}
					} else if (string_response == "no") {
						console.log("*TH: User denied update using string.");
					}
				}
			}

			const configuration = payload.configuration;
			if ((typeof(configuration) !== "undefined") && configuration !== null) {
				if ((typeof(_config_callback) !== "undefined") && (_config_callback !== null)) {
					_config_callback(payload);
				}
			}
		},

		thinx_mqtt_channel: function() {
			return "/" + _owner_id + "/" + _thinx_udid;
		},

		thinx_mqtt_channels: function() {
			return _private.thinx_mqtt_channel + "/#";
		},

		thinx_mqtt_status_channel: function() {
			return _private.thinx_mqtt_channel + "/status";
		},

		thinx_mac: function() {
			return _thinx_mac;
		},

		notify_on_successful_update: function() {
			_private.publishStatusUnretained({
				title: "Update Successful",
				body: "The device has been successfully updated.",
				type: "success"
			});
		},

		publishStatus: function(message) {
			_private.publishStatus(message);
		},

		publishStatusUnretained: function(message) {
			_private.publish(message, _private.thinx_mqtt_status_channel(), false);
		},

		publishStatusRetain: function(message, retain) {
			_private.publish(message, _private.thinx_mqtt_status_channel(), true);
		},

		publish: function(message, topic, retain) {
			if (_mqtt_connected) {
				_mqtt_client.publish(_private.thinx_mqtt_status_channel(), JSON.stringify(message), {
					retain: retain
				});
			} else {
				console.log("MQTT not connected in publish!");
			}
		},

		start_mqtt: function(start_callback) {

			var options = {
				clientId: _private.thinx_mac(),
				reconnectPeriod: 30 * 1000,
				username: defaults.thinx.owner,
				password: defaults.thinx.api_key,
				port: defaults.thinx.mqtt_port,
				will: {
					topic: _private.thinx_mqtt_status_channel(),
					payload: JSON.stringify({
						status: "disconnected"
					}),
					qos: 0,
					retain: true
				}
			};

			var url = 'mqtt://' + _thinx_mqtt_url;
			_mqtt_client = mqtt.connect(url, JSON.stringify(options));

			_mqtt_client.on('connect', function(data) {
				console.log("Is mqtt connected? " + _mqtt_connected)
				if (!_mqtt_connected) {
					console.log("MQTT Connected! " + JSON.stringify(data));

					_mqtt_client.subscribe(_private.thinx_mqtt_channel);
					_private.setMqttConnected();

					const connect_message = JSON.stringify({
						status: "connected"
					});

					_mqtt_client.publish(_private.thinx_mqtt_status_channel(), connect_message);

					if ((typeof(start_callback) !== "undefined") && start_callback !== null) {
						start_callback();
					}
				}
			});

			_mqtt_client.on('message', function(topic, message) {
				const m = message.toString();
				console.log("»SIM: Command Incoming: " + m);
				parse(message);
				if (_mqtt_callback !== null) {
					_mqtt_callback(message);
				}
			});

		},

		finalize: function() {
			_phase = phase.COMPLETED;
			if ((typeof(_checkin_callback) !== "undefined") && _checkin_callback !== null) {
				_checkin_callback();
			} else {
				console.log("*TH: Checkin completed.");
			}
		},

		reboot: function() {
			_private.shell('reboot'); // must run as super-user
		}
	};

	var _public = {

		getUDID: function() {
			return _thinx_udid;
		},

		init: function(api_key, owner_id) {

			_phase = phase.INIT;

			_private.import_build_time_constants();

			console.log("Starting " + defaults.thinx.app_version);

			if (typeof(api_key) === "undefined") {
				console.log("Using default API Key...");
				_api_key = defauts.thinx.api_key;
			} else {
				console.log("Using custom API Key...");
				_api_key = api_key;
			}

			if (typeof(owner_id) === "undefined") {
				console.log("Using default owner...");
				_owner_id = defauts.thinx.owner;
			} else {
				console.log("Using custom owner...");
				_owner_id = owner_id;
			}

			console.log("Restoring device info...");
			_private.restore_device_info();

			console.log("Running MDNS Query...");
			mdns.run(function(res) {
				res.forEach(function(entry) {
					console.log("thinx-connect proxy found, rerouting traffic...");
					console.log(entry);
					_thinx_cloud_url = "thinx.local";
					_thinx_mqtt_url = "thinx.local";
				});
			});

			// Wait for MDNS timeout
			var mdnsTimer = setTimeout(function() {
				_public.initMqtt(mdnsTimer);
			}, 5000);

		},

		initMqtt: function(mdnsTimer) {
			console.log("Checking in...");
			_phase = phase.CONNECT_API;
			_private.checkin();

			console.log("Starting MQTT...");
			_phase = phase.CONNECT_MQTT;

			_private.start_mqtt(function() {

				console.log("MQTT start completion callback: Enabling timers...");

				function checkinEvent() {
					console.log("Loop-timer for check-in called:");
					_private.checkin();
				}

				if (typeof(_checkin_interval) !== "undefined" && typeof(_checkinTimer) == "undefined" && _checkin_interval > 0) {
					if (_checkin_interval >= 3000) {
						console.log("Setting checkin interval: " + _checkin_interval/1000 + " sec");
						_checkinTimer = setInterval(function() {
							checkinEvent();
						}, _checkin_interval);
					} else {
						console.log("Checkin interval must be > 3000, skipping...");
					}
				}

				function rebootEvent() {
					console.log("Loop-timer for reboot called:");
					_private.reboot();
				}

				if (_reboot_interval != null && typeof(_rebootTimer) == "undefined") {
					if (_reboot_interval >= 30000) {
						console.log("Setting reboot interval: " + _reboot_interval/1000 + " sec");
						_rebootTimer = setInterval(function() {
							rebootEvent();
						}, _reboot_interval);
					} else {
						console.log("Reboot interval must be > 30000, skipping...");
					}
				}

				console.log("Calling finalize...");
				_private.finalize();

				clearTimeout(mdnsTimer);
			});
		},

		setStatus: function(status) {
			console.log("setStatus");
			_thinx_status = status;
			_private.checkin();
			if (_mqtt_connected) {
				_private.publishStatusUnretained({
					status: status
				});
			} else {
				console.log("Error: MQTT not connected.")
			}
		},

		setLocation: function(lat, lon) {
			console.log("setLocation");
			_latitude = lat;
			_longitude = lon;
			if (_phase > phase.CONNECT_API) {
				_private.checkin();
			}
		},

		setCheckinInterval: function(interval) {
			console.log("setCheckinInterval");
			_checkin_interval = interval * 1000;
		},

		setRebootInterval: function(interval) {
			console.log("setRebootInterval");
			_reboot_interval = interval * 1000;
		},

		setMQTTCallback: function(func) {
			console.log("setMQTTCallback");
			_mqtt_callback = func;
		},

		setPushConfigCallback: function(func) {
			console.log("setPushConfigCallback");
			_config_callback = func;
		},

		setCheckinCallback: function(func) {
			console.log("setCheckinCallback");
			_checkin_callback = func;
		}
	};

	return _public;

})();

// Initialization and Main Loop
exports.init = Thinx.init;
exports.checkin = Thinx.checkin;

// Check-in with updated status or location
exports.setStatus = Thinx.setStatus;
exports.setLocation = Thinx.setLocation;

// Check-in and reboot intervals
exports.setCheckinInterval = Thinx.setCheckinInterval;
exports.setRebootInterval = Thinx.setRebootInterval; // must be started as `root` or user must have privilege to reboot device

// MQTT init
exports.initMqtt = Thinx.initMqtt;

// Checkin, MQTT and configuration change callbacks.
exports.setMQTTCallback = Thinx.setMQTTCallback;
exports.setPushConfigCallback = Thinx.setPushConfigCallback;
exports.setCheckinCallback = Thinx.setCheckinCallback;

// UDID provider
exports.getUDID = Thinx.getUDID;
