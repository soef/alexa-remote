/* jshint -W097 */
/* jshint -W030 */
/* jshint strict: false */
/* jslint node: true */
/* jslint esversion: 6 */
"use strict";

const https = require('https');
const querystring = require('querystring');
const os = require('os');

function AlexaRemote (cookie, csrf) {
    if (!(this instanceof AlexaRemote)) return new AlexaRemote (cookie, csrf);

    this.serialNumbers = {};
    this.names = {};
    this.friendlyNames = {};
    this.devices = undefined;
    this.lastAuthCheck = null;

    this.setCookie = function (_cookie, _csrf) {
        cookie = _cookie;
        if (_csrf) {
            csrf = _csrf;
            return;
        }
        let ar = cookie.match(/csrf=([^;]+)/);
        if (!ar || ar.length < 2) ar = cookie.match(/csrf=([^;]+)/);
        if (!csrf && ar && ar.length >= 2) {
            csrf = ar[1];
        }
    };

    if (cookie) this.setCookie(cookie);
    let baseUrl = 'layla.amazon.de';
    let self = this;
    let opts = {};

    this.init = function (cookie, callback) {
        if (typeof cookie === 'object') {
            self._options = opts = cookie;
            if (!self._options.userAgent) {
                let platform = os.platform();
                if (platform === 'win32') {
                    self._options.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:99.0) Gecko/20100101 Firefox/99.0';
                }
                /*else if (platform === 'darwin') {
                    self._options.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/57.0.2987.133 Safari/537.36';
                }*/
                else {
                    self._options.userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36';
                }
            }
            self._options.amazonPage = self._options.amazonPage || 'amazon.de';

            cookie = opts.cookie;
        }
        self._options.logger && self._options.logger('Alexa-Remote: Use as User-Agent: ' + self._options.userAgent);
        self._options.logger && self._options.logger('Alexa-Remote: Use as Login-Amazon-URL: ' + self._options.amazonPage);
        function getCookie(callback) {
            if (!opts.cookie) {
                self._options.logger && self._options.logger('Alexa-Remote: No cookie, but email and password, generate cookie');
                opts.cookieJustCreated = true;
                self.generateCookie(opts.email, opts.password, function(err, res) {
                    if (!err && res) {
                        cookie = res.cookie;
                        opts.csrf = res.csrf;
                        opts.cookie = res.cookie;
                        alexaCookie.stopProxyServer();
                        return callback (null);
                    }
                    callback(err);
                });
                return;
            }
            self._options.logger && self._options.logger('Alexa-Remote: cookie was provided');
            callback(null);
        }

        getCookie((err) => {
            if (typeof callback === 'function') callback = callback.bind(this);
            if (err) {
                self._options.logger && self._options.logger('Alexa-Remote: Error from retrieving cookies');
                return callback && callback(err);
            }
            if (opts.baseUrl) baseUrl = opts.baseUrl;
            self._options.logger && self._options.logger('Alexa-Remote: Use as Base-URL: ' + baseUrl);
            self.setCookie(cookie, opts.csrf);
            if (!csrf) return callback && callback(new Error('no csrf found'));
            this.checkAuthentication((authenticated) => {
                self._options.logger && self._options.logger('Alexa-Remote: Authentication checked: ' + authenticated);
                if (! authenticated && !opts.cookieJustCreated) {
                    self._options.logger && self._options.logger('Alexa-Remote: Cookie was set, but authentication invalid, retry with email/password ...');
                    delete opts.cookie;
                    delete opts.csrf;
                    return this.init(opts, callback);
                }
                self.lastAuthCheck = Date.now();
                this.prepare(callback);
            });
        });
    };

    this.prepare = function (callback) {
        this.getAccount((err, result) => {
            if (!err && result && Array.isArray(result)) {
                result.forEach ((account) => {
                    if (!this.commsId) this.commsId = account.commsId;
                    if (!this.directId) this.directId = account.directId;
                });
            }

            function getNotifications(cb) {
                if (opts.notifications) return self.getNotifications(function(err, res) { cb (!err && res ? res.notifications : null); });
                cb(null);
            }

            getNotifications((notifications) => {
                this.getWakeWords ((err, wakeWords) => {
                    if (!err && wakeWords) wakeWords = wakeWords.wakeWords;
                    this.getAutomationRoutines ((err, routines) => {
                        this.routines = [];
                        if (!err && routines) {
                            for (let i = 0; i < routines.length; i++) {
                                let routine = routines[i];
                                if (routine['@type'] !== 'com.amazon.alexa.behaviors.model.Automation') {
                                    self._options.logger && self._options.logger('Ignore unknown type of Automation Routine ' + routine['@type']);
                                    continue;
                                }
                                if (!routine.sequence) {
                                    self._options.logger && self._options.logger('Automation Routine has no sequence ' + JSON.stringify(routine));
                                    continue;
                                }
                                let name = routine.name;
                                if (!name && routine.triggers && routine.triggers[0].payload && routine.triggers[0].payload.utterance) {
                                    name = routine.triggers[0].payload.utterance;
                                }
                                else if (!name && routine.triggers && routine.triggers[0].payload && routine.triggers[0].payload.schedule && routine.triggers[0].payload.schedule.triggerTime) {
                                    name = routine.triggers[0].payload.schedule.triggerTime;
                                    if (name.length === 6) name = name.replace(/^({0-9}{2})({0-9}{2})({0-9}{2})$/, '$1:$2:$3');
                                    if (routine.triggers[0].payload.schedule.recurrence) name += ` ${routine.triggers[0].payload.schedule.recurrence}`;
                                }
                                else {
                                    self._options.logger && self._options.logger('Ignore unknown type of Automation Routine Trigger' + JSON.stringify(routine.triggers.payload));
                                    name = 'Unknown';
                                }
                                routine.friendlyName = name;
                                let idSplit = routine.automationId.split('.');
                                routine.friendlyAutomationId = idSplit[idSplit.length - 1];
                                this.routines.push(routine);
                            }
                        }
                        this.getDevices((err, result) => {
                            if (!err && result && Array.isArray(result.devices)) {
                                let customerIds = {};
                                this.devices = result.devices;
                                result.devices.forEach((device) => {
                                    this.serialNumbers [device.serialNumber] = device;
                                    let name = device.accountName;
                                    this.names [name] = device;
                                    this.names [name.toLowerCase()] = device;
                                    if (device.deviceTypeFriendlyName) {
                                        name += ' (' + device.deviceTypeFriendlyName + ')';
                                        this.names [name] = device;
                                        this.names [name.toLowerCase()] = device;
                                    }
                                    device._orig = JSON.parse(JSON.stringify(device));
                                    device._name = name;
                                    device.sendCommand = this.sendCommand.bind(this, device);
                                    device.setTunein = this.setTunein.bind(this, device);
                                    device.rename = this.renameDevice.bind(this, device);
                                    device.setDoNotDisturb = this.setDoNotDisturb.bind(this, device);
                                    device.delete = this.deleteDevice.bind(this, device);
                                    if (device.deviceTypeFriendlyName) this.friendlyNames[device.deviceTypeFriendlyName] = device;
                                    if (customerIds[device.deviceOwnerCustomerId] === undefined) customerIds[device.deviceOwnerCustomerId] = 0;
                                    customerIds[device.deviceOwnerCustomerId] += 1;
                                    if (this.version === undefined) this.version = device.softwareVersion;
                                    if (this.customer === undefined) this.customer = device.deviceOwnerCustomerId;
                                    device.isControllable = (
                                        device.capabilities.includes('AUDIO_PLAYER') ||
                                        device.capabilities.includes('AMAZON_MUSIC') ||
                                        device.capabilities.includes('TUNE_IN')
                                    );
                                    device.hasMusicPlayer = (
                                        device.capabilities.includes('AUDIO_PLAYER') ||
                                        device.capabilities.includes('AMAZON_MUSIC')
                                    );

                                    if (notifications && Array.isArray(notifications)) {
                                        notifications.forEach((noti) => {
                                            if (noti.deviceSerialNumber === device.serialNumber) {
                                                if (device.notifications === undefined) device.notifications = [];
                                                device.notifications.push(noti);
                                                noti.set = self.changeNotification.bind(self, noti);
                                            }
                                        });
                                    }

                                    if (Array.isArray (wakeWords)) wakeWords.forEach ((o) => {
                                        if (o.deviceSerialNumber === device.serialNumber && typeof o.wakeWord === 'string') {
                                            device.wakeWord = o.wakeWord.toLowerCase();
                                        }
                                    });

                                });
                                this.ownerCustomerId = Object.keys(customerIds)[0];
                            }
                            if (opts.bluetooth) {
                                this.getBluetooth((err, res) => {
                                    if (err || !res || !Array.isArray(res.bluetoothStates)) return callback && callback (err);
                                    res.bluetoothStates.forEach((bt) => {
                                        if (bt.pairedDeviceList && this.serialNumbers[bt.deviceSerialNumber]) {
                                            this.serialNumbers[bt.deviceSerialNumber].bluetoothState = bt;
                                            bt.pairedDeviceList.forEach((d) => {
                                                bt[d.address] = d;
                                                d.connect = function (on, cb) {
                                                    self[on ? 'connectBluetooth' : 'disconnectBluetooth'] (self.serialNumbers[bt.deviceSerialNumber], d.address, cb);
                                                };
                                                d.unpaire = function (val, cb) {
                                                    self.unpaireBluetooth (self.serialNumbers[bt.deviceSerialNumber], d.address, cb);
                                                };
                                            });
                                        }
                                    });
                                    callback && callback();
                                });

                            } else {
                                callback && callback ();
                            }
                        });
                    });
                });
            });
        });
        return this;
    };

    let alexaCookie;
    this.generateCookie = function (email, password, callback) {
        if (!alexaCookie) alexaCookie = require('alexa-cookie');
        alexaCookie.generateAlexaCookie(email, password, self._options, callback);
    };

    this.timestamp = this.now = function () {
        return new Date().getTime();
    };

    this.httpsGet = function (noCheck, path, callback, flags = {}) {
        if (typeof noCheck !== 'boolean') {
            flags = callback;
            callback = path;
            path = noCheck;
            noCheck = false;
        }
        // bypass check because set or last check done before less then 10 mins
        if (noCheck || (Date.now() - self.lastAuthCheck) < 600000) {
            self._options.logger && self._options.logger('Alexa-Remote: No authentication check needed (time elapsed ' + (Date.now() - self.lastAuthCheck) + ')');
            return self.httpsGetCall(path, callback, flags);
        }
        self.checkAuthentication(function(authenticated) {
            if (authenticated) {
                self._options.logger && self._options.logger('Alexa-Remote: Authentication check successfull');
                self.lastAuthCheck = Date.now();
                return self.httpsGetCall(path, callback, flags);
            }
            if (self._options.email && self.options.password) {
                self._options.logger && self._options.logger('Alexa-Remote: Authentication check Error, but email and password, get new cookie');
                delete self._options.csrf;
                delete self._options.cookie;
                self.init(self._options, function(err) {
                    if (err) {
                        self._options.logger && self._options.logger('Alexa-Remote: Authentication check Error and renew unsuccessfull. STOP');
                        return callback(new Error('Cookie invalid, Renew unsuccessfull'));
                    }
                    return self.httpsGet(path, callback, flags);
                });
            }
            self._options.logger && self._options.logger('Alexa-Remote: Authentication check Error and no email and password. STOP');
            callback(new Error('Cookie invalid'));
        });
    };

    this.httpsGetCall = function (path, callback, flags = {}) {

        let options = {
            host: baseUrl,
            path: '',
            method: 'GET',
            timeout: 10000,
            headers: {
                'User-Agent' : self._options.userAgent,
                'Content-Type': 'application/json; charset=UTF-8',
                'Referer': `https://alexa.${self._options.amazonPage}/spa/index.html`,
                'Origin': `https://alexa.${self._options.amazonPage}`,
                //'Content-Type': 'application/json',
                //'Connection': 'keep-alive', // new
                'csrf' : csrf,
                'Cookie' : cookie
            }
        };

        path = path.replace(/[\n ]/g, '');
        if (!path.startsWith('/')) {
            path = path.replace(/^https:\/\//, '');
            //let ar = path.match(/^([^\/]+)(\/.*$)/);
            let ar = path.match(/^([^\/]+)([\/]*.*$)/);
            options.host = ar[1];
            path = ar[2];
        } else {
            options.host = baseUrl;
        }
        let time = this.now();
        path = path.replace(/%t/g, time);

        options.path = path;
        options.method = flags.method? flags.method : flags.data ? 'POST' : 'GET';

        if (flags.headers) Object.keys(flags.headers).forEach(n => {
            options.headers [n] = flags.headers[n];
        });

        const logOptions = JSON.parse(JSON.stringify(options));
        delete logOptions.headers.Cookie;
        delete logOptions.headers.csrf;
        delete logOptions.headers['User-Agent'];
        delete logOptions.headers['Content-Type'];
        delete logOptions.headers.Referer;
        delete logOptions.headers.Origin;
        self._options.logger && self._options.logger('Alexa-Remote: Sending Request with ' + JSON.stringify(logOptions) + ((options.method === 'POST') ? 'and data=' + flags.data : ''));
        let req = https.request(options, (res) => {
            let body  = "";

            res.on('data', function(chunk) {
                body += chunk;
            });

            res.on('end', function() {

                let ret;
                if (typeof callback === 'function') {
                    if(!body) return callback.length >= 2 && callback(new Error('no body'), null);
                    try {
                        ret = JSON.parse(body);
                    } catch(e) {
                        if (callback.length >= 2) return callback (new Error('no JSON'), body);
                    }
                    self._options.logger && self._options.logger('Alexa-Remote: Response: ' + JSON.stringify(ret));
                    if (callback.length >= 2) return callback (null, ret);
                    callback(ret);
                }
            });
        });

        req.on('error', function(e) {
            if(typeof callback === 'function' && callback.length >= 2) {
                return callback (e, null);
            }
        });
        if (flags && flags.data) {
            req.write(flags.data);
        }
        req.end();
    };
}

