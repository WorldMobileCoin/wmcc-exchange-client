/*!
 * Copyright (c) 2018, Park Alter (pseudonym)
 * Distributed under the MIT software license, see the accompanying
 * file COPYING or http://www.opensource.org/licenses/mit-license.php
 *
 * https://github.com/worldmobilecoin/wmcc-exchange-client
 */

class Packet extends Map {
  constructor(logger, timeout = 30000) {
    super();

    this.timeout = timeout;
    this.dropped = new Map();

    if (logger)
      logger.context('client-packet');
  }

  put(key, value) {
    return this.set(key, value);

    setTimeout(() => {
      if (!this.has(key))
        return;

      this.dropped.set(key, value);
      this.delete(key);

      if (logger)
        logger.debug('Reach reply timeout, packet: %s', value);
    }, this.timeout);
  }
}

module.exports = Packet;