/*!
 * Copyright (c) 2018, Park Alter (pseudonym)
 * Distributed under the MIT software license, see the accompanying
 * file COPYING or http://www.opensource.org/licenses/mit-license.php
 *
 * https://github.com/worldmobilecoin/wmcc-exchange-client
 */

'use strict';

const Assert = require('assert');
const FS = require('fs');
const Path = require('path');
//const Chart = require('./chart');
const Depth = require('./depth');
const Table = require('./table');
const {JQuery} = require('./vendor');
const Decimal = require('wmcc-decimal');

Decimal.DP = 8;

class Render {
  constructor(options) {
    this._body =  JQuery('<exchange></exchange>');

    this.logger = options.logger.context('client-render');
    this.request = options.request;
    this.auth = options.auth;
    this.message = options.message;
    this.info = options.info;

    this._server = options.server;
    this._prefix = Path.join(options.prefix, 'exchange');

    this.depth = null;

    this._market = null;
    this._frame = null;
    this._methods = new Map();
    this._elements = new Map();
    this._tabsMap = new Map();
    this._initiated = false;
    this._sessions = {};
    this._sessionLen = 0;
    this._markets = {};
    this._assets = {};
    this._orders = {};
    this._assetMap = new Map();
    this._orderMap = new Map();
    this._orderRecords = {};

    this._init();
  }

  _init() {
    this._loadCss();
    this._loadSession();

    this._methods.set('market.list', this._marketList.bind(this));

    this._methods.set('asset.list', this._assetList.bind(this));
    this._methods.set('asset.subscribe', this._assetSubscribe.bind(this));
    this._methods.set('asset.update', this._assetUpdate.bind(this));

    this._methods.set('state.subscribe', this._stateSubscribe.bind(this));
    this._methods.set('state.update', this._stateUpdate.bind(this));

    this._methods.set('deals.subscribe', this._dealsSubscribe.bind(this));
    this._methods.set('deals.update', this._dealsUpdate.bind(this));

    this._methods.set('price.subscribe', this._priceSubscribe.bind(this));
    this._methods.set('price.update', this._priceUpdate.bind(this));

    this._methods.set('depth.subscribe', this._depthSubscribe.bind(this));
    this._methods.set('depth.update', this._depthUpdate.bind(this));

    this._methods.set('kline.query', this._klineQuery.bind(this));
    this._methods.set('kline.subscribe', this._klineSubscribe.bind(this));
    this._methods.set('kline.update', this._klineUpdate.bind(this));

    this._methods.set('order.query', this._orderQuery.bind(this));
    this._methods.set('order.history', this._orderHistory.bind(this));
    this._methods.set('order.subscribe', this._orderSubscribe.bind(this));
    this._methods.set('order.update', this._orderUpdate.bind(this));
    this._methods.set('order.cancel', this._orderCancel.bind(this));
    this._methods.set('order.deals', this._orderDeals.bind(this));

    this._methods.set('business.history', this._businessHistory.bind(this));

    this._methods.set('auth.register', this._authRegister.bind(this));
    this._methods.set('auth.signature', this._authSignature.bind(this));

    this._methods.set('order.put_limit', this._orderPutLimit.bind(this));
    this._methods.set('order.put_market', this._orderPutMarket.bind(this));

    this._methods.set('business.reload', this._businessReload.bind(this));
    this._methods.set('business.deposit', this._businessDeposit.bind(this));
    this._methods.set('business.withdraw', this._businessWithdraw.bind(this));

    this.request.on('data', (data) => {
      this._fire(data);
    });
  }

  _fire(data) {
    const {method, json, args} = data;

    const fn = this._methods.get(method);

    if (Array.isArray(json.params))
      return fn(...json.params);

    fn(json, args);
  }

  body() {
    if (!this._initiated)
      this.init();

    return this._body;
  }

  init() {
    this._initiated = true;

    this._setAddrs();
    this._write(this._header());
    this._write(this._container(Render.PAGE.HOME), 'append');
    this.request.assetList();
    this.request.marketList();
  }

  /**
   * Abstract
   */
  connected() {
    ;
  }

  /**
   * Abstract
   */
  disconnected() {
    ;
  }

  _loadCss() {
    const path = Path.resolve(__dirname, '../static/css/main.css');
    const link = JQuery('<link>');
    link.attr({
      rel: "stylesheet",
      type: "text/css",
      href: path
    });

    JQuery('head').append(link);
  }

  _sessionPath() {
    return Path.join(this._prefix, 'sessions.json');
  }

  _loadSession() {
    try {
      mkdirp(this._prefix);
      this._sessions = require(this._sessionPath());
    } catch (e) {;}
  }

