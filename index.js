/*!
 * Copyright (c) 2018, Park Alter (pseudonym)
 * Distributed under the MIT software license, see the accompanying
 * file COPYING or http://www.opensource.org/licenses/mit-license.php
 *
 * https://github.com/worldmobilecoin/wmcc-exchange-client
 */

'use strict';

/**
 * NOTE: DONT MAKE CHANGE TO THIS FILE
 * We can simply use iframe, embeded or object but it has security issues.
 * @module wmcc-exchange-client
 */

const Stream = require('./lib/main/stream');

class Exchange {
  constructor(options) {
    this.config = options.config;
    this._server = new Map();
    this.options = options;

    this.stream = new Stream(options);
    this.client = null;

    this._init();
  }

  _init() {
    const settings = [
      'exchange-server-real',
      'exchange-server-demo'
    ];

    const _default = this.config.getDefault().Exchange;

    for (let setting of settings) {
      const server = this.config.array(setting, _default[setting]);
      this._server.set(setting, server);
    }
  }

  use(version, host, port, type) {
    //const req = this.stream.request;
    if (!this.stream.request)
      return;

    const Client = require(`./lib/clients/${version}`);
    this.client = new Client({
      logger: this.options.logger,
      config: this.config,
      stream: this.stream,
      auth: this.options.auth,
      message: this.options.message,
      info: this.info,
      server: `${host}:${port}`,
      type: type
    });
    //this.options, this.config, this.stream);
    //this.client.render.info = this.info;

    this.stream.emit('connect');
    this.client.handleRequest();
  }

  getServerList(type) {
    return this._server.get(`exchange-server-${type}`);
  }

  async connect(host, port, type) {
    const version = await this.stream.connect(host, port);
    this.use(version, host, port, type);
  }

  disconnect() {
    this.stream.disconnect();
  }

  latestVersion() {
    return require('./package.json').version;
  }

  isConnected() {
    return this.stream.isConnected();
  }

  body() {
    return this.client.body();
  }
}

module.exports = Exchange;