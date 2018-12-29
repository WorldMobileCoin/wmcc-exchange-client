const __chart = {
  init: (market, fwidth, fheight) => {
    const margin = { top: 20, right: 80, bottom: 40, left: 20 };
    const width = fwidth - margin.left - margin.right;
    const height = fheight - margin.top - margin.bottom;

    d3.select('body').selectAll('svg').remove();

    this._svg = d3.select('body').append("svg")
    .attr("width", fwidth).attr("height", fheight);

    const defs = this._svg.append("defs");
    defs.append("clipPath").attr("id", "ohlcClip")
        .append("rect").attr("x", 0).attr("y", 0).attr("width", width).attr("height", height);

    this._scaleX = techan.scale.financetime().range([0, width]);
    this._scaleY = d3.scaleLinear().range([height, 0]);
    this._scaleV = d3.scaleLinear().range([this._scaleY(0), this._scaleY(0.2)]);
    this._zoomX = d3.zoom().scaleExtent([1, 1]).on("zoom", __chart.zoom);

    this._pOhlc = techan.plot.candlestick().xScale(this._scaleX).yScale(this._scaleY);
    this._pVol = techan.plot.volume().accessor(this._pOhlc.accessor()).xScale(this._scaleX).yScale(this._scaleV);

    this._axisX = d3.axisBottom(this._scaleX);
    this._axisY = d3.axisRight(this._scaleY).tickFormat(d3.format(".2f"));
    this._axisV = d3.axisLeft(this._scaleV).ticks(3).tickFormat(d3.format(",.3s"));

    this._xTime = techan.plot.axisannotation().axis(this._axisX)
      .orient('bottom').format(d3.timeFormat('%Y-%m-%d %H:%M'))
      .width(100).translate([0, height]);
    this._xOhlc = techan.plot.axisannotation().axis(this._axisY).width(90)
      .translate([width, 0]).orient('left').format(d3.format('.8f'));
    const xVol = techan.plot.axisannotation().axis(this._axisV)
      .translate([width, 0]).orient('right').width(35);
    this._xX = techan.plot.crosshair().xScale(this._scaleX).yScale(this._scaleY)
      .xAnnotation(this._xTime).yAnnotation([this._xOhlc, xVol]).on("move", __chart.move);
    this._xClose = techan.plot.axisannotation().axis(this._axisY).accessor(this._pOhlc.accessor())
            .orient('right').format(d3.format('.4f')).translate([this._scaleX(1), 0]).width(80);

    const gMain = this._svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const gOhlc = gMain.append("g").attr("class", "ohlc").attr("transform", "translate(0,0)");

    gOhlc.append("g").attr("class", "volume").attr("clip-path", "url(#ohlcClip)");
    gOhlc.append("g").attr("class", "candlestick").attr("clip-path", "url(#ohlcClip)");

    gMain.append("g").attr("class", "x axis").attr("transform", `translate(0,${height})`);
    gMain.append("g").attr("class", "y axis").attr("transform", `translate(${width},0)`)
      .append("text").attr("transform", "rotate(-90)").attr("y", -10).attr("dy", 0)
      .style("text-anchor", "end").text(`Price ( ${market.replace("/", " / ")} )`);
    gMain.append("g").attr("class", "volume axis").attr("transform", `translate(${width},0)`);
    gMain.append('g').attr("class", "crosshair ohlc");
    gMain.append("g").attr("class", "close annotation");

    this._xText = gMain.append('text').style("text-anchor", "start")
      .attr("class", "ohlc-text");
  },
  feed: (records) => {
    this.data = [];

    for (let record of records) {
      this.data.push({
        date: new Date(record[0] * 1000),
        open: +record[1],
        close: +record[2],
        high: +record[3],
        low: +record[4],
        volume: +record[5]
      });
    }

    __chart.draw();
  },
  update: (record) => {
    if (!this.data)
      this.data = [];

    const idx = this.data.length - 1;
    const last = this.data[idx];

    if (JSON.stringify(record) === JSON.stringify(last))
      return;

    const data = {
      date: new Date(record[0] * 1000),
      open: +record[1],
      close: +record[2],
      high: +record[3],
      low: +record[4],
      volume: +record[5]
    }

    if (data.date*1 === last.date*1)
      this.data[idx] = data;
    else
      this.data.push(data);

    __chart.draw();
  },
  draw: () => {
    const sliced = this.data.slice(this.data.length - 100, this.data.length);
    if (sliced.length === 1)
      sliced.push(sliced[0])
    this._scaleX.domain(sliced.map(this._pOhlc.accessor().d));
    this._scaleY.domain(techan.scale.plot.ohlc(sliced).domain());
    this._scaleV.domain(techan.scale.plot.volume(sliced).domain());

    this._svg.each((nil, idx, svgs) => {
      const svg = d3.select(svgs[idx]);
      svg.call(this._zoomX);
      svg.select('g.x.axis').call(this._axisX);
      svg.select('g.y.axis').call(this._axisY);
      svg.select("g.volume.axis").call(this._axisV);
      svg.select("g.candlestick").datum(this.data).call(this._pOhlc);
      svg.select("g.volume").datum(this.data).call(this._pVol);
      svg.select("g.crosshair.ohlc").call(this._xX);

      const last = this.data[this.data.length-1];
      if (last) {
        const direction = last.open === last.close ? 'flat': last.open < last.close ? 'up': 'down';
        svg.select("g.close.annotation").attr("class", `close annotation ${direction}`).datum([last]).call(this._xClose);
      }
    });
  },
  move: (coords) => {
    try {
      const bisect = d3.bisector((d) => { return d.date}).left;
      const crosshair = this._svg.select("g.crosshair.ohlc").node();
      const x0 = this._scaleX.invert(d3.mouse(crosshair)[0]);
      const i = bisect(data, x0, 1);
      const d0 = data[i-1];
      const d1 = data[i];
      const d = x0 - d0.date > d1.date - x0 ? d1 : d0;
      const direction = d.open === d.close ? 'flat': d.open < d.close ? 'up': 'down';
            //console.error(d)
      this._xText.selectAll('tspan').remove();
      this._xText.append('tspan').attr("class", "ohlc-label").text('O: ');
      this._xText.append('tspan').attr("class", `ohlc-${direction}`).text(d.open);
      this._xText.append('tspan').attr("class", "ohlc-label").text(' H: ');
      this._xText.append('tspan').attr("class", `ohlc-${direction}`).text(d.high);
      this._xText.append('tspan').attr("class", "ohlc-label").text(' L: ');
      this._xText.append('tspan').attr("class", `ohlc-${direction}`).text(d.low);
      this._xText.append('tspan').attr("class", "ohlc-label").text(' C: ');
      this._xText.append('tspan').attr("class", `ohlc-${direction}`).text(d.close);//.text(`O: ${d.open}, H: ${d.high}, L: ${d.low}, C: ${d.close}`);
    } catch (e) {;}
  },
  zoom: (nil, idx, svgs) => {
    //console.error(idx);
  }
}

window.addEventListener('message', function(event) {
  if (event.data.init)
    __chart.init(event.data.market, event.data.width, event.data.height);
  else if (event.data.draw)
    __chart.feed(event.data.records);
  else if (event.data.update)
    __chart.update(event.data.record);
});
