/* jshint -W097 */
/* jshint -W030 */
/* jshint strict: false */
/* jslint node: true */
/* jslint esversion: 6 */
const WebSocket = require('ws');
const EventEmitter = require('events');

class AlexaWsMqtt extends EventEmitter {

    constructor(options) {
        super();

        this._options = options;
        let serialArr = null;
        if (options.cookie) serialArr = options.cookie.match(/ubid-acbde=([^;]+);/);
        if (!serialArr || !serialArr[1]) {
            this._options.logger && this._options.logger('Alexa-Remote WS-MQTT: Cookie incomplete : ' + JSON.stringify(serialArr));
            return undefined;
        }
        this.accountSerial = serialArr[1];
        this.websocket = null;
        this.pingPongInterval = null;
        this.errorRetryCounter = 0;
        this.reconnectTimeout = null;
        this.pongTimeout = null;
        this.connectionActive = false;
    }

    connect() {
        const urlTime = Date.now();
        const url = `https://dp-gw-na.${this._options.amazonPage}/?x-amz-device-type=ALEGCNGL9K0HM&x-amz-device-serial=${this.accountSerial}-${urlTime}`;
        this.websocket = new WebSocket(url, [],
            {
                'perMessageDeflate': true,
                'protocolVersion': 13,

                'headers': {
                    'Connection': 'keep-alive, Upgrade',
                    'Upgrade': 'websocket',
                    'Host': 'dp-gw-na.' + this._options.amazonPage,
                    'Origin': 'https://alexa.' + this._options.amazonPage,
                    'Pragma': 'no-cache',
                    'Cache-Control': 'no-cache',
                    //'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    //'Accept-Language': 'de,en-US;q=0.7,en;q=0.3',
                    //'Sec-WebSocket-Key': 'aV/ud2q+G4pTtOhlt/Amww==',
                    //'Sec-WebSocket-Extensions': 'permessage-deflate', // 'x-webkit-deflate-frame',
                    //'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 11_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15G77 PitanguiBridge/2.2.219248.0-[HARDWARE=iPhone10_4][SOFTWARE=11.4.1]',
                    'Cookie': this._options.cookie,
                }
            });
        let msgCounter = 0;
        let initTimeout = null;

        this.websocket.on('open', () => {
            this._options.logger && this._options.logger('Alexa-Remote WS-MQTT: Open: ' + url);
            this.connectionActive = false;

            initTimeout = setTimeout(() => {
                this._options.logger && this._options.logger('Alexa-Remote WS-MQTT: Initialization not done within 30s');
                this.websocket.close();
            }, 30000);

            const msg = new Buffer('0x99d4f71a 0x0000001d A:HTUNE');
            //console.log('SEND: ' + msg.toString('ascii'));
            this._options.logger && this._options.logger('Alexa-Remote WS-MQTT: Initialization Msg 1 sent');
            this.websocket.send(msg);
        });

        this.websocket.on('close', (code, reason) => {
            this.websocket = null;
            this.connectionActive = false;
            this._options.logger && this._options.logger('Alexa-Remote WS-MQTT: Close: ' + code + ': ' + reason);
            if (initTimeout) {
                clearTimeout(initTimeout);
                initTimeout = null;
            }
            if (this.pingPongInterval) {
                clearInterval(this.pingPongInterval);
                this.pingPongInterval = null;
            }
            if (this.pongTimeout) {
                clearInterval(this.pongTimeout);
                this.pongTimeout = null;
            }
            if (code === 4001 && reason.startsWith('before - Could not find any')) { // code = 40001, reason = "before - Could not find any vali"
                this._options.logger && this._options.logger('Alexa-Remote WS-MQTT: Cookie invalid!');
                this.emit('disconnect', false, 'Cookie invalid');
                return;
            }
            if (this.errorRetryCounter > 10) {
                this.emit('disconnect', false, 'Too many failed retries. Check cookie and data');
                return;
            }
            const retryDelay = this.errorRetryCounter * 60 + 5;
            this._options.logger && this._options.logger('Alexa-Remote WS-MQTT: Retry Connection in ' + retryDelay + 's');
            this.emit('disconnect', true, 'Retry Connection in ' + retryDelay + 's');
            this.reconnectTimeout = setTimeout(() => {
                this.reconnectTimeout = null;
                this.connect();
            }, retryDelay * 1000);
        });

        this.websocket.on('error', (error) => {
            this._options.logger && this._options.logger('Alexa-Remote WS-MQTT: Error: ' + error);
            this.emit('error', error);
            this.websocket.terminate();
        });

        this.websocket.on('unexpected-response', (request, response) => {
            this._options.logger && this._options.logger('Alexa-Remote WS-MQTT: Unexpected Response: ' + JSON.stringify(response));
        });

        this.websocket.on('message', (data) => {
            if (msgCounter === 0) { // initialization
                let msg = new Buffer('0xa6f6a951 0x0000009c {"protocolName":"A:H","parameters":{"AlphaProtocolHandler.receiveWindowSize":"16","AlphaProtocolHandler.maxFragmentSize":"16000"}}TUNE');
                //console.log('SEND: ' + msg.toString('ascii'));
                this.websocket.send(msg);
                msg = new Buffer('MSG 0x00000361 0x0e414e45 f 0x00000001 0xd7c62f29 0x0000009b INI 0x00000003 1.0 0x00000024 ff1c4525-c036-4942-bf6c-a098755ac82f 0x00000164d106ce6b END FABE');
                //console.log('SEND: ' + msg.toString('ascii'));
                this.websocket.send(msg);
                this._options.logger && this._options.logger('Alexa-Remote WS-MQTT: Initialization Msg 2+3 sent');
            }
            else if (msgCounter === 1) {
                let msg = new Buffer('MSG 0x00000362 0x0e414e46 f 0x00000001 0xf904b9f5 0x00000109 GWM MSG 0x0000b479 0x0000003b urn:tcomm-endpoint:device:deviceType:0:deviceSerialNumber:0 0x00000041 urn:tcomm-endpoint:service:serviceName:DeeWebsiteMessagingService {"command":"REGISTER_CONNECTION"}FABE');
                this._options.logger && this._options.logger('Alexa-Remote WS-MQTT: Initialization Msg 4 (Register Connection) sent');
                //console.log('SEND: ' + msg.toString('ascii'));
                this.websocket.send(msg);

                msg = new Buffer('4D53472030783030303030303635203078306534313465343720662030783030303030303031203078626332666262356620307830303030303036322050494E00000000D1098D8CD1098D8C000000070052006500670075006C0061007246414245', 'hex'); // "MSG 0x00000065 0x0e414e47 f 0x00000001 0xbc2fbb5f 0x00000062 PIN" + 30 + "FABE"
                this._options.logger && this._options.logger('Alexa-Remote WS-MQTT: Send First Ping');
                //console.log('SEND: ' + msg.toString('hex'));
                this.websocket.send(msg);

                this.pingPongInterval = setInterval(() => {
                    let msg = new Buffer('4D53472030783030303030303635203078306534313465343720662030783030303030303031203078626332666262356620307830303030303036322050494E00000000D1098D8CD1098D8C000000070052006500670075006C0061007246414245', 'hex'); // "MSG 0x00000065 0x0e414e47 f 0x00000001 0xbc2fbb5f 0x00000062 PIN" + 30 + "FABE"
                    this._options.logger && this._options.logger('Alexa-Remote WS-MQTT: Send Ping');
                    //console.log('SEND: ' + msg.toString('hex'));
                    this.websocket.send(msg);

                    this.pongTimeout = setTimeout(() => {
                        this.pongTimeout = null;
                        this._options.logger && this._options.logger('Alexa-Remote WS-MQTT: No Pong received after 30s');
                        this.websocket.close();
                    }, 30000);
                }, 180000);
            }
            msgCounter++;
            if (msgCounter < 3) return;

            const incomingMsg = data.toString('ascii');
            if (incomingMsg.includes('PON') && incomingMsg.includes('\u0000R\u0000e\u0000g\u0000u\u0000l\u0000a\u0000r')) {
                this._options.logger && this._options.logger('Alexa-Remote WS-MQTT: Received Pong');
                if (initTimeout) {
                    clearTimeout(initTimeout);
                    initTimeout = null;
                    this._options.logger && this._options.logger('Alexa-Remote WS-MQTT: Initialization completed');
                    this.emit('connect');
                }
                if (this.pongTimeout) {
                    clearTimeout(this.pongTimeout);
                    this.pongTimeout = null;
                }
                this.connectionActive = true;
                return;
            }
            else if (incomingMsg.includes('"payload"')) {
                const payloadArr = incomingMsg.match(/({"payload".*})FABE/);
                if (payloadArr && payloadArr[1]) {
                    let payload = JSON.parse(payloadArr[1]);
                    let command = null;
                    if (payload.payload) {
                        command = payload.command;
                        payload = JSON.parse(payload.payload);
                    }
                    this._options.logger && this._options.logger('Alexa-Remote WS-MQTT: Command ' + command + ': ' + JSON.stringify(payload, null, 4));
                    this.emit('command', command, payload);
                    return;
                }
            }
            this._options.logger && this._options.logger('Alexa-Remote WS-MQTT: Unknown Data (' + msgCounter + '): ' + incomingMsg);
            this.emit('unknown', incomingMsg);
        });
    }

    disconnect() {
        if (!this.websocket) return;
        this.websocket.close();
    }
}

module.exports = AlexaWsMqtt;