AlexaRemote.prototype.checkAuthentication = function (callback) {
    this.httpsGetCall ('/api/bootstrap?version=0', function (err, res) {
        if (res && res.authentication && res.authentication.authenticated !== undefined) {
            return callback(res.authentication.authenticated);
        }
        return callback(false);
    });
};


AlexaRemote.prototype.getDevices = function (callback) {
    this.httpsGet ('/api/devices-v2/device?cached=true&_=%t', callback);
};

AlexaRemote.prototype.getCards = function (limit, beforeCreationTime, callback) {
    if (typeof limit === 'function') {
        callback = limit;
        limit = 10;
    }
    if (typeof beforeCreationTime === 'function') {
        callback = beforeCreationTime;
        beforeCreationTime = '%t';
    }
    if (beforeCreationTime === undefined) beforeCreationTime = '%t';
    this.httpsGet (`/api/cards?limit=${limit}&beforeCreationTime=${beforeCreationTime}000&_=%t`, callback);
};

AlexaRemote.prototype.getMedia = function (serialOrName, callback) {
    let dev = this.find(serialOrName, callback);
    if (!dev) return;
    this.httpsGet (`/api/media/state?deviceSerialNumber=${dev.serialNumber}&deviceType=${dev.deviceType}&screenWidth=1392&_=%t`, callback);
};

