
# alexa-remote

Library to remote control an Alexa (Amazon Echo) device via LAN/WLAN.

Early code version.

<!--
[![NPM version](http://img.shields.io/npm/v/alexa-remote.svg)](https://www.npmjs.com/package/alexa-remote)
[![Tests](http://img.shields.io/travis/soef/alexa-remote/master.svg)](https://travis-ci.org/soef/alexa-remote)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat)](https://github.com/soef/alexa-remote/blob/master/LICENSE)
-->


```js
let Alexa = require('alexa-remote');
let alexa = new Alexa();

/***************************************************************/
// see: https://www.gehrig.info/alexa/Alexa.html
// cookie starts with x-amzn-dat and ends with =" csrf=12345780
let cookie = 'x-amzn-dat.../ /...=" csrf=12345780';

alexa.init({
        cookie: cookie,  // cookie if already known, else can be generated using email/password
        email: '...',    // optional, amazon email for login to get new cookie
        password: '...', // optional, amazon password for login to get new cookie
        bluetooth: true,
        logger: console.log, // optional
        baseUrl: 'layla.amazon.de', // optional, e.g. "pitangui.amazon.com" for amazon.com, default is "layla.amazon.de"
        userAgent: '...', // optional, override used user-Agent for all Requests and Cookie determination
        acceptLanguage: '...', // optional, override Accept-Language-Header for cookie determination
        amazonPage: '...' // optional, override Amazon-Login-Page for cookie determination
    },
    function (err) {
        if (err) {
            console.log (err);
            return;
        }
        for (let device of this.devices) {
            console.log (device._name);
        }
    }
);
````

## Changelog:

### 0.1.x
* (Apollon77) 0.1.2: add logging for used Alexa-URL and user-Agent once at init
* (Apollon77) 0.1.1: rename "shuffle" to "ShuffleCommand" and repeat to RepeatCommand)

### 0.1.0
* (Apollon77) added automatic cookie renewal when email and password are provided
* (Apollon77) added authentication checks by bootstrap call (like [alexa-remote-control](https://github.com/thorsten-gehrig/alexa-remote-control))
* (Apollon77) several fixes
* (Apollon77) added logger option

### 0.0.x
* Versions by soef
