/*!
 * Copyright (c) 2018, Park Alter (pseudonym)
 * Distributed under the MIT software license, see the accompanying
 * file COPYING or http://www.opensource.org/licenses/mit-license.php
 *
 * https://github.com/worldmobilecoin/wmcc-exchange-client
 */
const {JQuery} = require('./vendor');
const Decimal = require('wmcc-decimal');

class Depth {
  constructor() {
    this.body = null;
    this.price = null;

    this._market = null;
    this._last = null;
    this._prec = 8;
    this._length = 10;
    this._asks = [];
    this._bids = [];
    this._clickElems = [];
  }

  create(market, options = {}) {
    if (options.length)
      this._length = options.length;

    if (options.prec)
      this._prec = options.prec;

    const id = market.replace('/','-').toLowerCase();
    const depth = JQuery(`<div id="depth_${id}" class="market-depth">`);
    const price = JQuery(`<div class="depth-price"></div>`);
    const ask = JQuery(`<table class="depth-ask" name="_asks">`);
    const bid = JQuery(`<table class="depth-bid" name="_bids">`);

    depth.html(price);
    [ask, bid].forEach((element) => {
      const pair = market.split('/');
      const head = `<tr><th></th><th>Price <small>${pair[1]}</small></th><th>Amount <small>${pair[0]}</small></th><th>Total <small>${pair[0]}</small></th></tr>`;
      const item = element.attr('name');

      element.html(head);

      for (let i = 0; i < this._length; i++) {
        const row = JQuery('<tr>');
        element.append(row);

        this[item].push(row);
      }

      depth.append(element);
    });

    this.body = depth;

    this.price = price;
    this._market = market;

    return this;
  }

  updateDepth(clean, last, market) {
    if (market !== this._market)
      this.create(market);

    let items, side;

    if (clean)
      this._last = this._toObject(last);
    else
      this._merge(this._toObject(last));

    for (let orders of Object.values(this._last)) {
      let count = Decimal.zero(), total = Decimal.zero();
      items = items ? this._bids : this._asks;
      side = side ? 'bid': 'ask';

      for (let amount of Object.values(orders))
        total = total.add(amount);

      const keys = Object.keys(orders);

      if (!keys.length)
        JQuery(`.offer-empty.${side}`).show();
      else
        JQuery(`.offer-empty.${side}`).hide();

      for (let i=0; i<this._length; i++) {
        const amount = orders[keys[i]];

        if (!amount) {
          items[i].html('');
          continue;
        }

        count = count.add(amount);
        items[i].html(`<td class="percent ${side}">&nbsp;</td><td>${keys[i]}</td><td>${amount}</td><td>${count.toString()}</td>`);
        items[i].find('.percent').css({'width': `calc(${count.div(total).mul(100).toFixed(2)}% - 10px)`});

        items[i].on('click', () => {
          this._onClick(keys[i]);
        });
      }
    }
  }

  _merge(curr) {
    ['asks', 'bids'].forEach((side) => {
      const list = Object.assign(this._last[side], curr[side]);

      for (let [key, val] of Object.entries(list))
        if (Decimal.zero().cmp(val) === 0) delete list[key];

      this._last[side] = this._sort(list, side);
    });
  }

  _toObject(last) {
    ['asks', 'bids'].forEach((side) => {
      const list = {};
      if (!last[side])
        return list;

      for (let [price, amount] of last[side]) {
        price = new Decimal(price).toFixed(this._prec);
        list[price] = amount;
      }

      last[side] = this._sort(list, side);
    });

    return last;
  }

  _sort(list, side) {
    return Object.keys(list).sort((a, b) => {
      return (side === 'asks') ? a - b: b - a;
    }).reduce((sort, key) => (sort[key] = list[key], sort), {});
  }

  updatePrice(market, price, direction) {
    if (market !== this._market)
      return;

    this.price.removeClass('price_up price_down');

    price = new Decimal(price).toFixed(this._prec);

    if (direction < 0)
      this.price.addClass('price_up');
    else if (direction > 0)
      this.price.addClass('price_down');

    this.price.html(`<label>Current Price:</label><span>${price}</span>`);

    this.price.on('click', () => {
      this._onClick(price);
    });
  }

  _onClick(value) {
    this._clickElems.forEach((element) => {
      element.val(value);
    });
  }

  onClick(elements) {
    this._clickElems = elements;
  }

  static create(market, length) {
    return new Depth().create(market, length);
  }
}

module.exports = Depth;