AlexaRemote.prototype.getPlayerInfo = function (serialOrName, callback) {
    let dev = this.find(serialOrName, callback);
    if (!dev) return;
    this.httpsGet (`/api/np/player?deviceSerialNumber=${dev.serialNumber}&deviceType=${dev.deviceType}&screenWidth=1392&_=%t`, callback);
};

AlexaRemote.prototype.getList = function (serialOrName, listType, options, callback) {
    let dev = this.find(serialOrName, callback);
    if (!dev) return;
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    this.httpsGet (`
        /api/todos?size=${options.size || 100}
        &startTime=${options.startTime || ''}
        &endTime=${options.endTime || ''}
        &completed=${options.completed || false}
        &type=${listType}
        &deviceSerialNumber=${dev.serialNumber}
        &deviceType=${dev.deviceType}
        &_=%t`,
        callback);
};

AlexaRemote.prototype.getLists = function (serialOrName, options, callback) {
    let dev = this.find(serialOrName, callback);
    if (!dev) return;
    this.getList(dev, 'TASK', options, function(err, res) {
        let ret = {};
        if (!err && res) {
            ret.tasks = res;
        }
        this.getList(dev, 'SHOPPING_ITEM', options, function(err, res) {
            ret.shoppingItems = res;
            callback.length >= 2 ? callback(null, ret) : callback(ret);
        });
    });
};

