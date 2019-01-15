/*!
 * Copyright (c) 2018, Park Alter (pseudonym)
 * Distributed under the MIT software license, see the accompanying
 * file COPYING or http://www.opensource.org/licenses/mit-license.php
 *
 * https://github.com/worldmobilecoin/wmcc-exchange-client
 */

'use strict';

const Assert = require('assert');
const Events = require('events');
//--
const WebSocket = require('wmcc-socket');
//--
const Request = require('./request');

class Stream extends Events {
  constructor(options) {
    super();

    this.options = new StreamOptions(options);

    this.request = null;
    this.socket = WebSocket.socket();

    this._opened = false;
    this._connected = false;
    this._sequence = 0;
  }

  connect(host, port, ssl = false) {
    return new Promise(async (resolve, reject) => {
      Assert(!this._opened, 'Already opened.');
      this._opened = true;

      this.socket.on('connect', async () => {
        this._connected = true;
        this.request = this._request(host, port, ssl);

        const version = await this._handleVersion();
        resolve(version);
      });

      this.socket.on('disconnect', () => {
        this.emit('disconnect');
      });

      this.socket.on('error', (err) => {
        this._handleError(err, reject, port, host, ssl);
      });

      this.socket.connect(port, host, ssl);
    });
  }

  disconnect() {
    Assert(this._opened, 'Not opened.');
    this._opened = false;
    this._connected = false;

    try {
      this.socket.destroy();
      this.request.destroy();
    } catch (e) {;}

    this.removeAllListeners();
    this.socket = WebSocket.socket();
  }

  _request(host, port, ssl) {
    this._sequence++;

    const request = Request.stream({
      method: 'POST',
      ssl: ssl,
      host: host,
      port: port,
      path: this.options.path + '/',
      username: this.options.username,
      password: this.options.password,
      headers: this.options.headers,
      timeout: this.options.timeout,
      limit: this.options.limit,
      pool: true,
      query: this.options.token
        ? { token: this.options.token }
        : undefined
    });

    return request;
  }

  hook(...args) {
    return this.socket.hook(...args);
  }

  async call(...args) {
    return this.socket.call(...args);
  }

  bind(...args) {
    return this.socket.bind(...args);
  }

  fire(...args) {
    return this.socket.fire(...args);
  }

  /** todo: handle version change*/
  _handleVersion() {
    return new Promise((resolve) => {
      this.request.once('data', (data) => {
        const json = JSON.parse(data);

        resolve(json.result);
      });

      this.request.write(`{"method":"server.version", "params": [], "id": null}\n`);
    })
  }

  _handleError(err, reject, port, host, ssl) {
    if (this._connected)
      return this.emit('logout');

    this.disconnect();
    return reject(`Unable to connect ...`);
  }

  isConnected() {
    return this._connected;
  }
}

/**
 * Stream Options
 */
class StreamOptions {
  constructor(options) {
    this.path = '/';
    this.headers = null;
    this.username = null;
    this.password = null;
    this.id = null;
    this.token = null;
    this.timeout = 0;
    this.limit = null;
    this.reconnect = 5000;

    if (options)
      this.fromOptions(options);
  }

  fromOptions(options) {
    if (typeof options === 'string')
      options = { url: options };

    Assert(options && typeof options === 'object');

    if (options.path != null) {
      Assert(typeof options.path === 'string');
      this.path = options.path;
    }

    if (options.headers != null) {
      Assert(typeof options.headers === 'object');
      this.headers = options.headers;
    }

    if (options.apiKey != null) {
      Assert(typeof options.apiKey === 'string');
      this.password = options.apiKey;
    }

    if (options.key != null) {
      Assert(typeof options.key === 'string');
      this.password = options.key;
    }

    if (options.username != null) {
      Assert(typeof options.username === 'string');
      this.username = options.username;
    }

    if (options.password != null) {
      Assert(typeof options.password === 'string');
      this.password = options.password;
    }

    if (options.id != null) {
      Assert(typeof options.id === 'string');
      this.id = options.id;
    }

    if (options.token != null) {
      Assert(typeof options.token === 'string');
      this.token = options.token;
    }

    if (options.timeout != null) {
      Assert(typeof options.timeout === 'number');
      this.timeout = options.timeout;
    }

    if (options.limit != null) {
      Assert(typeof options.limit === 'number');
      this.limit = options.limit;
    }

    if (options.reconnect != null) {
      Assert(typeof options.reconnect === 'number');
      this.reconnect = options.reconnect;
    }

    return this;
  }
}

module.exports = Stream;