  _saveSession(address, json) {
    return new Promise((resolve, reject) => {
      let session = this._sessions[this._server][address];
      if (!session)
        this._sessions[this._server][address] = session = [];

      session.push(json);

      try {
        const text = JSON.stringify(this._sessions, null, 2);
        FS.writeFile(this._sessionPath(), text, (err) => {
          if (err)
            reject(err);

          resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  async _setAddrs() {
    const wallet = this.info.getWallet();
    const paths = await wallet.getAccountPaths(this.info.getAccountName());

    this._addresses = {};
    for (let path of paths) {
      let expired = 0, balance = 0;
      const address = path.toAddress();
      const server = this._sessions[this._server];

      if (!server)
        this._sessions[this._server] = {};

      const sessions = this._sessions[this._server][address];

      if (sessions)
        expired = sessions[sessions.length - 1].expired;

      if (expired)
        this._sessionLen++;

      const key = `${this._server}-${address}`;
      if (localStorage)
        balance = localStorage.getItem(key) || 0;

      this._addresses[address] = {
        balance: balance,
        session: expired
      }
    }
  }

  _container(page, market) {
    const element = JQuery('<div class="container"></div>');
    const loading = this._loading(element, 'Load market list...');

    this._elements.set('container', {
      page: page,
      element: element,
      market: market
    });

    return element;
  }

  _write(el, type) {
    if (type){
      Assert(typeof type === 'string');
      return this._body[type](el);
    }

    this._body.html([el, `<div id="exchange_notification"></div>`]);
  }

  _notification(obj) {
    const close = JQuery(`<i class="glyph-icon flaticon-remove top-right"></i>`);
    const notification = JQuery(`<div${obj.class?' class="'+obj.class+'"':''}><h1>${obj.title}</h1><span>${obj.text}</span></div>`);

    notification.append(close);
    JQuery("#exchange_notification").append(notification);

    close.on('click', () => { notification.remove(); });
    setTimeout(() => { notification.remove(); }, 5 * 1000);
  }

  notifyError(error) {
    const obj = {
      title: "Error",
      text: `<a><b>Message</b>: ${error.message}</a><a><b>Code</b>: ${Math.abs(error.code)}</a>`,
      class: "error stream"
    }

    this._notification(obj);
  }

  _header() {
    const header = JQuery('<div class="header"></div>');
    const right = JQuery(`<div class="right"></div>`);
    const search = JQuery('<input placeholder="Search for coin / token" />');
    const logout = JQuery(`<i class="glyph-icon flaticon-logout" title="Exchange Logout"></i>`);
    const home = JQuery('<a class="button-top"><i class="glyph-icon flaticon-home"></i>Markets</a>');
    const login = JQuery(`<a class="button-top" name="_authentication" for="authentication"><i class="glyph-icon flaticon-account-lock"></i>Login</a>`);
    const funds = JQuery(`<a class="button-top" name="_balances" for="balances"><i class="glyph-icon flaticon-wallet"></i>Funds</a>`).hide();
    const orders = JQuery(`<a class="button-top" name="_marketOrder" for="orders"><i class="glyph-icon flaticon-record"></i>Orders</a>`).hide();

    home.on('click', () => {
      const container = this._elements.get('container');
      container.element.remove();

      this._write(this._container(Render.PAGE.HOME), 'append');
      this.request.assetList();
      this.request.marketList();
    });

    const dropdown = JQuery('<ul class="dropdown"><li class="empty">Enter coin/token ticker or name</li></ul>').hide();

    const _search = (value) => {
      const list = [];
      if (!value)
        return list;

      for (let [ticker, asset] of Object.entries(this._assets)) {
        if (ticker.includes(value) || asset.fullname.toUpperCase().includes(value))
          for (let market of Object.keys(this._markets))
            if (market.includes(ticker)) list.push(market);
      }

      return list;
    }

    let timer;
    search.on('keydown', () => {
      timer = setTimeout(() => {
        const value = search.val();
        value ? dropdown.find('.empty').hide() : dropdown.find('.empty').show();
        const list = _search(value.toUpperCase());
        dropdown.find('li:not(.empty)').remove();

        if (!list.length && value)
          return dropdown.append('<li class="not-found">Coin/token not found</li>');

        dropdown.find('.not-found').remove();

        for (let market of list) {
          const [asset, base] = market.split('/');
          const assetName = this._assets[asset];
          const baseName = this._assets[base];

          if (!assetName || !baseName) continue;
          const icon = `<img src="${Path.resolve(__dirname, `../static/image/icon/${asset}.ico`)}">`;
          const link = JQuery(`<li><span>${asset}<small>/</small>${base}</span><label>${assetName.fullname}</label>|<label>${baseName.fullname}</label>${icon}</li>`);
          this._linkSearch(link, market, search);
          dropdown.append(link);
        }
      }, 1000);
    });


    search.on('focusin', () => {
      search.val('');
      dropdown.show();
    });

    search.on('focusout', () => {
      setTimeout(() => {
        dropdown.hide();
      }, 500);
    });

    [login, funds, orders].forEach((element) => {
      element.on('click', () => {
        const slide = JQuery(`.slide-top`);
        const current = element.attr("for");
        if (JQuery(`.slide-top #${current}`).length) {
          return slide.animate({"left":"100%"}, "fast", () => {
            slide.nextAll().fadeIn();
            slide.remove();
          });
        }

        const fn = element.attr("name");
        slide.length ? slide.animate({"left":"100%"}, "fast", () => { slide.remove();this[fn]() }): this[fn]();
      });
    });

    this._elements.set('header', {
      login: login,
      funds: funds,
      orders: orders,
      home: home,
      search: search
    });

    right.html([home, funds, orders, login, logout]);
    header.append([search, dropdown, right]);

    logout.on('click', () => {
      this.logout();
    });

    return header;
  }

  logout() {
    this.request.logout();
    const wrapper = JQuery(`<div id="disconnected"><div></div></div>`);
    const logout = JQuery(`<div class="button-flat-dark">Logout</div>`);

    wrapper.children().html(["<h1>Warning</h1><span>Disconnected from server. Please login to continue...</span>", logout]);
    this._body.prepend(wrapper);

    logout.on('click', () => {
      JQuery(`[page="menu-top_exchange"]`).removeAttr('active').trigger('click');
    });
  }

  _marketList(json) {
    if (json.error)
      return;

    const container = this._elements.get('container');

    for (let market of json.result) {
      if (this._orderMap.has(market.name))
        continue;

      this._orderMap.set(market.name, {
        fn: [],
        records: {},
        offset: 0,
        limit: Render.ORDER.PAGE_MAX
      });
    }

    if (container.page === Render.PAGE.HOME)
      this._marketHome(container.element, json.result);
    else if (container.page === Render.PAGE.TRADE)
      this._marketTrade(container.element, json.result, container.market);
  }

  _authentication() {
    const parent = JQuery(`<div class="slide-top"></div>`);
    const wrapper = JQuery('<div id="authentication">');
    const tab = JQuery(`<div class="tab"></div>`);
    const tabItems = [
      JQuery(`<a name="_authReg"${this._sessionLen ? '': ' class="active"'}>Register</a>`),
      JQuery(`<a name="_authSes"${this._sessionLen ? ' class="active"': ''}>Session</a>`)
    ];

    const body = JQuery('<div>');
    const buttons = JQuery('<div class="bottom">');
    const cancel = JQuery('<a class="button red">Cancel</a>');
    const auth = this._tabs(tabItems, wrapper, buttons.append(cancel));

    tab.html(tabItems);
    body.html([tab, auth, buttons]);
    parent.html(wrapper.html(body));

    this._slide(parent, cancel);
  }

  _authReg(wrapper, buttons) {
    const texts = [
      `<div class="text"><span>Register new session for an address. Each address represent an individual trading account.</span>`,
      `<span>Select one of your address below to prove the ownership:</span></div>`
    ];

    const [table, result, otp] = this._authSelectors('auth-register', 'authentic');

    for (let [address, item] of Object.entries(this._addresses)) {
      const trow = table.trow()[0];
      const now = Math.floor(Date.now()/1000);
      const value = item.session ? item.session > now ? 'active' : address : address;
      const cls = item.session ? item.session > now ? "active" : "expired" : "available";
      const date =  item.session ? new Date(item.session * 1000).format("d-m-Y H:i:s"): "-";

      const selects = [
        `<input type="radio" id="auth-register-${address}" name="auth-register" value="${value}">`,
        `<label for="auth-register-${address}">${address}</label>`,
        `<div class="check"></div>`
      ];

      trow.append([
        `<td><div class="radio">${selects.join('')}<div></td>`,
        //`<td value="${item.balance}"><span>${item.balance} wmcc</span></td>`,
        `<td value="${item.session}" title="${cls.charAt(0).toUpperCase()}${cls.slice(1)}" class="${cls}"><span>${date}</span></td>`
      ]);

      trow.addClass(cls);
      table.append(trow);
    }

    buttons.find('.submit').remove();
    const submit = JQuery(`<a class="button submit">Submit</a>`);
    buttons.prepend(submit);

    submit.on('click', () => {
      const address = table.body.find('input:checked');
      if (!address.length || !address.val())
        return result.addClass('error').html(`Select an address`);

      if (address.val() === 'active')
        return result.addClass('error').html(`Session is active, please click "Session" tab to use this address`);

      if (!otp.val()) {
        setTimeout(() => {otp.removeClass('red')}, 5000);
        return otp.addClass('red');
      }

      const passphrase = this.auth.getPassphrase(otp.val());
      if (!passphrase)
        return result.addClass('error').html(`Invalid otp, ${this.auth.otp.retry} of ${this.auth.otp.maxtry} tries`);

      const loading = this._loading(wrapper, 'Register session for address...');
      this.request.register(address.val(), 7 * 24 * 60 * 60);
      this._elements.set('auth_register', {
        loading: loading,
        result: result,
        address: address.val(),
        passphrase: passphrase,
        wrapper: wrapper,
        options: { count: 0, max: 10 }
      });
    });

    return [texts.join(''), ...table.render(), result, otp, '<i class="glyph-icon flaticon-otp bottom"></i>'];
  }

  _authSes(wrapper, buttons) {
    const texts = [
      `<div class="text"><span>Use existing session. Each address represent an individual trading account.</span>`,
      `<span>Select one of your address below to prove the ownership:</span></div>`
    ];

    const [table, result, otp] = this._authSelectors('auth-session', 'authentic');

    for (let [address, item] of Object.entries(this._addresses)) {
      if (!item.session)
        continue;

      const trow = table.trow()[0];
      const now = Math.floor(Date.now()/1000);
      const cls = item.session > now ? "active" : "expired";
      const date = new Date(item.session * 1000).format("d-m-Y H:i:s");

      const selects = [
        `<input type="radio" id="auth-session-${address}" name="auth-session" value="${address}">`,
        `<label for="auth-session-${address}">${address}</label>`,
        `<div class="check"></div>`
      ];

      trow.append([
        `<td><div class="radio">${selects.join('')}<div></td>`,
        //`<td value="${item.balance}"><span>${item.balance} wmcc</span></td>`,
        `<td value="${item.session}" title="${cls.charAt(0).toUpperCase()}${cls.slice(1)}" class="${cls}"><span>${date}</span></td>`
      ]);

      trow.addClass(cls);
      table.append(trow);
    }

    buttons.find('.submit').remove();
    const submit = JQuery(`<a class="button submit">Submit</a>`);
    buttons.prepend(submit);

    submit.on('click', async () => {
      const address = table.body.find('input:checked');
      if (!address.length || !address.val())
        return result.addClass('error').html(`Select an address`);

      if (!otp.val()) {
        setTimeout(() => {otp.removeClass('red')}, 5000);
        return otp.addClass('red');
      }

      const passphrase = this.auth.getPassphrase(otp.val());
      if (!passphrase)
        return result.addClass('error').html(`Invalid otp, ${this.auth.otp.retry} of ${this.auth.otp.maxtry} tries`);

      const loading = this._loading(wrapper);

      try {
        const sessions = this._sessions[this._server][address.val()];
        const session = sessions[sessions.length-1];
        await this._authRegSes(session.id, session.hash, address.val(), passphrase);
      } catch (err) {
        result.addClass('error').html(err.message || err);
        loading.element.remove();
      }

      this._elements.set('auth_register', {
        loading: loading,
        result: result,
        address: address.val(),
        passphrase: passphrase,
        wrapper: wrapper,
        options: { count: 0, max: 10 }
      });
    });

    return [texts.join(''), ...table.render(), result, otp, '<i class="glyph-icon flaticon-otp bottom"></i>'];
  }

  _authSelectors(id, cls) {
    const table = new Table({
      head: ['Address', /*'*Balance',*/ 'Session Expired', ''],
      sort: [0, 1/*, 2*/],
      type: ['string', /*'decimal',*/ 'decimal'],
      id: id,
      class: cls,
      page: [0, 8]
    });

    const result = JQuery('<div class="result">');
    const otp = JQuery('<input class="bottom" type="text" name="otp" maxlength="6" placeholder="One Time Password (OTP)">');

    otp.on('input', () => {
      otp.val(otp.val().replace(/[^0-9]/g,''));
    });

    return [table, result, otp];
  }

  async _authRegSes(id, hash, address, passphrase) {
    const wallet = this.info.getWallet();
    const key = await wallet.getPrivateKey(address, passphrase.toString('hex'));
    if (!key)
      throw new Error('Address not owned by wallet');

    const options = {
      privKey: key.getPrivateKey(),
      compressed: true
    }

    const message = new this.message(hash, address, options);
    const sig = message.sign();

    this.request.signature(id, sig.signature.toString('base64'));
  }

  async _authRegister(json) {
    const {address, passphrase, result, loading} = this._elements.get('auth_register');

    if (json.error) {
      result.addClass('error').html(json.error.message);
      loading.element.remove();
      return;
    }

    try {
      this._saveSession(address, json.result);
      await this._authRegSes(json.result.id, json.result.hash, address, passphrase);
    } catch (err) {
      result.addClass('error').html(err.message || err);
      loading.element.remove();
    }

    loading.element.find('span').html('Signing address for authentication...');
  }

  _authSignature(json) {
    const {result, loading, wrapper, options} = this._elements.get('auth_register');
    loading.element.remove();

    if (json.error) {
      result.addClass('error').html(json.error.message);
      return;
    }

    this.request.userId = json.result;
    options.count = 0;

    const parent = wrapper.parent();
    parent.animate({"left":"100%"}, "fast", () => {
      const {login, funds, orders} = this._elements.get('header');
      login.remove(), funds.show(), orders.show();
      parent.nextAll().fadeIn();
      parent.remove();
      this._subscribe();
    });

    const panel = this._elements.get('trading_panel');

    if (!panel)
      return;

    this._elements.get('trading_auth').remove();
    panel.items[0].removeClass('active').trigger('click');
  }

  authRenew() {
    const {result, address, options} = this._elements.get('auth_register');

    if (options.max > options.count)
      return this.request.register(address, 7 * 24 * 60 * 60);

    options.count++;
    return result.addClass('error').html(`Login failed, please try again later or contact support.`);
  }

  _subscribe() {
    for (let market of Object.keys(this._markets))
      this.request.orderQuery(market, 0, Render.ORDER.MAX_QUERY);

    this.request.orderSubscribe(Object.keys(this._markets));
    this.request.assetSubscribe(Object.keys(this._assets));
  }

  _ordersSubscribed() {
    if (!this.request.isAuth())
      return;

    const openOrder = this._elements.get('open_orders');
    const orderHistory = this._elements.get('order_history');

    if (openOrder)
      this._tradeOpenOrders(openOrder.market, openOrder.table);

    if (!orderHistory)
      return;

    const end = Math.floor(Date.now()/1000);
    const start = end - Render.HISTORY.TIME_MAX;
    this.request.orderHistory(orderHistory.market, start, end+60*60, ...orderHistory.page, {type: 'trade'});
  }

  _marketHome(element, markets) {
    const period = 24 * 60 * 60;
    const table = new Table({
      head: ['Pair', 'Price', '24h High', '24h Low', '24h Change', '24h Volume', '24h Value', ''],
      sort: [0, 1, 2, 3, 4, 5, 6],
      type: ['string', 'decimal', 'decimal', 'decimal', 'decimal', 'decimal', 'decimal'],
      id: 'home-markets',
      class: 'sticky'
    });

    const _markets = new Map();

    let odd = false;
    for(let market of markets) {
      const [asset, base] = market.name.split('/');
      const assetName = this._assets[asset];
      const baseName = this._assets[base];

      const title = (!assetName || !baseName) ? '': ` title="${assetName.fullname} | ${baseName.fullname}"`;
      const links = [
        JQuery(`<a class="link-trade"${title}>${asset}<small>/</small><span class="pair-base">${base}</span></a>`),
        JQuery('<a class="button-flat-dark">Trade</a>')
      ];

      const trow = table.trow()[0];

      this._linkTrade(links, market.name);
      this._markets[market.name] = market;

      trow.append(table.tdata());
      trow.find(odd?'td:nth-child(odd)':'td:nth-child(even)').append(this._tableLoading());
      trow.find('td:first').html(links[0]);
      trow.find('td:last').html(links[1]);
      odd = !odd;

      _markets.set(market.name, trow);
      table.append(trow);
    }

    this.request.stateSubscribe([..._markets.keys()]);

    this._elements.set('markets', {
      page: Render.PAGE.HOME,
      markets: _markets
    });

    this._elements.set('home_markets', table);
    element.html([`<div class="home-wrapper"></div>`,table.render()]);
  }

  _parseMarketHome(market, json) {
    const last = new Decimal(json.last);
    const open = new Decimal(json.open);
    const change = (open.cmp(0) !== 0) ? last.sub(open).div(open).mul(100) : Decimal.zero();

    const cls = (change.cmp(0) === 1) ? 'positive' : (change.cmp(0) === -1) ? 'negative' : 'zero';
    const [asset, base] = market.split('/');
    const prec = this._markets[market].prec || 8;

    return [
      `<span class="${cls}">${new Decimal(json.last).toFixed(prec)}</span>`,
      `<span>${new Decimal(json.high).toFixed(prec)}</span>`,
      `<span>${new Decimal(json.low).toFixed(prec)}</span>`,
      `<span class="${cls}">${change.toFixed(2)}<small>%</small></span>`,
      `<span>${json.volume}<small>${asset}</small></span>`,
      `<span>${json.deal}<small>${base}</small></span>`
    ];
  }

  _marketTrade(element, markets, market) {
    const left = JQuery('<div id="trade-left">');
    const right = JQuery('<div id="trade-right">');

    const selects = [
      [
        JQuery('<input type="radio" id="trade-markets-change" name="trade_markets" value="3" checked>'),
        '<label for="trade-markets-change">24H Change</label><div class="check"></div>'
      ], [
        JQuery('<input type="radio" id="trade-markets-value" name="trade_markets" value="4">'),
        '<label for="trade-markets-value">24H Value</label><div class="check"></div>'
      ], [
        JQuery('<input type="radio" id="trade-markets-volume" name="trade_markets" value="5">'),
        '<label for="trade-markets-volume">24H Volume</label><div class="check"></div>'
      ]
    ];

    const selectUl = JQuery('<ul>');
    const marketHolder = JQuery('<div>');
    const marketTable = this._tradeMarkets(markets, market);

    marketTable.find(`th:nth-child(n+4), td:nth-child(n+4)`).hide();

    for (let select of selects) {
      const idx = select[0].val();
      selectUl.append(JQuery('<li>').html(select));

      select[0].on('change', () => {
        if (!select[0].prop("checked"))
          return;

        marketTable.find(`th:nth-child(n+3), td:nth-child(n+3)`).hide();
        marketTable.find(`th:nth-child(${idx}), td:nth-child(${idx})`).show();
      });
    }

    marketHolder.html(marketTable);

    const dealsHolder = JQuery('<div>');
    const dealsHeader = JQuery(`<h1>Latest Deals: <label></label></h1>`);
    this._elements.set('market_deals', {
      dealsHeader: dealsHeader,
      dealsHolder: dealsHolder
    });

    left.append([selectUl, marketHolder, dealsHeader, dealsHolder]);
    this._marketPanel(right, market, this._markets[market].prec);

    this._elements.set('trade_left', left);
    this._elements.set('trade_right', right);
    this._elements.set('trade_markets_select', selects);

    element.addClass('full');
    element.html([left, right]);

    marketHolder.animate({
      scrollTop: JQuery(`[name="${market}"]`).position().top - 30
    }, 400);
  }

  _tradeMarkets(markets, market) {
    const period = 24 * 60 * 60;
    const table = new Table({
      head: ['Pair', 'Price', 'Change', 'Value', 'Volume'],
      sort: [0, 1, 2, 3, 4],
      type: ['string', 'decimal', 'decimal', 'decimal', 'decimal'],
      id: 'trade-markets',
      class: 'sticky'
    });

    const _markets = new Map();

    for(let _market of markets) {
      const [asset, base] = _market.name.split('/');
      const link = `<a class="link-trade${(market === _market.name)?' active':''}">${asset}<small>/ ${base}</small></a>`;

      this._markets[_market.name] = _market;
      const trow = table.trow()[0];

      trow.attr("name", _market.name);
      trow.append(table.tdata());
      trow.find('td:first').html(link);
      trow.find('td:nth-child(2),td:nth-child(3)').append(this._tableLoading());

      this._linkMarket(trow, _market.name, _market.prec);

      _markets.set(_market.name, trow);
      table.append(trow);
    }

    this.request.stateSubscribe([..._markets.keys()]);

    this._elements.set('markets', {
      page: Render.PAGE.TRADE,
      markets: _markets
    });

    this._elements.set('trade_markets', table);

    return table.render();
  }

  _marketDeals(market) {
    const [asset, base] = market.split('/');
    const cmp = (rows, row, table) => {
      row.attr('deal-id', row.dealId);

      const appendHead = (row, table) => {        
        table.dealIds.set(row.dealId, row);
        table.dealLast = row.dealId;
        return table.head.after(row);
      };

      if (table.rows.length === 0) {
        table.dealIds = new Map();
        return appendHead(row, table);
      }

      if (table.dealIds.has(row.dealId))
        return;

      if (row.dealId > table.dealLast)
        return appendHead(row, table);

      let prev;
      for (let id of [...table.dealIds.keys()].sort((a,b)=>a-b).reverse()) {
        if (!prev)
          table.dealIds.set(row.dealId, row);

        prev = table.dealIds.get(id);
          
        if (id > row.dealId)
          continue;

        break;
      }

      if (prev) prev.after(row);
    }

    const table = new Table({
      head: ['Time<small>(Date)</small>', `Price<small>(${base})</small>`, `Amount<small>(${asset})</small>`],
      id: 'market-deals',
      max: 100,
      compare: cmp,
      class: 'sticky'
    });

    this._elements.set(`market_deals_${market}`, table);

    return table.render();
  }

  _parseMarketTrade(market, json) {
    const last = new Decimal(json.last);
    const open = new Decimal(json.open);
    const change = (open.cmp(0) !== 0) ? last.sub(open).div(open).mul(100) : Decimal.zero();

    const cls = (change.cmp(0) === 1) ? 'positive' : (change.cmp(0) === -1) ? 'negative' : 'zero';
    const prec = this._markets[market].prec || 8;

    return [
      `<span class="${cls}">${new Decimal(json.last).toFixed(prec)}</span>`,
      `<span class="${cls}">${change.toFixed(2)}<small>%</small></span>`,
      `<span>${json.volume}</span>`,
      `<span>${json.deal}</span>`
    ];
  }

  _marketPanel(el, market, prec) {
    const chart = JQuery(`<div id="market-chart">`);
    const trading = this._tradingPanel(market);
    const depth = Depth.create(market, {prec: prec});
    const openOrders = this._openOrders(market);
    const orderHistory = this._ordersHistory(market);

    const dealsTable = this._marketDeals(market);
    const {dealsHeader, dealsHolder} = this._elements.get('market_deals');
    dealsHeader.find('label').html(market.replace('/', '<small>/</small>'));
    dealsHolder.html(dealsTable);

    this.depth = depth;

    this.request.dealsSubscribe([market], 20);
    this.request.priceSubscribe([market]);
    this.request.depthSubscribe(market, 10, "0.00");


    el.html([chart, trading, depth.body, openOrders, orderHistory]).promise().then(() => {
      this._chartFrame(chart, market);
    });


    this._ordersSubscribed();
  }

  _chartFrame(wrapper, market) {
    const path = Path.resolve(__dirname, `../static/html/chart.html`);
    const frame = JQuery(`<iframe src="${path}" width="${wrapper.width()}" height="${wrapper.height()}" scrolling="no" frameborder="0">`);
    const dimension = {
      width: wrapper.width(),
      height: wrapper.height() - 30
    };

    const periods = JQuery('<ul>');

    for (let [name, time] of Object.entries(Render.CHART.PERIODS)) {
      const period = JQuery(`<li>${name}</li>`);
      periods.append(period);

      if (time === Render.CHART.DEFAULT_PERIOD)
        period.addClass('active');

      period.on('click', () => {
        if (period.hasClass('active'))
          return;

        periods.find('li').removeClass('active');
        period.addClass('active');
        frame.get(0).contentWindow.postMessage(Object.assign(dimension, {init: true, market: market}), "*");
        const now = Math.floor(new Date() / 1000);
        const start = now - (Render.CHART.MAX_BAR*time);
        this.request.klineQuery(market, start, now, time, frame.get(0));
        this.request.klineSubscribe(market, time);
      });
    }

    frame.css(dimension);
    wrapper.html([periods, frame]);

    frame.get(0).onload = () => {
      if (!frame.get(0))
        return;

      this._frame = {
        contentWindow: frame.get(0).contentWindow,
        market: market
      };

      frame.get(0).contentWindow.postMessage(Object.assign(dimension, {init: true, market: market}), "*");
      const now = Math.floor(new Date() / 1000);
      const start = now - (Render.CHART.MAX_BAR*Render.CHART.DEFAULT_PERIOD);
      this.request.klineQuery(market, start, now, Render.CHART.DEFAULT_PERIOD, frame.get(0));
      this.request.klineSubscribe(market, Render.CHART.DEFAULT_PERIOD);
    }
  }

  _tradingPanel(market) {
    const _market = this._markets[market];
    const panel = JQuery(`<div id="trading-panel">`);
    const tab = JQuery(`<div class="tab"></div>`);
    const fees = `<div class="right"><span>Maker: ${_market.makerFee}</span><span>Taker: ${_market.takerFee}</span></div>`;
    const tabItems = [
      JQuery(`<a name="_orderLimit" class="active">Limit</a>`),
      JQuery(`<a name="_orderMarket">Market</a>`)
    ];

    const assets = this._tradingAssets();
    const order = this._tabs(tabItems, assets);

    tabItems.push(fees)
    tab.html(tabItems);
    panel.html([tab, order]);

    const elements = {
      panel: panel,
      tab: tab,
      items: tabItems,
      order: order
    }

    if (!this.request.isAuth()) {
      const wrapper = JQuery('<div id="trading-auth">');
      const auth = JQuery('<a>Click here</a> ');
      wrapper.html(JQuery('<div>').html([auth, 'to start trading']));

      panel.append(wrapper);
      this._elements.set('trading_auth', wrapper);

      auth.on('click', () => {
        this._authentication();
      });
    }

    this._elements.set('trading_panel', elements);
    return panel;
  }

  _tradingAssets() {
    const assets = {
      asset: this._market[0],
      base: this._market[1],
      balances: [],
      subscribed: false
    };

    let type;
    for (let i=0; i<2; i++) {
      const header = JQuery(`<div class="market-balance">`);
      type = type ? `Sell ${assets.asset}`: `Buy ${assets.asset}`;
      const balance = this._balance(this._market[1^i]);
      assets.balances.push({
        element: balance.element,
        html: header.html([`<h1>${type}</h1>`, balance.html]),
        type: type,
      });
    }

    return assets;
  }

  _balance(asset) {
    const item = this._assetMap.get(asset);
    if (!item)
      return;

    const html = JQuery(`<span>`);
    const available = JQuery(`<label>${item.balance.available}</label>`);
    const business = JQuery('<i title="Deposit/Withdraw" class="glyph-icon flaticon-wallet"></i>');

    business.on('click', () => {
      this._balances(asset);
    });

    const cb = (balance) => {
      if (!available.length)
        return;

      available.html(balance.available);
    }

    if (!item.fn.includes(cb))
      item.fn.push(cb);

    return {
      element: available,
      html: html.html([business, `${asset} balance: `, available])
    }
  }

  _orderLimit(assets) {
    const panels = [];

    let style, type, prices = [];
    for (let balance of assets.balances) {
      type = type ? "sell": "buy";
      style = style ? "red": "green";
      const panel = JQuery(`<div class="order-panel">`);
      const order = JQuery(`<div class="market-order">`);
      const price = JQuery(`<input type="text" />`);
      const pricePct = this._pricePercent(price, type);
      const amount = JQuery(`<input type="text" />`);
      const amountPct = this._amountPercent(balance.element, price, amount, type);
      const total = JQuery(`<input type="text" value="0" disabled />`);
      const submit = JQuery(`<div class="button ${style} disabled">${balance.type}</div>`);
      const market = `${assets.asset}/${assets.base}`;
      const minimum = this._markets[market].minAmount;
      this._onOrderChange(price, amount, minimum, type, total, balance.element, submit);
      this._onOrderChange(amount, price, minimum, type, total, balance.element, submit, true);
      prices.push(price);
      order.html([
        price,
        `<label asset="${assets.base}">Price:</label>`,
        pricePct,
        amount,
        `<label asset="${assets.asset}">Amount:</label>`,
        `<span class="minimum-amount">Minimum amount: <a>${minimum}</a> <small>${assets.asset}</small></span>`,
        amountPct,
        total,
        `<label asset="${assets.base}">Total:</label>`,
        submit
      ]);

      const side = type === 'buy' ? 2: 1;
      submit.on('click', () => {
        if (submit.hasClass('disabled'))
          return;

        this.request.orderPutLimit(market, side, amount.val(), price.val(), "");
        amount.val('').trigger('change');
      });

      panel.html([balance.html, order]);
      panels.push(panel);
    }

    this._elements.set(`price_${assets.asset}-${assets.base}`, prices);

    if (this.depth)
      this.depth.onClick(prices);

    return panels;
  }

  _orderMarket(assets) {
    const panels = [];

    let style, type, offer;
    for (let balance of assets.balances) {
      type = type ? "sell": "buy";
      offer = offer ? "ask": "bid";
      style = style ? "red": "green";
      const panel = JQuery(`<div class="order-panel">`);
      const order = JQuery(`<div class="market-order">`);
      const price = JQuery(`<input type="text" value="market price" disabled />`);
      const disable = JQuery(`<div class="offer-empty ${offer}"><div><i class="glyph-icon flaticon-record"></i>No Offer</div></div>`).hide();
      const amount = JQuery(`<input type="text" />`);
      const percent = this._amountPercent(balance.element, null, amount, type);
      const submit = JQuery(`<div class="button ${style} disabled">${balance.type}</div>`);
      const market = `${assets.asset}/${assets.base}`;
      const minAmount = this._markets[market].minAmount;
      let minimum = minAmount;
      if (type === 'buy') {
        const marketPrice = JQuery.find(`#depth_${assets.asset.toLowerCase()}-${assets.base.toLowerCase()} .depth-price span`);
        minimum = marketPrice.length ? new Decimal(minimum).mul(marketPrice[0].innerText) : 0;
      }

      const minElem = JQuery(`<span class="minimum-amount">${type==='sell'?'Minimum amount:':'Estimated minimum amount:'} <a>${minimum}</a>
        <small>${type === 'sell' ? assets.asset : assets.base}</small></span>`);
      const min = minElem.find('a').eq(0);
      if (type === 'sell') this._elements.set(`marketOrder_${assets.asset}-${assets.base}`, { el: min, minimum: minAmount });
      this._onAmountChange(amount, balance.element, min, submit);
      order.html([
        price,
        `<label asset="${assets.base}">Price:</label>`,
        amount,
        `<label asset="${type === 'sell' ? assets.asset : assets.base}">Amount:</label>`,
        minElem,
        percent,
        submit
      ]);

      const side = type === 'buy' ? 2: 1;

      submit.on('click', () => {
        if (submit.hasClass('disabled'))
          return;

        this.request.orderPutMarket(market, side, amount.val(), "");
        amount.val('').trigger('change');
      });

      if (!JQuery(`.market-depth .${offer}`).length)
        disable.show();

      panel.html([disable, balance.html, order]);
      panels.push(panel);
    }

    return panels;
  }

  _assetTrading(assets) {
    for (let [asset, balance] of Object.entries(assets)) {
      const _balance = this._elements.get(`${asset}_balance`);
      if (!_balance)
        return;

      const available = new Decimal(balance.available);

      _balance.html(available.toString());
    }
  }

  _balances(currentAsset) {
    const parent = JQuery(`<div class="slide-top"></div>`);
    const wrapper = JQuery('<div id="balances">');
    const tab = JQuery(`<div class="tab"></div>`);
    const tabItems = [
      JQuery(`<a name="_assetsPanel" class="active">Balances</a>`),
      JQuery(`<a name="_depositHistory">Deposit History</a>`),
      JQuery(`<a name="_withdrawHistory">Withdraw History</a>`)
    ];

    const body = JQuery('<div>');
    const cancel = JQuery(`<i class="glyph-icon flaticon-remove top-right"></i>`);
    const balances = this._tabs(tabItems, currentAsset);

    tab.html(tabItems);
    body.html([tab, ...balances, cancel]);
    parent.html(wrapper.html(body));

    this._slide(parent, cancel);
  }

  _depositHistory() {
    const header = JQuery("<div>");
    const wrapper = JQuery('<div id="deposit-history">');

    const table = new Table({
      head: ['Status', 'Time', 'Ticker', 'Amount', 'Address / Transaction ID'],
      id: 'deposit-list',
      class: 'sticky'
    });

    const max = this.request.isReal() ? Render.HISTORY.BUSINESS.PAGE_MAX_REAL: Render.HISTORY.BUSINESS.PAGE_MAX_DEMO;
    const options = {
      table: table,
      page: [0, max],
      type: 'deposit'
    }

    const cb = (asset) => {
      this.request.businessHistory(asset, 'deposit', 0, 0, 0, max, options);
    }

    const select = this._assetSelect(cb.bind(this));
    header.html([...select]);
    wrapper.html(table.render());

    const loading = JQuery(`<td class="load" colspan="${table.head.find('th').length}"></td>`);
    this._loading(loading, "Load deposit history...");
    table.body.find('tr.empty').hide();
    table.body.append(table.trow()[0].html(loading));

    this.request.businessHistory('NULL', 'deposit', 0, 0, 0, max, options);

    return [header, wrapper];
  }

  _withdrawHistory() {
    const header = JQuery("<div>");
    const wrapper = JQuery('<div id="withdraw-history">');

    const table = new Table({
      head: ['Status', 'Time', 'Ticker', 'Amount', 'Address / Transaction ID'],
      id: 'withdraw-list',
      class: 'sticky'
    });

    const max = this.request.isReal() ? Render.HISTORY.BUSINESS.PAGE_MAX_REAL: Render.HISTORY.BUSINESS.PAGE_MAX_DEMO;
    const options = {
      table: table,
      page: [0, max],
      type: 'withdraw'
    }

    const cb = (asset) => {
      this.request.businessHistory(asset, 'withdraw', 0, 0, 0, max, options);
    }

    const select = this._assetSelect(cb.bind(this));
    header.html([...select]);
    wrapper.html(table.render());

    const loading = JQuery(`<td class="load" colspan="${table.head.find('th').length}"></td>`);
    this._loading(loading, "Load withdraw history...");
    table.body.find('tr.empty').hide();
    table.body.append(table.trow()[0].html(loading));

    this.request.businessHistory('NULL', 'withdraw', 0, 0, 0, max, options);

    return [header, wrapper];
  }

  _assetSelect(cb) {
    const select = JQuery('<input placeholder="Enter coin/token ticker or name" class="filter" />');
    const dropdown = JQuery('<ul class="dropdown"><li class="empty">Enter coin/token ticker or name</li></ul>').hide();

    const _search = (value) => {
      const list = [];
      if (!value)
        return list;

      for (let [ticker, asset] of Object.entries(this._assets)) {
        if (ticker.includes(value) || asset.fullname.toUpperCase().includes(value))
          list.push(asset);
      }

      return list;
    }

    let timer;
    select.on('keydown', () => {
      timer = setTimeout(() => {
        const value = select.val();
        value ? dropdown.find('.empty').hide() : dropdown.find('.empty').show();
        const list = _search(value.toUpperCase());
        dropdown.find('li:not(.empty)').remove();

        if (!list.length && value)
          return dropdown.append('<li class="not-found">Coin/token not found</li>');

        if (!value)
          return cb('NULL');

        dropdown.find('.not-found').remove();

        for (let asset of list) {
          const icon = `<img src="${Path.resolve(__dirname, `../static/image/icon/${asset.name}.ico`)}">`;
          const link = JQuery(`<li><span>${asset.name}</span><label>${asset.fullname}</label>${icon}</li>`);
          link.on('click', () => {
            dropdown.hide();
            select.val(`${asset.name}`);
            cb(asset.name);
          });
          dropdown.append(link);
        }
      }, 1000);
    });


    select.on('focusin', () => {
      dropdown.show();
    });

    select.on('focusout', () => {
      setTimeout(() => {
        dropdown.hide();
      }, 500);
    });

    return [select, dropdown];
  }

  _assetsPanel(currentAsset) {
    const header = JQuery("<div>");
    const wrapper = JQuery('<div id="assets-panel">');
    const hide = JQuery(`<h1>Hide Zero Balance: </h1>`);

    const checkbox = JQuery('<div class="checkbox">');
    const checkboxes = [
      JQuery(`<input type="checkbox" id="checkbox-hide">`),
      JQuery(`<label class="checkbox-off" for="checkbox-hide"></label>`)
    ];

    checkbox.html(checkboxes);
    hide.append(checkbox);

    const table = new Table({
      head: ['Coin Ticker', 'Coin Name', 'Amount', 'Available', 'In Order', '', '', ''],
      sort: [0, 1, 2, 3, 4],
      type: ['string', 'string', 'decimal', 'decimal', 'decimal'],
      id: 'asset-list',
      class: 'sticky'
    });

    for (let [name, asset] of Object.entries(this._assets)) {
      const trow = table.trow()[0];
      const deposit = JQuery(`<td id="${name}_deposit" name="_deposit"><a class="button-flat-dark">Deposit</a></td>`);
      const withdraw = JQuery(`<td id="${name}_withdraw" name="_withdraw"><a class="button-flat-dark">Withdraw</a></td>`);
      const trade = JQuery(`<td><a class="button-flat-dark">Trade</a></td>`);

      const item = this._assetMap.get(name);
      if (!item)
        continue;

      const available = item.balance.available || 0;
      const freeze = item.balance.freeze || 0;
      const total = new Decimal(available).add(freeze).toString();

      const _available = JQuery(`<td name="available" value="${available}"${available === '0' ? 'class="zerodash">–': '>'+available}</td>`);
      const _freeze = JQuery(`<td name="freeze" value="${freeze}"${freeze === '0' ? 'class="zerodash">–': '>'+freeze}</td>`);
      const _total = JQuery(`<td name="total" value="${total}"${total === '0' ? 'class="zerodash">–': '>'+total}</td>`);

      const cb = (balance) => {
        if (!_available.length)
          return;

        const sum = new Decimal(balance.available).add(balance.freeze);
        balance.available === '0' ? _available.addClass('zerodash').html('–'): _available.removeClass('zerodash').html(balance.available);
        balance.freeze === '0' ? _freeze.addClass('zerodash').html('–'): _freeze.removeClass('zerodash').html(balance.freeze);
        sum.cmp(0) === 0 ? _total.addClass('zerodash').html('–'): _total.removeClass('zerodash').html(sum.toString());
      }

      if (!item.fn.includes(cb))
        item.fn.push(cb);

      const td = [
        `<td>${name}</td>`,
        `<td>${asset.fullname}</td>`,
        _total,
        _available,
        _freeze,
        deposit,
        withdraw,
        trade
      ];

      trow.append(td);
      table.append(trow);

      const len = trow.find('td').length;
      const row = JQuery(`<tr sub>`);
      const _td = JQuery(`<td sub colspan="${len}"></td>`);

      row.addClass('business');

      [deposit, withdraw].forEach((element) => {
        if (asset.disabled)
          return element.find('a').addClass('disable');

        element.on('click', () => {
          if (element.hasClass('active')) {
            element.removeClass('active');
            return element.parents('tr').next().remove();
          }

          table.body.find(".active").removeClass('active');
          element.addClass('active');

          const fn = element.attr("name");
          table.body.find(".business").remove();
          row.append(_td);
          trow.after(row);
          this[fn](_td, name);
        });
      });

      const markets = Object.keys(this._markets).filter(market => market.includes(`${name}/`));

      if (!markets.length) {
        trade.find('a').addClass('disable');
        continue;
      }

      markets.forEach((market) => {this._linkOrder(trade, table, market)});
    }

    header.html([hide]);
    wrapper.html(table.render());

    checkboxes[0].on('change', () => {
      if (checkboxes[0].prop('checked')) {
        table.body.find("td:nth-child(3)").each((idx, el) => {
          const td = JQuery(el);
          const amount = new Decimal(td.attr("value"));
          if (amount.cmp(0) === 0)
            td.parents('tr').hide();
        });
      } else {
        table.body.find('tr').show();
      }
    });

    if (!currentAsset)
      return [header, wrapper];

    setTimeout(() => {
      const el = JQuery(`#${currentAsset}_deposit`);
      if (!el.length)
        return;

      el.trigger('click');
      wrapper.animate({ scrollTop: el.position().top - 40 }, 400);
    }, 100);

    return [header, wrapper];
  }

  _openOrders(market) {
    const [asset, base] = market.split('/');
    const panel = JQuery(`<div id="open-orders" class="order-table">`);
    const header = `<h1>Open Orders: <label>${asset}<small>/</small>${base}</label></h1>`;

    const table = new Table({
      head: [
        `Create Time`, `Type`, `Side`,
        `Price <small>${base}</small>`,
        `Amount <small>${asset}</small>`,
        `Unfilled <small>${asset}</small>`, `Action`
      ]
    });

    this._elements.set('open_orders', {
      table: table,
      market: market
    });

    return panel.html([header, table.render()]);
  }

  _ordersHistory(market) {
    const [asset, base] = market.split('/');
    const panel = JQuery(`<div id="order-history" class="order-table">`);
    const header = `<h1>24H Order History: <label>${asset}<small>/</small>${base}</label></h1>`;

    const table = new Table({
      head: [
        `Date`, `Type`, `Side`,
        `Price <small>${base}</small>`,
        `Amount`,
        `Filled <small>${asset}</small>`,
        `Value <small>${base}</small>`, `Action`
      ]
    });

    this._elements.set('order_history', {
      market: market,
      table: table,
      page: [0, Render.HISTORY.PAGE_MAX]
    });

    return panel.html([header, table.render()]);
  }

  _marketOrder() {
    const parent = JQuery(`<div class="slide-top"></div>`);
    const wrapper = JQuery('<div id="orders" class="order-table">');
    const tab = JQuery(`<div class="tab"></div>`);
    const tabItems = [
      JQuery(`<a name="_currentOrders" class="active">Open Orders</a>`),
      JQuery(`<a name="_historyOrders">Order History</a>`)
    ];

    const body = JQuery('<div>');
    const cancel = JQuery(`<i class="glyph-icon flaticon-remove top-right"></i>`);
    const order = this._tabs(tabItems, null);

    tab.html(tabItems);
    body.html([tab, order, cancel]);
    parent.html(wrapper.html(body));

    this._slide(parent, cancel);
  }

  _tradeOpenOrders(market, table, next = null) {
    const item = this._orderMap.get(market);
    if (!item || !table.body.length)
      return;

    const {records, fn, offset, limit} = item;
    const len = Object.keys(records).length;

    table.body.find('tr:not(:first-child,.empty)').remove();
    table.body.siblings('.page').remove();

    if (len===offset)
      item.offset = Math.max(0, offset-limit);

    if (!len&& offset === 0)
      return table.body.find('tr.empty').show();

    if (next !== null)
      item.offset = next;

    const rows = [];
    for (let order of Object.values(records).reverse().splice(item.offset, limit)) {
      if (market !== order.market) return;

      const cancel = JQuery(`<a class="button-flat-dark red" order-id="${order.id}">Cancel</a>`);
      const row = table.trow()[0];
      const cls = `deal_${order.side === 1 ? 'sell': 'buy'}`;
      const data = [
        `<td>${new Date(order.ctime * 1000).format("d-m-Y H:i:s")}</td>`,
        `<td>${Render.ORDER.TYPES[order.type]}</td>`,
        `<td class="${cls}">${Render.ORDER.SIDE[order.side]}</td>`,
        `<td>${order.price}</td>`,
        `<td>${order.amount}</td>`,
        `<td>${order.left}</td>`
      ];

      const last = table.tdata()[0];
      last.html(cancel);

      row.html(data);
      row.append(last);
      rows.push(row);

      cancel.on('click', () => {
        row.find('td:last-child a').hide();
        row.find('td:last-child').append(this._tableLoading());
        this.request.orderCancel(order.id, row, order.market, table);
      });
    }

    table.body.find('tr:first-child').after(rows);
    table.body.find('tr.empty').hide();

    const paging = table.paging(null, item.offset, limit, len);

    paging.find('a').on('click', (evt) => {
      const el = JQuery(evt.target);
      if (el.is('.active, .disable'))
        return;

      const _next = parseInt(el.attr('offset'));
      this._tradeOpenOrders(market, table, _next);
    });

    table.body.after(paging);
  }

  _currentOrders(wrapper) {
    const header = JQuery('<div>');
    const search = JQuery('<input class="filter" placeholder="Filter Coin / Token" />');

    const table = new Table({
      head: [
        `Create Time`, `Pair`, `Type`, `Side`,
        `Price`, `Amount`, `Unfilled`, `Action`
      ],
      id: "orders-record"
    });

    let timer;
    search.on('keydown', () => {
      if (timer)
        clearTimeout(timer);

      timer = setTimeout(() => {
        this._recordOpenOrders(table, 0, Render.ORDER.RECORD_MAX, {filter: search.val() || null});
      }, 1000);
    });

    header.html([search]);
    wrapper.html([header, table.render()]);

    const loading = JQuery(`<td class="load" colspan="${table.head.find('th').length}"></td>`);
    this._loading(loading, "Load order records...");
    table.body.find('tr.empty').hide();
    table.body.append(table.trow()[0].html(loading));

    this._recordOpenOrders(table, 0, Render.ORDER.RECORD_MAX);
  }

  _recordOpenOrders(table, offset, limit, options = {}) {
    if (!table.body.length)
      return;

    const records = Object.assign({}, this._orderRecords);
    if (options.filter)
      for (let [id, order] of Object.entries(records))
        if (!order.market.includes(options.filter.toUpperCase()))
          delete records[id];

    const len = Object.keys(records).length;
    table.body.find('tr:not(:first-child,.empty)').remove();
    table.body.siblings('.page').remove();

    if (len === offset)
      offset = Math.max(0, offset-limit);

    if (!len && offset === 0)
      return table.body.find('tr.empty').show();

    const rows = [];
    for (let order of Object.values(records).reverse().splice(offset, limit)) {
      const cancel = JQuery(`<a class="button-flat-dark red" order-id="${order.id}">Cancel</a>`);
      const row = table.trow()[0];
      const cls = `deal_${order.side === 1 ? 'sell': 'buy'}`;
      const [asset, base] = order.market.split('/');
      const link = JQuery(`<td class="link-trade"><a>${asset}<small>/ ${base}</small></a></td>`);
      const data = [
        `<td>${new Date(order.ctime * 1000).format("d-m-Y H:i:s")}</td>`,
        link,
        `<td>${Render.ORDER.TYPES[order.type]}</td>`,
        `<td class="${cls}">${Render.ORDER.SIDE[order.side]}</td>`,
        `<td>${order.price}<small>${base}</small></td>`,
        `<td>${order.amount}<small>${asset}</small></td>`,
        `<td>${order.left}<small>${asset}</small></td>`
      ];

      this._linkOrder(link, table, order.market);

      const last = table.tdata()[0];
      last.html(cancel);

      row.html(data);
      row.append(last);
      rows.push(row);

      cancel.on('click', () => {
        row.find('td:last-child a').hide();
        row.find('td:last-child').append(this._tableLoading());
        this.request.orderCancel(order.id, row, order.market, table, options);
      });
    }

    table.body.find('tr:first-child').after(rows);
    table.body.find('tr.empty').hide();

    const paging = table.paging(null, offset, limit, len);

    paging.find('a').on('click', (evt) => {
      const el = JQuery(evt.target);
      if (el.is('.active, .disable'))
        return;

      const _next = parseInt(el.attr('offset'));
      this._recordOpenOrders(table, _next, limit, options);
    });

    table.body.after(paging);
    this._elements.set('order_records', [table, offset, limit, options]);
  }

  _historyOrders(wrapper) {
    const header = JQuery('<div>');
    const search = JQuery('<input class="filter" placeholder="Filter Coin / Token" />');
    const wrap = JQuery('<div class="scrollable">');

    const table = new Table({
      head: [
        `Create Time`, `Pair`, `Type`, `Side`,`Price`, 
        `Amount`, `Filled`, 'Value', `Action`
      ],
      id: "history-record",
      class: "sticky"
    });

    const periods = [];
    for (let [idx, period] of Render.HISTORY.PERIODS.entries()) {
      const second = period*24*60*60;
      periods.push([
        JQuery(`<input type="radio" id="history-record-${period}" name="record_history" value="${second}"${idx===0?' checked':''}>`),
        `<label for="history-record-${period}">${period} Days</label><div class="check"></div>`
      ]);
    }

    const periodUl = JQuery('<ul>');
    for (let period of periods) {
      const idx = period[0].val();
      periodUl.append(JQuery('<li>').html(period));

      period[0].on('change', () => {
        if (!period[0].prop("checked"))
          return;

        const orders = {};
        const markets = Object.keys(this._markets);
        const end = Math.floor(Date.now()/1000);
        const start = end - parseInt(period[0].val());
        for (let market of Object.keys(this._markets)) {
          table.body.find('tr:not(:first-child,.empty,:has(td.load))').remove();
          table.body.find('tr:has(td.load)').show();
          table.body.find('tr.empty').hide();
          this.request.orderHistory(market, start, end+60*60, 0, Render.HISTORY.MAX_QUERY, {
            type: 'record',
            search: search,
            market: market,
            markets: markets,
            table: table,
            orders: orders,
            range: [start, end]
          });
        }
      });
    }

    header.html([search, periodUl]);
    wrapper.html([header, wrap.html(table.render())]);

    const loading = JQuery(`<td class="load" colspan="${table.head.find('th').length}"></td>`);
    this._loading(loading, "Load order history...");
    table.body.find('tr.empty').hide();
    table.body.append(table.trow()[0].html(loading));

    periods[0][0].trigger('change');
  }

  _linkTrade(links, market) {
    links.forEach((element) => {
      element.on('click', () => {
        this._goToTrade(market);
      });
    });
  }

  _linkMarket(link, market, prec) {
    link.on('click', () => {
      const anchor = link.find('a');
      if (anchor.hasClass('active'))
        return;

      this._market = market.split('/');
      link.parents('table').find('.active').removeClass('active');
      anchor.addClass('active');
      link.addClass('active');

      const right = this._elements.get('trade_right');
      this._marketPanel(right, market, prec);
    });
  }

  _linkOrder(link, table, market) {
    link.on('click', () => {
      const parent = table.body.parents('.slide-top');
      parent.animate({"left":"100%"}, "fast", () => {
        parent.nextAll().fadeIn();
        parent.remove();

        const el = JQuery(`#trade-markets [name="${market}"]`);
        if (!el.length)
          return this._goToTrade(market);

        
        el.parents('div').eq(0).animate({
          scrollTop: el.position().top - 30
        }, 400);

        return el.find('.link-trade').trigger('click');
      });
    });
  }

  _linkSearch(link, market, search) {
    link.on('click', () => {
      search.val(market);
      const el = JQuery(`#trade-markets [name="${market}"]`);
      if (!el.length)
        return this._goToTrade(market);

      el.parents('div').eq(0).animate({
        scrollTop: el.position().top - 30
      }, 400);

      return el.find('.link-trade').trigger('click');
    });
  }

  _tabs(tabs, ...args) {
    const item = this._tabsMap.get(tabs);

    if (item)
      return item;

    const body = JQuery('<div class="tab-wrapper">');
    for (let tab of tabs) {
      const fn = tab.attr('name');

      if (args[0] === null)
        args[0] = body;

      if (tab.hasClass('active'))
        body.html(this[fn](...args));

      tab.on('click', () => {
        if (tab.hasClass('active'))
          return;

        tab.parent().find('.active').removeClass('active');
        tab.addClass('active');

        body.html(this[fn](...args));
      });
    }

    this._tabsMap.set(tabs, body);

    return body;
  }

  _tableLoading() {
    return `<div class="loading-dot"><div></div><div></div><div></div></div>`;
  }

  _slide(parent, cancel) {
    cancel.on('click', () => {
      parent.animate({"left":"100%"}, "fast", () => {
        parent.nextAll().fadeIn();
        parent.remove();
      });
    });

    parent.prependTo('exchange .container').css({"left":"100%"}).animate({"left":"0"}, "fast");
    parent.nextAll().hide();
  }

  _flipY(elements) {
    for (let el of elements)
      setTimeout(()=>{
        el.removeClass('flipY').addClass('flipY');
        el.parents('#trade-right').removeClass('flipped');
      },1);
  }

  _loading(el, text) {
    const loading = JQuery(`<div class="loading"></div>`);
    const wrapper = JQuery(`<div class="wrapper"></div>`);
    if (text)
      wrapper.html(`<span>${text}</span>`);

    loading.append([`<div class="image" style="background-image:url('../image/loader.gif')"></div>`, wrapper]);
    el.append(loading);

    return {
      element: loading,
      text: text
    };
  }

  _roundDown(value, price, max, infinite = 0) {
    if (infinite > 100)
      return 0;

    if (value.mul(price).cmp(max) > 0)
      return this._roundDown(value.sub(Math.pow(10, -(value.c.length-value.e-1))), price, max, infinite++);

    return value.toString();
  }

  _stateSubscribe(json, market) {
    ;
  }

  _stateUpdate(market, last) {
    const item = this._elements.get('markets');
    const element = item.markets.get(market);

    let data;
    if (item.page === Render.PAGE.HOME)
      data = this._parseMarketHome(market, last);
    else if (item.page === Render.PAGE.TRADE)
      data = this._parseMarketTrade(market, last);

    element.find('td:not(:first-child)').each((idx, el) => {
      JQuery(el).html(data[idx]);
    });
  }

  _priceSubscribe(json) {
    ;
  }

  _priceUpdate(market, price, direction) {
    if (!this.depth)
      return;

    const marketPrice = this._elements.get(`price_${market.replace('/','-')}`);
    const marketOrder = this._elements.get(`marketOrder_${market.replace('/','-')}`);
    if (marketOrder && marketOrder.el.length) {
      const est_price = new Decimal(price).mul(marketOrder.minimum);
      marketOrder.el.html(est_price.toString());
    }

    this.depth.onClick(marketPrice);
    this.depth.updatePrice(market, price, direction);
  }

  _depthSubscribe(json) {
    ;
  }

  _depthUpdate(clean, last, market) {
    if (!this.depth)
      return;

    const elements = this._elements.get(`price_${market.replace('/','-')}`);
    this.depth.onClick(elements);
    this.depth.updateDepth(clean, last, market);
  }

  _dealsSubscribe(json) {
    ;
  }

  _dealsUpdate(market, deals) {
    const table = this._elements.get(`market_deals_${market}`);

    if (!table)
      return;

    if (!table.deals)
      table.deals = {};

    const prec = this._markets[market].prec || 8;

    const rows = [];
    for (let deal of deals.reverse()) {
      const row = table.trow()[0];
      const time = new Date(deal.ts * 1000).format("H:i:s");
      const date = new Date(deal.ts * 1000).format("d-m-Y");
      const price = new Decimal(deal.price).toFixed(prec);
      const data = [
        `<td title="${date}">${time}</td>`,
        `<td class="deal_${deal.type}">${price}</td>`,
        `<td>${deal.amount}</td>`
      ];

      row.dealId = deal.id;
      row.html(data);
      rows.push(row);
    }

    table.insert(rows);
  }

  _klineQuery(json, frame) {
    if (json.error || !frame.contentWindow)
      return;

    frame.contentWindow.postMessage({
      draw: true,
      records: json.result
    }, "*");
  }

  _klineSubscribe(json) {
    ;//console.error(json)
  }

  _klineUpdate(json) {
    if (!json || json.error)
      return;

    if (json[7] !== this._frame.market)
      return;

    this._frame.contentWindow.postMessage({
      update: true,
      record: json
    }, "*");
  }

  _assetList(json) {
    if (json.error)
      return console.error(json.error);

    for (let asset of json.result) {
      this._assets[asset.name] = asset;
      this._assetMap.set(asset.name, {fn: [], balance: {available: '0.00000000', freeze: '0.00000000'}});
    }

    if (this.request.isAuth())
      this.request.assetSubscribe(Object.keys(this._assets));
  }

  _assetSubscribe(json) {
    ;
  }

  _assetUpdate(assets) {
    for (let [_asset, _balance] of Object.entries(assets)) {
      const asset = this._assetMap.get(_asset);
      if (!asset)
        return;

      asset.balance = _balance;
      if (asset.fn.length)
        for (let fn of asset.fn)
          fn(_balance);
    }
  }

  _orderQuery(json, market) {
    if (json.error)
      return;

    const {records, offset, limit, total} = json.result;
    const order = this._orderMap.get(market);
    const end = offset+limit;

    for (let record of records) {
      order.records[record.id] = record;
      this._orderRecords[record.id] = record;
    }

    if (total > end)
      this.request.orderQuery(market, end, limit);
  }

  _orderHistory(json, options) {
    if (json.error)
      return;

    options.type === 'trade' ? 
      this._tradeHistory(json, options):
    options.type === 'record' ? 
      this._recordHistory(json, options):
      '';
  }

  _businessHistory(json, options) {
    if (json.error)
      return;

    const {table, page, type} = options;
    if (!table.body.length)
      return;

    const {records, offset, limit, total} = json.result;
    table.body.find('tr:not(:first-child,.empty)').remove();
    table.body.siblings('.page').remove();

    if (!records.length)
      return table.body.find('tr.empty').show();

    const rows = [];
    page.splice(0);
    page.push(offset, limit);
    for (let record of records) {
      const row = table.trow()[0];
      const copyAddr = JQuery(`<i class="glyph-icon flaticon-copy" value="${record.address}" title="Copy"></i>`);
      const copyTxn = JQuery(`<i class="glyph-icon flaticon-copy" value="${record.businessId}" title="Copy"></i>`);
      const addr = JQuery(`<div>${record.address}</div>`).prepend(copyAddr);
      const txn = JQuery(`<div>${record.businessId}</div>`).prepend(copyTxn);

      this._onCopy([copyAddr, copyTxn]);

      const detail = this.request.isReal() ? JQuery('<td>').html([addr, txn]) : `<td>- Not available for demo/practice account -</td>`;

      const data = [
        `<td>${Render.BUSINESS.STATUS[record.status]}</td>`,
        `<td>${new Date(record.time * 1000).format("d-m-Y H:i:s")}</td>`,
        `<td><small>${record.asset}</small></td>`,
        `<td>${record.amount}</td>`,
        detail
      ];
      row.html(data);
      rows.push(row);
    }

    table.body.find('tr:first-child').after(rows);
    table.body.find('tr.empty').hide();

    const paging = table.paging(null, offset, limit, total);

    paging.find('a').on('click', (evt) => {
      const el = JQuery(evt.target);
      if (el.is('.active, .disable'))
        return;

      const _offset = parseInt(el.attr('offset'));
      const _limit = parseInt(el.attr('limit'));
      this.request.businessHistory('NULL', type, 0, 0, _offset, _limit, options);
    });

    table.body.after(paging);
  }

  _tradeHistory(json, options) {
    const {market, table, page} = this._elements.get('order_history');
    const {records, offset, limit, total} = json.result;
    const rows = [];

    table.body.find('tr:not(:first-child,.empty)').remove();
    table.body.siblings('.page').remove();

    if (!records.length)
      return table.body.find('tr.empty').show();

    page.splice(0);
    page.push(offset, limit);
    for (let order of records) {
      if (market !== order.market)
        return;

      const row = table.trow()[0];
      const [asset, base] = market.split('/');
      const detail = JQuery('<td><a class="button-flat-dark">Detail</a></td>');
      const cls = `deal_${order.side === 1 ? 'sell': 'buy'}`;
      const data = [
        `<td title="Finished: ${new Date(order.ftime * 1000).format("d-m-Y H:i:s")}">${new Date(order.ctime * 1000).format("d-m-Y H:i:s")}</td>`,
        `<td>${Render.ORDER.TYPES[order.type]}</td>`,
        `<td class="${cls}">${Render.ORDER.SIDE[order.side]}</td>`,
        `<td>${order.price}</td>`,
        `<td>${order.amount}<small>${order.type===1?asset:order.side===1?asset:base}</small></td>`,
        `<td>${order.dealStock}</td>`,
        `<td>${order.dealMoney}</td>`,
        detail
      ];

      detail.on('click', () => {
        if (detail.find('.loading-dot').length)
          return;

        const next = row.next();
        if (next.is("[sub]"))
          return next.remove();

        detail.find('a').hide();
        detail.append(this._tableLoading());
        this.request.orderDeals(order.id, 0, Render.ORDER.DEALS.PAGE_MAX, market, order.side, row);
      });

      row.html(data);
      rows.push(row);

    }

    table.body.find('tr:first-child').after(rows);
    table.body.find('tr.empty').hide();

    const paging = table.paging(null, offset, limit, total);

    paging.find('a').on('click', (evt) => {
      const el = JQuery(evt.target);
      const end = Math.floor(Date.now()/1000);
      const start = end - Render.HISTORY.TIME_MAX;
      if (el.is('.active, .disable'))
        return;

      const _offset = parseInt(el.attr('offset'));
      const _limit = parseInt(el.attr('limit'));
      this.request.orderHistory(market, start, end, _offset, _limit, options);
    });

    table.body.after(paging);
  }

  _recordHistory(json, options) {
    const {table, search, market, markets, orders, range} = options;
    const {records, offset, limit, total} = json.result;

    if (!table.body.length)
      return;

    const _offset = offset+limit;
    if (!records.length || _offset > total)
      markets.filter((m, i)=>{ if(m===market) markets.splice(i, 1) });

    for (let record of records)
      orders[record.id] = record;

    if (_offset < total)
      return this.request.orderHistory(market, ...range, _offset, Render.HISTORY.MAX_QUERY, options);

    if (markets.length)
      return;

    const page = [0, Render.HISTORY.RECORD_MAX];
    this._recordsHistory(table, orders, offset, Render.HISTORY.RECORD_MAX, page, search, orders);
  }

  _recordsHistory(table, records, offset, limit, page, search, __records) {
    table.body.find('tr:not(:first-child,.empty,:has(td.load))').remove();
    table.body.find('tr:has(td.load)').hide();
    table.body.siblings('.page').remove();
    const len = Object.keys(records).length;
    const rows = [];

    if (!len)
      return table.body.find('tr.empty').show();

    page.splice(0);
    page.push(offset, page);
    for (let order of Object.values(records).reverse().splice(offset, limit)) {
      const row = table.trow()[0];
      const [asset, base] = order.market.split('/');
      const detail = JQuery('<td><a class="button-flat-dark">Detail</a></td>');
      const cls = `deal_${order.side === 1 ? 'sell': 'buy'}`;
      const data = [
        `<td title="Finished: ${new Date(order.ftime * 1000).format("d-m-Y H:i:s")}">${new Date(order.ctime * 1000).format("d-m-Y H:i:s")}</td>`,
        `<td>${asset}<small>/ ${base}</small></td>`,
        `<td>${Render.ORDER.TYPES[order.type]}</td>`,
        `<td class="${cls}">${Render.ORDER.SIDE[order.side]}</td>`,
        `<td>${order.price}</td>`,
        `<td>${order.amount}<small>${order.type===1?asset:order.side===1?asset:base}</small></td>`,
        `<td>${order.dealStock} <small>${asset}</small></td>`,
        `<td>${order.dealMoney} <small>${base}</small></td>`,
        detail
      ];

      detail.on('click', () => {
        if (detail.find('.loading-dot').length)
          return;

        const next = row.next();
        if (next.is("[sub]"))
          return next.remove();

        detail.find('a').hide();
        detail.append(this._tableLoading());
        this.request.orderDeals(order.id, 0, Render.HISTORY.DEALS.PAGE_MAX, order.market, order.side, row);
      });

      row.html(data);
      rows.push(row);

    }

    table.body.find('tr:first-child').after(rows);
    table.body.find('tr.empty').hide();

    const paging = table.paging(null, offset, limit, len);

    paging.find('a').on('click', (evt) => {
      const el = JQuery(evt.target);
      if (el.is('.active, .disable'))
        return;

      const _offset = parseInt(el.attr('offset'));
      const _limit = parseInt(el.attr('limit'));
      this._recordsHistory(table, records, _offset, _limit, page, search);
    });

    let timer;
    search.on('keydown', () => {
      if (timer)
        clearTimeout(timer);

      timer = setTimeout(() => {
        const value = search.val();
        if (!value)
          return this._recordsHistory(table, __records, 0, limit, page, search, __records);

        if (!__records)
          return;

        const _records = {};
        for (let [key, order] of Object.entries(__records))
          if (order.market.includes(value.toUpperCase())) _records[key] = order;

        this._recordsHistory(table, _records, 0, limit, page, search, __records);
      }, 1000);
    });

    table.body.after(paging);
  }

  _orderSubscribe(json) {
    this._ordersSubscribed();
  }

  _orderUpdate(event, order) {
    const {records} = this._orderMap.get(order.market);
    if (event === Render.ORDER_EVENT.FINISH) {
      delete records[order.id];
      delete this._orderRecords[order.id];
    } else {
      records[order.id] = order;
      this._orderRecords[order.id] = order;
    }
 
    const orders = this._elements.get('open_orders');
    if (orders && orders.table.body.length && orders.market === order.market)
      this._tradeOpenOrders(orders.market, orders.table);

    const ordersRecord = this._elements.get('order_records');
    if (ordersRecord && ordersRecord[0].body.length)
      this._recordOpenOrders(...ordersRecord);

    const history = this._elements.get('order_history');
    if (
      event === Render.ORDER_EVENT.FINISH &&
      history && history.table.body.length && history.market === order.market
    ) {
      setTimeout(() => {
        const end = Math.floor(Date.now()/1000);
        const start = end - Render.HISTORY.TIME_MAX;
        this.request.orderHistory(history.market, start, end+60*60, ...history.page, {type: 'trade'});
      }, 500);
    }
  }

  _orderCancel(json, args) {
    let [row, market, table, offset, limit, options] = args;

    if (json.error) {
      row.find('.loading-dot').remove();
      return row.find('td:last-child a').show();
    }
  }

  _orderDeals(json, args) {
    if (json.error)
      return console.error(json.error);

    const {records, offset, limit, total} = json.result;
    const [orderId, market, side, row] = args;
    const [asset, base] = market.split('/');

    row.find('.loading-dot').remove();
    row.find('td:last-child a').show();

    const table = new Table({
      head: [
        'Date', 'Role', `Price <small>${base}</small>`,
        `Amount <small>${asset}</small>`,
        `Value <small>${base}</small>`,
        `Fee <small>${side===1?base:asset}</small>`
      ],
      class: 'sub-table'
    });

    for (let record of records) {
      const date = new Date(record.time * 1000).format("d-m-Y H:i:s")
      const trow = table.trow()[0];

      const data = [
        `<td>${date}</td>`,
        `<td>${Render.ORDER.ROLE[record.role]}</td>`,
        `<td>${record.price}</td>`,
        `<td>${record.amount}</td>`,
        `<td>${record.deal}</td>`,
        `<td>${record.fee}</td>`
      ];

      trow.html(data);
      table.append(trow);
    }

    const prev = JQuery(`<a class="page-prev${offset===0?' disable': `" offset="${Math.max(0, offset-limit)}`}"></a>`);
    const next = JQuery(`<a class="page-next${total<(offset+limit)?' disable': `" offset="${offset+limit}`}"></a>`);

    [prev, next].forEach((element) => {
      element.on('click', () => {
        if (element.hasClass('disable'))
          return;

        const _offset = parseInt(element.attr('offset'));
        this.request.orderDeals(orderId, _offset, _offset + Render.ORDER.DEALS.PAGE_MAX, market, side, row);
      });
    });

    const len = row.find('td').length;
    const sub = JQuery(`<tr sub><td colspan="${len}"></td></tr>`);
    sub.find('td').html([prev, table.render(), next]);
    row.parents('table').find('[sub]').remove();
    row.after(sub);
  }

  _pricePercent(price, type) {
    const ul = JQuery(`<ul></ul>`);
    for (let i=1; i<5; i++) {
      const sign = type === 'buy' ? `-${i*5}` : `+${i*5}`;
      const li = JQuery(`<li title="${sign}% of current price">${i*5}%</li>`);
      ul.append(li);
      li.on('click', () => {
        const value = new Decimal(this.depth.price.find('span').text() || 0);
        const change = value.mul(i*5/100);
        if (type === 'buy')
          price.val(value.sub(change)).trigger('change');
        else
          price.val(value.add(change)).trigger('change');
      });
    }

    return ul;
  }

  _amountPercent(balance,  price, amount, type) {
    const ul = JQuery(`<ul></ul>`);
    for (let i=1; i<5; i++) {
      const li = JQuery(`<li title="${i*25}% of balance">${i*25}%</li>`);
      ul.append(li);
      li.on('click', () => {
        const value = new Decimal(balance.html());
        if (price === null)
          return amount.val(value.mul(i*25/100).toString()).trigger('change');

        if (!price.val() || price.val() === '.')
          return;

        const _price = new Decimal(price.val());
        if (_price.cmp(0) === 0)
          return;

        if (type === 'buy') {
          const _amount = this._roundDown(value.div(_price).mul(i*25/100), _price, value);
          amount.val(_amount).trigger('change');
        } else
          amount.val(value.mul(i*25/100).toString()).trigger('change');
      });
    }

    return ul;
  }

  _onAmountChange(amount, balance, min, submit) {
    this._priceFilter(amount);
    amount.on('change input', () => {
      if (!amount.val() || amount.val() === '.')
        return submit.addClass('disabled');

      submit.removeClass('disabled');
      const value = new Decimal(amount.val());

      if (value.cmp(min.html()) < 0)
        return submit.addClass('disabled');

      if (value.cmp(0) === 0 || value.cmp(balance.text()) > 0)
        submit.addClass('disabled');
    });
  }

  _onOrderChange(target, mul, min, type, total, balance, submit, test) {
    this._priceFilter(target);
    target.on('change input', () => {
      if (!target.val() || !mul.val() || target.val() === '.' || mul.val() === '.') {
        submit.addClass('disabled');
        total.val(0);
        return;
      }

      const value = new Decimal(target.val());
      const _balance = new Decimal(balance.text());
      const _total = value.mul(mul.val());
      submit.removeClass('disabled');

      if (_total.cmp(0) === 0 || value.cmp(min) < 0)
        submit.addClass('disabled');

      if (type === 'buy') {
        if (_total.cmp(_balance) > 0)
          submit.addClass('disabled');
      } else {
        if (test && value.cmp(_balance) > 0)
          submit.addClass('disabled');
        else if (!test && _balance.cmp(mul.val()) < 0)
          submit.addClass('disabled');
      }

      _total.c.splice(8+_total.e+1);

      total.val(_total.toString());
    });
  }

  _onWithdrawChange(target, fee, received, max, submit, address, otp) {
    this._priceFilter(target);
    target.on('change input', () => {
      if (!target.val() || target.val() === '.') {
        submit.addClass('disabled');
        received.html(0);
        return;
      }

      const value = new Decimal(target.val());
      const receive = value.sub(fee);
      submit.removeClass('disabled');
      if (receive.cmp(0) <= 0) {
        submit.addClass('disabled');
        return received.html(0);
      }

      received.html(receive.toString());
      received.addClass('pass');

      if (value.cmp(max) > 0) {
        received.removeClass('pass');
        submit.addClass('disabled');
      }

      if (!address.val() || !otp.val())
        submit.addClass('disabled');
    });
  }

  _priceFilter(element, exp = 8) {
    element.on('input', () => {
      element.val(element.val().replace(/[^0-9.]/g,'').replace(/\..*/, curr => "." + curr.replace(/\./g, () => "").slice(0, exp)));
    });
  }

  _goToTrade(market) {
    const container = this._elements.get('container');
    container.element.remove();

    this._market = market.split('/');
    this._write(this._container(Render.PAGE.TRADE, market), 'append');
    this.request.marketList();
  }

  _onCopy(elements) {
    if (!Array.isArray(elements))
      elements = [elements];

    for (let element of elements)
      element.on('click', () => {
        const val = element.attr("value");
        const temp = JQuery("<input style='top:-9999px;position:absolute;'>");
        JQuery("body").append(temp);
        temp.val(val).select();
        document.execCommand("copy");
        temp.remove();
      });
  }

  _orderPutLimit(json) {
    if (json.error)
      console.error(json.error);

    console.log(json)
  }

  _orderPutMarket(json) {
    if (json.error)
      console.error(json.error);

    console.log(json)
  }

  _orderNotify(title, json) {
    const close = JQuery(`<i class="glyph-icon flaticon-remove top-right"></i>`);
    const notification = JQuery(`<div><h1>${obj.title}</h1><span>${obj.text}</span></div>`);

    notification.append(close);
    JQuery("#exchange_notification").append(notification);

    close.on('click', () => { notification.remove(); });
    setTimeout(() => { notification.remove(); }, 2000);
  }

  _businessDeposit(json, args) {
    if (json.error)
      return;

    const result = json.result;
    if (this.request.isReal()) {
      const {address, confirmation} = json.result;
      this._depositReal(...args, result.address, result.confirmation);
    } else {
      this._depositDemo(...args, result.amount, result.next, result.last);
    }
  }

  _businessReload(json, args) {
    const [submit, asset] = args;
    const {failed, amount} = json.result;

    submit.next().remove();

    if (json.error) {
      submit.removeClass('disabled');
      return submit.after('<span class="error">Failed to reload. Please try again later.</span>');
    } else if (failed)
      return submit.after(`<span class="error">Failed to reload, errno: ${failed[0]}, message: ${failed[1]}.</span>`);

    submit.after(`<span class="success">You have successfully reloaded ${amount} ${asset} to your account.</span>`);
  }

  _depositReal(element, asset, address, confirmation) {
    const wrapper = JQuery('<div class="deposit-address"></div>');
    const code = JQuery('<div id="qrcode"></div>').qrcode(address);
    const img = `<img src="${code[0].childNodes[0].toDataURL("image/png")}"/>`;
    const addr = JQuery(`<span value="${address}" title="Copy"><i class="glyph-icon flaticon-copy"></i>${address}</span>`);

    this._onCopy(addr);

    const items = [
      `<h1>${asset} Deposit Address</h1>`,
      addr,
      `<h2>Please note:</h2>`,
      `<label>Send only <b>${asset}</b> to this deposit address.</label>`,
      `<label>Sending any other coin or token to this address may result in the loss of your deposit.</label>`,
      `<label>Coins or tokens will be deposited after <b>${confirmation}</b> network confirmations.</label>`
    ];

    wrapper.html([img, ...items]);
    element.html(wrapper);
  }

  _depositDemo(element, asset, amount, next, last) {
    const wrapper = JQuery('<div class="deposit-demo"></div>');
    const submit = JQuery(`<div class="button">Reload</div>`);
    const items = [
      `<h2>Important:</h2>`,
      `<label>You can reload ${amount}<small>${asset}</small> once per week.</label>`,
      `<label>Demo account coin/token is not real, it cannot be redeemed, withdrawn or claimed.</label>`,
      submit
    ];

    if (next !== 0) {
      items.push(`<span>Last reload: ${new Date(last).format("d-m-Y H:i:s")}</span>`);
      submit.addClass('disabled');
    }

    submit.on('click', () => {
      if (submit.hasClass('disabled'))
        return;

      submit.addClass('disabled');
      this.request.businessReload(submit, asset);
    });

    wrapper.html(items);
    element.html(wrapper);
  }

  _businessWithdraw(json, elements) {
    const [address, amount, submit, result] = elements;

    submit.removeClass('processing').html('Withdraw');

    if (json.result.failed)
      return result.addClass('error').html(`Error: ${json.result.failed[1]}`).show();

    result.removeClass('error').html(`Success! Txid: ${json.result}`).show();
  }

  _deposit(element, asset) {
    this.request.businessDeposit(element, asset);
  }

  _withdraw(element, asset) {
    if (this.request.isReal())
      this._withdrawReal(element, asset);
    else
      this._withdrawDemo(element, asset);
  }

  _withdrawReal(element, asset) {
    const wrapper = JQuery('<div class="withdraw-address"></div>');
    const left = JQuery('<div>');
    const right = JQuery('<div>');
    const address = JQuery(`<input type="text" name="address" placeholder="Address">`);
    const amount = JQuery(`<input type="text" name="amount" placeholder="Amount">`);
    const submit = JQuery(`<span class="button">Withdraw</span>`).addClass('disabled');
    const note = JQuery('<ul>');
    const otp = JQuery('<input type="text" name="otp" maxlength="6" placeholder="One Time Password (OTP)">');
    const receive = JQuery(`<label>You will get: </label>`);
    const received = JQuery(`<span>0</span>`);
    const _asset = this._assets[asset];
    const max = element.parents('tr').prev().find('[name="available"]').eq(0).attr("value");
    const result = JQuery(`<div class="result">`).hide();

    this._onWithdrawChange(amount, _asset.withdrawFee, received, max, submit, address, otp);

    otp.on('input', () => {
      otp.val(otp.val().replace(/[^0-9]/g,''));
      submit.removeClass('disabled');

      if (!otp.val() || !address.val() || !received.hasClass('pass'))
        submit.addClass('disabled');
    });

    address.on('input', () => {
      submit.removeClass('disabled');

      if (!otp.val() || !address.val() || !received.hasClass('pass'))
        submit.addClass('disabled');
    });

    receive.append(received);

    left.html([
      `<h1>${asset} Withdrawal</h1>`,
      address,
      `<i class="text">${asset}</i>`,
      amount,
      `<i class="text">${asset}</i>`,
      otp,
      `<i class="glyph-icon flaticon-otp"></i>`,
      receive,
      `<label class="right">Transaction fee: ${_asset.withdrawFee}</label>`,
      result,
      submit
    ]);

    submit.on('click', () => {
      if (submit.hasClass('disabled'))
        return;

      result.hide();
      const passphrase = this.auth.getPassphrase(otp.val());
      if (!passphrase)
        return result.addClass('error').html(`Invalid otp, ${this.auth.otp.retry} of ${this.auth.otp.maxtry} tries`).show();

      const elements = [ address, amount, submit, result ];
      this.request.businessWithdraw(elements, asset, address.val(), received.text());
      submit.addClass('processing').html('Processing...');
    });

    note.html([
      `<li>Please make sure your withdrawal address (<small>${asset}</small>) is correct.</li>`,
      `<li>Withdrawal process is irreversible once submitted.</li>`
    ]);

    right.html([`<h2>Important:</h2>`, note]);

    element.html(wrapper.html([left, right]));
  }

  _withdrawDemo(element, asset) {
    element.html('<div class="withdraw-demo"><span>Not available for demo/practice account.</span></div>');
  }

  async _getSessions(limit = 10, offset = 0) {
    limit = parseInt(limit);
    offset = parseInt(offset);

    this._prefix
  }
}

function mkdirp(path) {
  return path.split(Path.sep).reduce((curr, folder) => {
    curr += folder + Path.sep;
    if (!FS.existsSync(curr))
      FS.mkdirSync(curr);

    return curr;
  }, '');
}

Render.PAGE = {
  HOME: 'home',
  TRADE: 'trade'
}

Render.ORDER = {
  TYPES: {
    1: "Limit",
    2: "Market"
  },
  SIDE: {
    1: "Sell",
    2: "Buy"
  },
  ROLE: {
    1: "Maker",
    2: "Taker"
  },
  DEALS: {
    PAGE_MAX: 10
  },
  PAGE_MAX: 5,
  RECORD_MAX: 10,
  MAX_QUERY: 100
}

Render.BUSINESS = {
  STATUS: {
    1: "Processing",
    2: "Onhold",
    3: "Completed"
  }
}

Render.ORDER_EVENT = {
  PUT: 1,
  UPDATE: 2,
  FINISH: 3
}

Render.HISTORY = {
  PAGE_MAX: 5,
  RECORD_MAX: 10,
  TIME_MAX: 24 * 60 * 60,
  PERIODS: [7, 30, 90],
  MAX_QUERY: 100,
  DEALS: {
    PAGE_MAX: 10
  },
  BUSINESS: {
    PAGE_MAX_REAL: 6,
    PAGE_MAX_DEMO: 10
  }
}

Render.CHART = {
  PERIODS: {
    //'1M': 60,
    //'5M': 5 * 60,
    //'15M': 15 * 60,
    '1H': 60 * 60,
    '4H': 4 * 60 * 60,
    '1D': 24 * 60 * 60,
    '1W': 7 * 24 * 60 * 60
  },
  DEFAULT_PERIOD: 60 * 60,
  MAX_BAR: 100
}

module.exports = Render;