AlexaRemote.prototype.getWakeWords = function (callback) {
    this.httpsGet (`/api/wake-word?_=%t`, callback);
};

AlexaRemote.prototype.getReminders =
    AlexaRemote.prototype.getNotifications = function (cached, callback) {
        if (typeof cached === 'function') {
            callback = cached;
            cached = true;
        }
        if (cached === undefined) cached = true;
        this.httpsGet (`/api/notifications?cached=${cached}&_=%t`, callback);
    };


AlexaRemote.prototype.changeNotification = function (notification, state) {
    switch (typeof state) {
        case 'object':

            break;
        case 'date':
            notification.alarmTime = state.getTime();
            notification.originalTime = `${_00 (state.getHours ())}:${_00 (state.getMinutes ())}:${_00 (state.getSeconds ())}.000`;
            break;
        case 'boolean':
            notification.status = state ? 'ON' : 'OFF';
            break;
        case 'string':
            let ar = state.split(':');
            let time = ((ar[0] * 60) + ar.length>1 ? ar[1] : 0) * 60 + ar.length > 2 ? ar[2] : 0;
            let date = new Date(notification.alarmTime);
            date.setHours(time / 3600);
            date.setMinutes(date / 60 ^ 60);
            date.setSeconds(date ^ 60);
            notification.alarmTime = date.getTime();
            notification.originalTime = `${_00 (date.getHours ())}:${_00 (date.getMinutes ())}:${_00 (date.getSeconds ())}.000`;
            break;
    }
    let flags = {
        data: JSON.stringify (notification),
        method: 'PUT'
    };
    this.httpsGet (`https://alexa.amazon.de/api/notifications/${notification.id}`, function(err, res) {
            //callback(err, res); TODO
        },
        flags
    );
};


AlexaRemote.prototype.getDoNotDisturb =
AlexaRemote.prototype.getDeviceStatusList = function (callback) {
    this.httpsGet (`/api/dnd/device-status-list?_=%t`, callback);
};

// alarm volume
AlexaRemote.prototype.getDeviceNotificationState = function (serialOrName, callback) {
    let dev = this.find(serialOrName, callback);
    if (!dev) return;
    this.httpsGet (`/api/device-notification-state/${dev.deviceType}/${dev.softwareVersion}/${dev.serialNumber}&_=%t`, callback);
};

