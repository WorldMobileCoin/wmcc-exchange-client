/*!
 * Copyright (c) 2018, Park Alter (pseudonym)
 * Distributed under the MIT software license, see the accompanying
 * file COPYING or http://www.opensource.org/licenses/mit-license.php
 *
 * https://github.com/worldmobilecoin/wmcc-exchange-client
 */

const Assert = require('assert');
const {JQuery} = require('./vendor');
const Decimal = require('wmcc-decimal');

class Table {
  constructor(options) {
    this.options = new TableOptions(options);
    this.body = JQuery(`<table></table>`);
    this.head = null;
    this.rows = [];
    this.data = [];
    this._page = this.options.page;

    this._init();
  }

  _init() {
    if (this.options.head.length > 0)
      this.thead(this.options);

    if (this.options.id)
      this.body.attr('id', this.options.id);

    if (this.options.class)
      this.body.addClass(this.options.class);
  }

  render() {
    this.body.html(this.head);
    const offset = this._page ? this._page[0]*this._page[1]: null;
    const limit = this._page ? this._page[1]: null;

    if (!this.rows.length) {
      this._empty = JQuery(`<tr class="empty"><td colspan="${this.head.find('th').length}"><i class="glyph-icon flaticon-record"></i>No Records Found</td></tr>`);
      this.body.append(this._empty);
    }

    for (let [idx, row] of this.rows.entries()) {
      if (offset !== null && (idx < offset || idx > offset+limit-1))
        row.addClass('hide');

      this.body.append(row);
    }

    if (offset !== null)
      return [this.body, this.paging(this.rows, offset, limit)];

    return this.body;
  }

  paging(rows, offset, limit, length) {
    length = rows ? rows.length: length;
    const prev = offset - limit;
    const next = offset + limit;
    const current = parseInt(offset/limit+1);
    const max = Math.ceil(length/limit);
    const {start, end} = median(current, max, 10);

    const page = JQuery('<div class="page">');
    const html = [
      `<a ${(offset === 0) ? 'class="disable"' : 'offset="'+prev+'" limit="'+limit+'"'}>&#9668;</a>`,
      `<a ${(next+1 > length) ? 'class="disable"' : 'offset="'+next+'" limit="'+limit+'"'}>&#9658;</a>`
    ];

    for(let i=start; i<end; i++)
      html.splice(-1, 0, `<a ${(current === i+1) ? 'class="active"' : 'offset="'+(limit*i)+'" limit="'+limit+'"'}>${i+1}</a>`);

    page.html(html.join(''));

    if (!rows)
      return page;

    page.find('a').on('click', (evt) => {
      const el = JQuery(evt.target);
      if (el.is('.active, .disable'))
        return;

      const _offset = parseInt(el.attr('offset'));
      const _limit = parseInt(el.attr('limit'));
      for (let [idx, row] of rows.entries()) {
        row.removeClass('hide');
        if (_offset !== null && (idx < _offset || idx > _offset+_limit-1))
          row.addClass('hide');

        page.html(this.paging(this.rows, _offset, _limit));
      }
    });

    return page;
  }

  thead(options) {
    this.head = this.trow()[0];

    let count = 0;
    options.head.forEach((item, idx) => {
      const th = JQuery(`<th>${item}</th>`);
      if (options.sort.includes(idx)) {
        th.addClass('sort');
        this.sort(th, idx, options.type[count++]);
      }

      this.head.append(th);
    });
  }

  trow(length = 1) {
    return Array.from({length: length}, () => JQuery(`<tr></tr>`));
  }

  tdata(length) {
    length = this.options.length || length;

    return Array.from({length: length}, () => JQuery(`<td></td>`));
  }

  append(row) {
    this.rows.push(row);
  }

  insert(rows) {
    if (!Array.isArray(rows))
      rows = [rows];

    if (this._empty)
      this._empty.remove();

    for (let row of rows) {
      if (this.options.compare)
        this.options.compare(rows, row, this);
      else
        this.body.find('tr:first').after(row);

      this.rows.push(row);
    }

    if (!this.options.max)
      return;

    const len = this.body.children('tr').length - this.options.max;
    if (len > 0)
      this.body.find(`tr:nth-last-child(-n+${len})`).remove();
  }

  sort(th, idx, type) {
    th.on('click', () => {
      this.body.find('th').removeClass('ascending descending');
      this.body.find(`tr:has(td[sub])`).remove();

      th.asc = !th.asc;
      th.addClass(th.asc?`ascending`:`descending`);

      this.body.find(`tr:not([sub]):has(td)`).sort((next, prev) => {
        let _prev = JQuery(`td:eq(${idx})`, prev);
        let _next = JQuery(`td:eq(${idx})`, next);

        _prev = _prev.attr("value") || _prev.text();
        _next = _next.attr("value") || _next.text();

        let cmp;

        if (type === 'decimal') {
          const decimal = new Decimal(_next.replace(/[^0-9\.-]/g, ''));
          cmp = decimal.cmp(_prev.replace(/[^0-9\.-]/g, ''));
        } else {
          cmp = _next.localeCompare(_prev);
        }

        return th.asc ? cmp: cmp*-1;
      }).appendTo(this.body);
    });
  }

  theme(name) {
    this.body.addClass(name);
  }
}

class TableOptions {
  constructor(options) {
    this.head = [];
    this.sort = [];
    this.type = [];
    this.id = null;
    this.class = null;
    this.theme = 'light';
    this.length = 0;
    this.max = 0;
    this.page = null;
    this.compare = null;

    this.fromOptions(options);
  }

  fromOptions(options) {
    if (options.head != null) {
      Assert(Array.isArray(options.head));
      for (let name of options.head)
        Assert(typeof name === 'string');

      this.head = options.head;
    }

    if (options.sort != null) {
      Assert(Array.isArray(options.sort));
      for (let idx of options.sort)
        Assert(typeof idx === 'number');

      this.sort = options.sort;
    }

    if (options.type != null) {
      Assert(Array.isArray(options.type));
      for (let idx of options.type)
        Assert(typeof idx === 'string');

      this.type = options.type;
    }

    if (options.id != null) {
      Assert(typeof options.id === 'string');
      this.id = options.id;
    }

    if (options.class != null) {
      Assert(typeof options.class === 'string');
      this.class = options.class;
    }

    if (options.theme != null) {
      Assert(typeof options.theme === 'string');
      this.theme = options.theme;
    }

    this.length = this.head.length;
    if (options.length != null) {
      Assert(typeof options.length === 'number');
      this.length = options.length;
    }

    if (options.max != null) {
      Assert(typeof options.max === 'number');
      this.max = options.max;
    }

    if (options.compare != null) {
      Assert(typeof options.compare === 'function');
      this.compare = options.compare;
    }

    if (options.page != null) {
      Assert(Array.isArray(options.page));
      Assert(options.page.length === 2);
      for (let int of options.page)
        Assert(typeof int === 'number')

      this.page = options.page;
    }
  }
}

function median(c, m, l) {
  let s = Math.max(0, c-(l/2));
  const e = Math.min(s+l, m);
  s = Math.max(0,Math.min(e-l, e));
  return {start: s, end: e};
}

module.exports = Table;