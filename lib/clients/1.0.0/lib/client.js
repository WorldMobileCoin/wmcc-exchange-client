/*!
 * Copyright (c) 2018, Park Alter (pseudonym)
 * Distributed under the MIT software license, see the accompanying
 * file COPYING or http://www.opensource.org/licenses/mit-license.php
 *
 * https://github.com/worldmobilecoin/wmcc-exchange-client
 */

const Render = require('./render');
const Request = require('./request');

'use strict';

class Client {
  constructor(options) {
    this.logger = options.logger.context('exchange-client');
    this.stream = options.stream;

    this.request = new Request({
      logger: options.logger,
      request: this.stream.request,
      stream: this.stream,
      type: options.type
    });

    this.render = new Render({
      logger: options.logger,
      request: this.request,
      stream: this.stream,
      auth: options.auth,
      info: options.info,
      message: options.message,
      server: `${options.type}@${options.server}`,
      prefix: options.config.prefix
    });

    this.request.render = this.render;

    this._init();
  }

  _init() {
    this.stream.on('connect', () => {
      this.render.connected();
    });

    this.stream.on('disconnect', () => {
      this.render.disconnected();
    });

    this.stream.on('error', (err) => {
      console.error(err);
    });

    this.stream.on('logout', (err) => {
      this.render.logout();
    });
  }

  body() {
    return this.render.body();
  }

  handleRequest() {
    this.request.handleData();
  }
}

module.exports = Client;