AlexaRemote.prototype.getBluetooth = function (cached, callback) {
    if (typeof cached === 'function') {
        callback = cached;
        cached = true;
    }
    if (cached === undefined) cached = true;
    this.httpsGet (`/api/bluetooth?cached=${cached}&_=%t`, callback);
};

AlexaRemote.prototype.tuneinSearchRaw = function (query, callback) {
    this.httpsGet (`/api/tunein/search?query=${query}&mediaOwnerCustomerId=${this.ownerCustomerId}&_=%t`, callback);
};

AlexaRemote.prototype.tuneinSearch = function (query, callback) {
    query = querystring.escape(query);
    this.tuneinSearchRaw(query, callback);
};

//CHECKED!
AlexaRemote.prototype.setTunein = function (serialOrName, guideId, contentType, callback) {
    if (typeof contentType === 'function') {
        callback = contentType;
        contentType = 'station';
    }
    let dev = this.find(serialOrName, callback);
    if (!dev) return;
    this.httpsGet (`/api/tunein/queue-and-play
       ?deviceSerialNumber=${dev.serialNumber}
       &deviceType=${dev.deviceType}
       &guideId=${guideId}
       &contentType=${contentType}
       &callSign=
       &mediaOwnerCustomerId=${this.ownerCustomerId}`,
        callback,
        { method: 'POST' });
};

AlexaRemote.prototype.getHistory =
AlexaRemote.prototype.getActivities = function (options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    this.httpsGet (`/api/activities` +
        `?startTime=${options.startTime || ''}` +
        `&size=${options.size || 1}` +
        `&offset=${options.offset || 1}`,
        (err, result) => {
            if (err || !result) return callback.length >= 2 && callback(err, result);

            let ret = [];
            for (let r=0; r<result.activities.length; r++) {
                let res = result.activities[r];
                let o = {
                    description: JSON.parse (res.description),
                    data: res
                };
                if (!o.description) continue;
                if (options.filter) {
                    o.description.summary = (o.description.summary || '').trim ();
                    switch (o.description.summary) {
                        case 'stopp':
                        case 'alexa':
                        case ',':
                        case '':
                            continue;
                    }
                }
                for (let i=0; i<res.sourceDeviceIds.length; i++) {
                    o.serialNumber = res.sourceDeviceIds[i].serialNumber;
                    o.name = this.serialNumbers[o.serialNumber].accountName;
                    let wakeWord = this.serialNumbers[o.serialNumber];
                    if (wakeWord) wakeWord = wakeWord.wakeWord;
                    if (wakeWord && o.description.summary.startsWith(wakeWord)) {
                        o.description.summary = o.description.summary.substr(wakeWord.length).trim();
                    }
                    if (o.description.summary) ret.push (o);
                }
            }
            if (typeof callback === 'function') return callback.length >= 2 ? callback (err, ret) : callback(ret);
        }
    );
};

AlexaRemote.prototype.getAccount = function (callback) {
    this.httpsGet (`https://alexa-comms-mobile-service.amazon.com/accounts`, callback);
};

AlexaRemote.prototype.getConversations = function (options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = undefined;
    }
    if (options === undefined) options = {};
    if (options.latest === undefined) options.latest = true;
    if (options.includeHomegroup === undefined) options.includeHomegroup = true;
    if (options.unread === undefined) options.unread = false;
    if (options.modifiedSinceDate === undefined) options.modifiedSinceDate = '1970-01-01T00:00:00.000Z';
    if (options.includeUserName === undefined) options.includeUserName = true;

    this.httpsGet (
        `https://alexa-comms-mobile-service.amazon.com/users/${this.commsId}/conversations
        ?latest=${options.latest}
        &includeHomegroup=${options.includeHomegroup}
        &unread=${options.unread}
        &modifiedSinceDate=${options.modifiedSinceDate}
        &includeUserName=${options.includeUserName}`,
        function (err, result) {
            callback (err, result);
        });
};

AlexaRemote.prototype.connectBluetooth = function (serialOrName, btAddress, callback) {
    let dev = this.find(serialOrName, callback);
    if (!dev) return;
    let flags = {
        data: JSON.stringify({ bluetoothDeviceAddress: btAddress}),
        method: 'POST'
    };
    this.httpsGet (`/api/bluetooth/pair-sink/${dev.deviceType}/${dev.serialNumber}`, callback, flags);
};

AlexaRemote.prototype.disconnectBluetooth = function (serialOrName, btAddress, callback) {
    let dev = this.find(serialOrName, callback);
    if (!dev) return;
    let flags = {
        data: JSON.stringify({ bluetoothDeviceAddress: btAddress}),
        method: 'POST'
    };
    this.httpsGet (`/api/bluetooth/disconnect-sink/${dev.deviceType}/${dev.serialNumber}`, callback, flags);
};

