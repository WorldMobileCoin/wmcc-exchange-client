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
const Packet = require('./packet');

class Request extends Events {
  constructor(options) {
    super();

    this.logger = options.logger.context('client-request');

    this.render = null;
    this.lastVisit = null;
    this.userId = null;

    this._buffer = '';
    this._bufferLimit = 20 << 20;
    this._request = options.request;
    this._stream = options.stream;
    this._accountType = options.type;
    this._packet = new Packet(this.logger);
    this._id = 4000000000;
  }

  logout() {
    this.userId = null;
    this._stream.disconnect();
  }

  handleData() {
    this._request.on('data', (data) => {
      if (this._buffer.length > this._bufferLimit) {
        this._buffer = '';
        this.logger.error('Reached buffer limit, buffer cleaned up.');
      }

      this._buffer += data;

      const lines = this._buffer.split(/\n+/);
      this._buffer = lines.pop();

      for (let line of lines) {
        if (line.length === 0)
          continue;

        let json;
        try {
          json = JSON.parse(line);
        } catch (e) {
          this.logger.error('Parse stream failed, data: %s', line.toString().trim());
        }

        if (json.error) {
          if (Array.isArray(json.error))
            json.error.code = json.error[0],
            json.error.message = json.error[1];

          this.render.notifyError(json.error);
          return this.logger.error('Receive error, code: %d, message: %s', json.error.code, json.error.message);
        }

        const packet = this._packet.get(json.id);

        this.emit('data', {
          method: json.method || packet.method,
          json: json,
          args: packet ? packet.args : null
        });

        this._packet.delete(json.id);
      }
    });
  }

  send(packet) {
    Assert(typeof packet === 'object');

    if (!this._stream.isConnected())
      return;

    if (!packet.id)
      packet.id = this._id++;

    this._request.write(JSON.stringify(packet)+'\n');
    this._packet.put(packet.id, packet);
  }

  marketList() {
    const packet = {
      method: 'market.list',
      params: []
    }

    this.send(packet);
  }

  assetList() {
    const packet = {
      method: 'asset.list',
      params: []
    }

    this.send(packet);
  }

  assetSubscribe(assets) {
    const packet = {
      method: 'asset.subscribe',
      params: [assets]
    }

    this.send(packet);
  }

  stateSubscribe(market) {
    const packet = {
      method: 'state.subscribe',
      params: [market],
      args: market
    }

    this.send(packet);
  }

  dealsSubscribe(markets) {
    const packet = {
      method: 'deals.subscribe',
      params: [markets],
      args: markets
    }

    this.send(packet);
  }

  priceSubscribe(markets) {
    const packet = {
      method: 'price.subscribe',
      params: [markets],
      args: markets
    }

    this.send(packet);
  }

  depthSubscribe(market, limit, interval) {
    const packet = {
      method: 'depth.subscribe',
      params: [market, limit, interval],
      args: market
    }

    this.send(packet);
  }

  klineQuery(market, start, end, period, frame) {
    const packet = {
      method: 'kline.query',
      params: [market, start, end, period],
      args: frame
    }

    this.send(packet);
  }

  klineSubscribe(market, period) {
    const packet = {
      method: 'kline.subscribe',
      params: [market, period],
      args: market
    }

    this.send(packet);
  }

  orderQuery(market, offset, limit) {
    const packet = {
      method: 'order.query',
      params: [market, offset, limit],
      args: market
    }

    this.send(packet);
  }

  orderHistory(market, start, end, offset, limit, options) {
    const packet = {
      method: 'order.history',
      params: [market, start, end, offset, limit],
      args: options
    }

    this.send(packet);
  }

  orderSubscribe(markets) {
    const packet = {
      method: 'order.subscribe',
      params: [markets],
      args: markets
    }

    this.send(packet);
  }

  orderCancel(orderId, row, market, table, offset, limit, options) {
    const packet = {
      method: 'order.cancel',
      params: [market, orderId],
      args: [row, market, table, offset, limit, options]
    }

    this.send(packet);
  }

  orderDeals(orderId, offset, limit, market, side, row) {
    const packet = {
      method: 'order.deals',
      params: [orderId, offset, limit],
      args: [orderId, market, side, row]
    }

    this.send(packet);
  }

  businessDeposit(element, asset) {
    const packet = {
      method: 'business.deposit',
      params: [asset],
      args: [element, asset]
    }

    this.send(packet);
  }

  businessReload(submit, asset) {
    const packet = {
      method: 'business.reload',
      params: [asset],
      args: [submit, asset]
    }

    this.send(packet);
  }

  businessHistory(asset, business, start, end, offset, limit, options) {
    const packet = {
      method: 'business.history',
      params: [asset, business, start, end, offset, limit],
      args: options
    }

    this.send(packet);
  }

  register(address, period) {
    const packet = {
      method: 'auth.register',
      params: [address, period]
    }

    this.send(packet);
  }

  signature(id, signature) {
    const packet = {
      method: 'auth.signature',
      params: [id, signature]
    }

    this.send(packet);
  }

  assetQuery(assets) {
    const packet = {
      method: 'asset.query',
      params: [assets]
    }

    this.send(packet);
  }

  assetQuery(assets) {
    const packet = {
      method: 'asset.query',
      params: [assets]
    }

    this.send(packet);
  }

  orderPutLimit(market, side, amount, price, source) {
    const packet = {
      method: 'order.put_limit',
      params: [market, side, amount, price, source]
    }

    this.send(packet);
  }

  orderPutMarket(market, side, amount, source) {
    const packet = {
      method: 'order.put_market',
      params: [market, side, amount, source]
    }

    this.send(packet);
  }

  businessWithdraw(asset, amount) {
    const packet = {
      method: 'business.withdraw',
      params: [asset, amount]
    }

    this.send(packet);
  }

  isAuth() {
    return this.userId ? true: false;
  }

  isReal() {
    return (this._accountType === 'real') ? true : false;
  }
}

module.exports = Request;