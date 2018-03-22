//
// THiNX2Slack Webhook Status Transformer
//

// This example does not transform status in any way, returns input value as it,
// while it splits the data flow and forwards each message with a webhook to Slack.
// And yes, you can easily fry it, if you'll shell your MQTT queue too much.

var transformer = function(status, device) {

	var https = require("https");
	var slack_path = "/services/T6V3DBVUN/B9V7F7XAT/MvvMI72kBi1S5bqcFXYZ1Ad2"

	// Takes non-transformer `status` as a body of the message.
	// Transform/format its value here, if required.

	var message = (typeof(status) === "undefined") ? "Hello, World!" : status;

	var options = {
		strictSSL: false,
		rejectUnauthorized: false, // TODO: remove this dirty hack! needs out public cert chain
		hostname: 'hooks.slack.com',
		port: 443,
		path: slack_path,
		method: 'POST',
		headers: {
			'Accept': 'application/json',
			'Content-type': 'application/json'
		}
	};

	var body = {
		username: device.alias,
		text: message
	}

	var number = parseFloat(message);
	var color = "good";

	if (number > 3.4) {
		color = "good";
	} else if (3.4 > number > 3.0) {
		color = "warning";
	} else if (3.0 > number) {
		color = "danger";
	}

	body.attachments = [
        {
						author_name: device.alias,
						author_icon: "https://rtm.thinx.cloud/assets/thinx/img/ioticons/b_small_" + device.icon + ".png",
            fallback: device.status,
            pretext: "_Your_ device just posted new status.",
            footer: "This message has been sent by THiNX Status Transformer.",
            image_url: "https://rtm.thinx.cloud/assets/thinx/img/ioticons/b_large_" + device.icon + ".png",
            thumb_url: "https://rtm.thinx.cloud/assets/thinx/img/ioticons/w_medium_" + device.icon + ".png",
            mrkdwn_in: ["pretext"],
						color: color,
            fields: [
							{
								title: device.status,
								short: false
							}
						]
        }
    ];


	if ((typeof(device) !== "undefined") && device !== null) {
		body.fields = device;
	}

	var req = https.request(options, (res) => {
		var chunks = [];
		if (typeof(res) === "undefined") {
			console.log("SlackHook: No response.");
		}
		res.on('data', function(chunk) {
			chunks.push(chunk);
		}).on('end', function() {
			console.log("Slackhook Response: " + Buffer.concat(chunks).toString());
		});
	});

	req.on('error', (e) => {
		console.error("SlackHook Error: "+e);
	});
	req.write(JSON.stringify(body));
	req.end();

	return status;
}

// Uncomment to test with `node transformer.js`:
// transformer("", require('./sample_device.json'));