AlexaRemote.prototype.setDoNotDisturb = function (serialOrName, enabled, callback) {
    let dev = this.find(serialOrName, callback);
    if (!dev) return;
    let flags = {
        data: JSON.stringify({
            deviceSerialNumber: dev.serialNumber,
            deviceType: dev.deviceType,
            enabled: enabled
        }),
        method: 'PUT'
    };
    this.httpsGet (`//api/dnd/status`, callback, flags);
};

AlexaRemote.prototype.find = function(serialOrName, callback) {
    if (typeof serialOrName === 'object') return serialOrName;
    let dev = this.serialNumbers[serialOrName];
    if (dev !== undefined) return dev;
    dev = this.names[serialOrName];
    if (!dev) dev = this.names [serialOrName.toLowerCase()];
    if (!dev) dev = this.friendlyNames[serialOrName];
    if (!dev) callback.length >= 2 && callback('wrong serial or name', null);
    return dev;
};

AlexaRemote.prototype.setAlarmVolume = function (serialOrName, volume, callback) {
    let dev = this.find(serialOrName, callback);
    if (!dev) return;
    let flags = {
        data: JSON.stringify ({
            deviceSerialNumber: dev.serialNumber,
            deviceType: dev.deviceType,
            softwareVersion: dev.softwareVersion,
            volumeLevel: volume
        }),
        method: 'PUT'
    };
    this.httpsGet (`/api/device-notification-state/${dev.deviceType}/${this.version}/${dev.serialNumber}`, callback, flags);
};


AlexaRemote.prototype.sendCommand =
AlexaRemote.prototype.sendMessage = function (serialOrName, command, value, callback) {
    let dev = this.find(serialOrName, callback);
    if (!dev) return;

    const commandObj = { contentFocusClientId: null };
    switch (command) {
        case 'play':
        case 'pause':
        case 'next':
        case 'previous':
        case 'forward':
        case 'rewind':
            commandObj.type = command.substr(0, 1).toUpperCase() + command.substr(1) + 'Command';
            break;
        case 'volume':
            commandObj.type = 'VolumeLevelCommand';
            commandObj.volumeLevel = ~~value;
            if (commandObj.volumeLevel < 0 || commandObj.volumeLevel > 100) {
                return callback(new Error('Volume needs to be between 0 and 100'));
            }
            break;
        case 'shuffle':
            commandObj.type = 'ShuffleCommand';
            commandObj.shuffle = value === 'on';
            break;
        case 'repeat':
            commandObj.type = 'RepeatCommand';
            commandObj.repeat = value === 'on';
            break;
        default:
            return;
    }

    this.httpsGet (`/api/np/command?deviceSerialNumber=${dev.serialNumber}&deviceType=${dev.deviceType}`,
        callback,
        {
            method: 'POST',
            data: JSON.stringify(commandObj)
        }
    );
};


AlexaRemote.prototype.sendSequenceCommand = function (serialOrName, command, value, callback) {
    let dev = this.find(serialOrName, callback);
    if (!dev) return;

    if (typeof value === 'function') {
        callback = value;
        value = null;
    }

    let seqCommandObj;
    if (typeof command === 'object') {
        seqCommandObj = command.sequence;
    }
    else {
        seqCommandObj = {
            '@type': 'com.amazon.alexa.behaviors.model.Sequence',
            'startNode': {
                '@type': 'com.amazon.alexa.behaviors.model.OpaquePayloadOperationNode',
                'operationPayload': {
                    'deviceType': dev.deviceType,
                    'deviceSerialNumber': dev.serialNumber,
                    'locale': 'de-DE', // TODO!!
                    'customerId': this.ownerCustomerId
                }
            }
        };
        switch (command) {
            case 'weather':
                seqCommandObj.startNode.type = 'Alexa.Weather.Play';
                break;
            case 'traffic':
                seqCommandObj.startNode.type = 'Alexa.Traffic.Play';
                break;
            case 'flashbriefing':
                seqCommandObj.startNode.type = 'Alexa.FlashBriefing.Play';
                break;
            case 'goodmorning':
                seqCommandObj.startNode.type = 'Alexa.GoodMorning.Play';
                break;
            case 'singasong':
                seqCommandObj.startNode.type = 'Alexa.SingASong.Play';
                break;
            case 'tellstory':
                seqCommandObj.startNode.type = 'Alexa.TellStory.Play';
                break;
            case 'speak':
                seqCommandObj.startNode.type = 'Alexa.Speak';
                value = value.replace(/ä/g,'ae');
                value = value.replace(/ä/g,'Ae');
                value = value.replace(/ö/g,'oe');
                value = value.replace(/Ö/g,'Oe');
                value = value.replace(/ü/g,'ue');
                value = value.replace(/Ü/g,'Ue');
                value = value.replace(/ß/g,'ss');
                value = value.replace(/&/g,'und');
                value = value.replace(/é/g,'e');
                value = value.replace(/á/g,'a');
                value = value.replace(/ó/g,'o');
                value = value.replace(/[^-a-zA-Z0-9_,?! ]/g,'');
                value = value.replace(/ /g,'_');
                seqCommandObj.startNode.operationPayload.textToSpeak = value;
                break;
            default:
                return;
        }
    }

    const reqObj = {
        'behaviorId': seqCommandObj.sequenceId ? command.automationId : 'PREVIEW',
        'sequenceJson': JSON.stringify(seqCommandObj),
        'status': 'ENABLED'
    };
    reqObj.sequenceJson = reqObj.sequenceJson.replace(/"deviceType":"ALEXA_CURRENT_DEVICE_TYPE"/g, `"deviceType":"${dev.deviceType}"`);
    reqObj.sequenceJson = reqObj.sequenceJson.replace(/"deviceSerialNumber":"ALEXA_CURRENT_DSN"/g, `"deviceSerialNumber":"${dev.serialNumber}"`);
    reqObj.sequenceJson = reqObj.sequenceJson.replace(/"customerId":"ALEXA_CUSTOMER_ID"/g, `"customerId":"${this.ownerCustomerId}"`);
    reqObj.sequenceJson = reqObj.sequenceJson.replace(/"locale":"ALEXA_CURRENT_LOCALE"/g, `"locale":"de-DE"`);

    this.httpsGet (`/api/behaviors/preview`,
        callback,
        {
            method: 'POST',
            data: JSON.stringify(reqObj)
        }
    );
};


AlexaRemote.prototype.getAutomationRoutines = function (callback) {
    this.httpsGet (`/api/behaviors/automations`, callback);
};


AlexaRemote.prototype.executeAutomationRoutine = function (serialOrName, automationId, callback) {
    for (let i = 0; i < this.routines.length; i++) {
        if (this.routines[i].automationId === automationId) {
            return this.sendSequenceCommand(serialOrName, this.routines[i], callback);
        }
    }
    return callback(new Error('Automation-ID ' + automationId + ' not found'));
};

AlexaRemote.prototype.sendTextMessage = function (conversationId, text, callback) {
    let o = {
        type: 'message/text',
        payload: {
            text: text
        }
    };

    this.httpsGet (`https://alexa-comms-mobile-service.amazon.com/users/${this.commsId}/conversations/${conversationId}/messages`,
        callback,
        {
            method: 'POST',
            data: JSON.stringify (o),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            }
            // Content-Type: application/x-www-form-urlencoded;
            // charset=UTF-8",#\r\n
            // Referer: https://alexa.amazon.de/spa/index.html'
        }
    );
};


AlexaRemote.prototype.setList = function (serialOrName, listType, value, callback) {
    let dev = this.find(serialOrName, callback);
    if (!dev) return;
    let o = {
        type: listType,
        text: value,
        createdDate: this.now(),
        complete: false,
        deleted: false
    };

    this.httpsGet (`/api/todos?deviceSerialNumber=${dev.serialNumber}&deviceType=${dev.deviceType}`,
        callback,
        {
            method: 'POST',
            data: JSON.stringify (o),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            }
            // Content-Type: application/x-www-form-urlencoded;
            // charset=UTF-8",#\r\n
            // Referer: https://alexa.amazon.de/spa/index.html'
        }
    );
};

function _00(val) {
    let s = val.toString();
    while (s.length) s = '0'+s;
    return s;
}

AlexaRemote.prototype.setReminder = function (serialOrName, timestamp, label, callback) {
    let dev = this.find(serialOrName, callback);
    if (!dev) return;

    let time = new Date(timestamp);
    let o = {
        type: '"Reminder',
        status: "ON",
        alarmTime: timestamp,
        originalTime: `${_00 (time.getHours ())}:${_00 (time.getMinutes ())}:${_00 (time.getSeconds ())}.000`,
        originalDate: `${time.getFullYear ()}-${_00 (time.getMonth () + 1)}.${_00 (time.getDay ())}`,
        deviceSerialNumber: dev.serialNumber,
        deviceType: dev.deviceType,
        reminderLabel: label,
        isSaveInFlight: true,
        id: 'createReminder',
        createdDate: this.now()
    };
    this.httpsGet (`/api/notifications/createReminder`,
        callback,
        {
            method: 'PUT',
            data: JSON.stringify (o),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            }
            // Content-Type: application/x-www-form-urlencoded;
            // charset=UTF-8",#\r\n
            // Referer: https://alexa.amazon.de/spa/index.html'
        }
    );
};

AlexaRemote.prototype.getHomeGroup = function (callback) {
    this.httpsGet (`https://alexa-comms-mobile-service.amazon.com/users/${this.commsId}/identities?includeUserName=true`, callback);
};

/*
function test () {
    AlexaRemote.prototype.getFeatureAlertLocation = function (callback) {
        alexa.httpsGet (`https://alexa.amazon.de/api/feature-alert-location?`, callback);
    };

    let alexa = AlexaRemote ().init (cookie, function () {

        alexa.getHomeGroup (function (err, res) {
            res = res;
        });
        // alexa.getPlayer('wohnzimmer', function(err, res) {
        //     res = res;
        // })
        alexa.httpsGet (`https://alexa.amazon.de/api/devices-v2/device?cached=true&"`, function (err, res) {
            res = res;
        });


        //alexa.sendCommand('Wohnzimmer', 'volume', 20, function(res) {
        //alexa.sendCommand('Küche (Sonos)', 'play', 0, function(res) {
        alexa.sendCommand ('wohnzimmer', 'play', 0, function (res) {
            res = res;
        });

        // alexa.tuneinSearch('wdr 4', alexa.ownerCustomerId, function(err, res) {
        //     res = res;
        //
        //     alexa.setTunein ('Schlafzimmer', res.browseList[0].id, alexa.ownerCustomerId, function(err, res) {
        //         res = res;
        //     });
        // })


        return;
        alexa.getHistory ({filter: true}, function (res) {
            res = res;
        });
        alexa.tuneinSearch ('wdr 4', alexa.ownerCustomerId, function (err, res) {
            res = res;

            //alexa.setTunein ('Schlafzimmer', res.browseList[0].id, alexa.ownerCustomerId, function(err, res) {
            alexa.setTunein ('Wohnzimmer', res.browseList[0].id, alexa.ownerCustomerId, function (err, res) {
                res = res;
            });
        });
        // alexa.getDeviceStatusList((ret) => {
        //     ret = ret;
        // })
        // alexa.getDevices((err, res) => {
        //     res = res;
        // });
        // alexa.getNotifications((err, res) => {
        //     res = res;
        // })
        // alexa.getBluetooth((err, res) => {
        //     res = res;
        // })
    });

}
*/

AlexaRemote.prototype.getDevicePreferences = function (callback) {
    this.httpsGet ('https://alexa.amazon.de/api/device-preferences?cached=true&_=%t', callback);
};

AlexaRemote.prototype.getSmarthomeDevices = function (callback) {
    this.httpsGet ('https://alexa.amazon.de/api/phoenix?_=%t', function (err, res) {
        if (err || !res || !res.networkDetail) return callback(err, res);
        try {
            res = JSON.parse(res.networkDetail);
        } catch(e) {
            return callback('invalid JSON');
        }
        if (!res.locationDetails) return callback('locationDetails not found');
        callback (err, res.locationDetails);
    });
};

AlexaRemote.prototype.renameDevice = function (serialOrName, newName, callback) {
    let dev = this.find(serialOrName, callback);
    if (!dev) return;
    let o = {
        accountName: newName,
        serialNumber: dev.serialNumber,
        deviceAccountId: dev.deviceAccountId,
        deviceType: dev.deviceType,
        //deviceOwnerCustomerId: oo.deviceOwnerCustomerId
    };
    this.httpsGet (`https://alexa.amazon.de/api/devices-v2/device/${dev.serialNumber}`,
        callback,
        {
            method: 'PUT',
            data: JSON.stringify (o),
        }
    );
};


AlexaRemote.prototype.deleteSmarthomeDevice = function (smarthomeDevice, callback) {
    let flags = {
        method: 'DELETE'
        //data: JSON.stringify (o),
    };
    this.httpsGet (`https://alexa.amazon.de/api/phoenix/appliance/${smarthomeDevice}`, callback, flags);
};

AlexaRemote.prototype.deleteAllSmarthomeDevices = function (callback) {
    let flags = {
        method: 'DELETE'
        //data: JSON.stringify (o),
    };
    this.httpsGet (`https://alexa.amazon.de/api/phoenix`, callback, flags);
};



AlexaRemote.prototype.discoverSmarthomeDevice = function (callback) {
    let flags = {
        method: 'POST'
        //data: JSON.stringify (o),
    };
    this.httpsGet ('https://alexa.amazon.de/api/phoenix/discovery', callback, flags);
};


AlexaRemote.prototype.unpaireBluetooth = function (serialOrName, btAddress, callback) {
    let dev = this.find(serialOrName, callback);
    if (!dev) return;
    let flags = {
        method: 'POST',
        data: JSON.stringify ({
            bluetoothDeviceAddress: btAddress,
            bluetoothDeviceClass: "OTHER"
        })
    };
    this.httpsGet (`https://alexa.amazon.de/api/bluetooth/unpair-sink/${dev.deviceType}/${dev.serialNumber}`, callback, flags);
};

AlexaRemote.prototype.deleteDevice = function (serialOrName, callback) {
    let dev = this.find(serialOrName, callback);
    if (!dev) return;
    let flags = {
        method: 'DELETE',
        data: JSON.stringify ({
            deviceType: dev.deviceType
        })
    };
    this.httpsGet (`https://alexa.amazon.de/api/devices/device/${dev.serialNumber}?deviceType=${dev.deviceType}`, callback, flags);
};

module.exports = AlexaRemote;
