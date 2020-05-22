import { Component, OnInit, ElementRef, ViewEncapsulation, Input, SimpleChanges, OnChanges, ChangeDetectorRef } from '@angular/core';

import * as d3 from 'd3';
import * as topojson from 'topojson';
import { Subscription } from 'rxjs';
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { tap, catchError, finalize, filter, delay } from 'rxjs/operators';
import { DrillDownService } from '../shared/drilldown.services';

 
@Component({
  selector: 'app-unitedstates-map',
  encapsulation: ViewEncapsulation.None,
  templateUrl: './unitedstates-map.component.html',
  styleUrls: ['./unitedstates-map.component.scss']
})
export class UnitedStatesMapComponent implements OnInit {

  @Input() data: number[];
  hostElement; // Native element hosting the SVG container
  svg; // Top level SVG element
  g; // SVG Group element
  w = window;
  doc = document;
  el = this.doc.documentElement;
  body = this.doc.getElementsByTagName('body')[0];

  projection;
  path;

  width = 960;
  height = 500;


 
  centered;

  legendContainerSettings = {
    x: 0,
    y: this.height ,
    width: 370,
    height: 75,
    roundX: 10,
    roundY: 10
  };

  legendBoxSettings = {
    width: 50,
    height: 15,
    y: this.legendContainerSettings.y + 55
  };

  zoomSettings = {
    duration: 1000,
    ease: d3.easeCubicOut,
    zoomLevel: 5
  };

  formatDecimal = d3.format('.1f');
  legendContainer;

  legendData = [0, 0.2, 0.4, 0.6, 0.8, 1];

  states: any[] = [];
  densities: any[] = [];
  merged: any[] = [];

  legendLabels: any[] = [];
  meanDensity;
  scaleDensity;

  zoom;
  active;

  color = d3.scaleSequential(d3.interpolateReds);

  private _routerSub = Subscription.EMPTY;

  tooltip = d3.select('body').append('div')
    .attr('class', 'tooltip')
    .style('opacity', 0);


  constructor(private elRef: ElementRef, public router: Router, public route: ActivatedRoute, private changeDetectorRef: ChangeDetectorRef, private drillDownService: DrillDownService) {
    this.hostElement = this.elRef.nativeElement;

    this._routerSub = router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.route.params.subscribe(params => {
        if (this.router.url === '/unitedstates' || this.router.url === '/') {
          this.removeExistingMapFromParent();
          this.updateMap();
        }
      });
    });

  }

  ngOnInit() {

  }

  private removeExistingMapFromParent() {
    // !!!!Caution!!!
    // Make sure not to do;
    //     d3.select('svg').remove();
    // That will clear all other SVG elements in the DOM
    d3.select(this.hostElement).select('svg').remove();
  }

  updateMap() {


    this.active = d3.select(null);

    this.projection = d3.geoAlbersUsa()
      .scale(1000)
      .translate([this.width / 2, this.height / 2]);

    this.zoom = d3.zoom()
      // no longer in d3 v4 - zoom initialises with zoomIdentity, so it's already at origin
      // .translate([0, 0]) 
      // .scale(1) 
      .scaleExtent([1, 8])
      .on("zoom", function (d) {
        that.zoomed(d, that)
      });

    this.path = d3.geoPath()
      .projection(this.projection);

    this.svg = d3.select(this.hostElement).append('svg')
      .attr("width", this.width)
      .attr("height", this.height + 75)
      .on("click", this.stopped, true);

    var that = this;

    that.svg.append('rect')
      .attr('class', 'background')
      .attr('width', this.width)
      .attr('height', this.height)
      .on('click', function (d) {
        that.reset(d, that);
      });

    this.svg
      .call(this.zoom); // delete this line to disable free zooming


    that.g = this.svg.append('g');


    d3.csv("./assets/statesdensity.csv")
      .then(function (data) {
        that.densities = data;
      });

    d3.json("./assets/states.json")
      .then(function (data) {

        that.states = data.features;

        that.merged = that.join(that.densities, that.states, "Name", "name", function (state, density) {
          return {
            name: state.properties.name,
            density: (density ? density.Density : 0),
            geometry: state.geometry,
            type: state.type,
            abbrev: (density ? density.FullName : 0)
          };
        });

        //that.merged = that.merged.filter(function (d) { return d.name === 'Georgia' });

        var meanDensity = d3.mean(that.merged, function (d: any) {
          return d.density;
        });

        that.scaleDensity = d3.scaleQuantize()
          .domain([0, meanDensity])
          .range([0, 0.2, 0.4, 0.6, 0.8, 1]);

        that.legendLabels = [
          '<' + that.getPopDensity(0),
          '>' + that.getPopDensity(0),
          '>' + that.getPopDensity(0.2),
          '>' + that.getPopDensity(0.4),
          '>' + that.getPopDensity(0.6),
          '>' + that.getPopDensity(0.8)
        ];


        that.g
          .attr('class', 'county')
          .selectAll('path')
          .data(that.merged)
          .enter()
          .append('path')

          .attr('d', that.path)
          .attr("class", "feature")
          .on("click", function (d) {
            that.clicked(d, that, this)
          })
          .attr('class', 'county')
          .attr('stroke', 'grey')
          .attr('stroke-width', 0.3)
          .attr('cursor', 'pointer')
          .attr('fill', function (d) {
            var countyDensity = d.density;
            var density = countyDensity ? countyDensity : 0;
            return that.color(that.scaleDensity(density))
          })

          .on('mouseover', function (d) {
            that.tooltip.transition()
              .duration(200)
              .style('opacity', .9);

            that.tooltip.html(d.name + '<br/>' + d.density)
              .style('left', (d3.event.pageX) + 'px')
              .style('top', (d3.event.pageY) + 'px');

            that.changeDetectorRef.detectChanges();;
          })
          .on('mouseout', function (d) {
            that.tooltip.transition()
              .duration(300)
              .style('opacity', 0);

            that.changeDetectorRef.detectChanges();;
          });;

        that.legendContainer = that.svg.append('rect')
          .attr('x', that.legendContainerSettings.x)
          .attr('y', that.legendContainerSettings.y)
          .attr('rx', that.legendContainerSettings.roundX)
          .attr('ry', that.legendContainerSettings.roundY)
          .attr('width', that.legendContainerSettings.width)
          .attr('height', that.legendContainerSettings.height)
          .attr('id', 'legend-container')

        var legend = that.svg.selectAll('g.legend')
          .data(that.legendData)
          .enter().append('g')
          .attr('class', 'legend');

        legend.append('rect')
          .attr(
            'x', function (d, i) {
              return that.legendContainerSettings.x + that.legendBoxSettings.width * i + 20;
            })
          .attr('y', that.legendBoxSettings.y)
          .attr('width', that.legendBoxSettings.width)
          .attr('height', that.legendBoxSettings.height)
          .style(
            'fill', function (d, i) {
              return that.color(d);
            })
          .style(
            'opacity', 1)

        legend.append('text')
          .attr(
            'x', function (d, i) {
              return that.legendContainerSettings.x + that.legendBoxSettings.width * i + 30;
            })
          .attr(
            'y', that.legendContainerSettings.y + 52
          )
          .style('font-size', 12)
          .text(function (d, i) {
            return that.legendLabels[i];
          });

        legend.append('text')
          .attr('x', that.legendContainerSettings.x + 13)
          .attr('y', that.legendContainerSettings.y + 29)
          .style(
            'font-size', 14)
          .style(
            'font-weight', 'bold')
          .text('Population Density by State (pop/square mile)');

      });
  }

  getPopDensity(rangeValue) {
    return this.formatDecimal(this.scaleDensity.invertExtent(rangeValue)[1]);
  }

  reset(d, p) {
    p.active.classed("active", false);
    p.active = d3.select(null);

    p.svg.transition()
      .duration(750)
      // .call( zoom.transform, d3.zoomIdentity.translate(0, 0).scale(1) ); // not in d3 v4
      .call(p.zoom.transform, d3.zoomIdentity); // updated for d3 v4
  }

  // If the drag behavior prevents the default click,
  // also stop propagation so we don’t click-to-zoom.
  stopped() {
    if (d3.event.defaultPrevented) d3.event.stopPropagation();
  }

  zoomed(d, p) {
    p.g.style("stroke-width", 1.5 / d3.event.transform.k + "px");
    // g.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")"); // not in d3 v4
    p.g.attr("transform", d3.event.transform); // updated for d3 v4
  }

  clicked(d, p, e) {

    if (p.active.node() === e) return p.reset(d, p);
    p.active.classed("active", false);
    p.active = d3.select(e).classed("active", true);

    var bounds = p.path.bounds(d),
      dx = bounds[1][0] - bounds[0][0],
      dy = bounds[1][1] - bounds[0][1],
      x = (bounds[0][0] + bounds[1][0]) / 2,
      y = (bounds[0][1] + bounds[1][1]) / 2,
      scale = Math.max(1, Math.min(8, 0.9 / Math.max(dx / p.width, dy / p.height))),
      translate = [p.width / 2 - scale * x, p.height / 2 - scale * y];

    // Clean up tool tips
    p.tooltip.transition()
      .duration(300)
      .style('opacity', 0);


    p.svg.transition()
      .duration(750)
      .call(p.zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale))
      .on("end", p.drillDown(translate[0], translate[1], scale, d.abbrev)); // updated for d3 v4


  }

  drillDown(x,y,scale, state) {
    this.drillDownService.scale = scale - .25;
    this.drillDownService.x = x;
    this.drillDownService.y = y + 80;
    this.router.navigateByUrl('/counties/' + state);
  }

  

  join(lookupTable, mainTable, lookupKey, mainKey, select) {
    var l = lookupTable.length,
      m = mainTable.length,
      lookupIndex = [],
      output = [];
    for (var i = 0; i < l; i++) { // loop through l items
      var row = lookupTable[i];
      lookupIndex[row[lookupKey]] = row; // create an index for lookup table
    }
    for (var j = 0; j < m; j++) { // loop through m items
      var y = mainTable[j];
      var x = lookupIndex[y.properties[mainKey]]; // get corresponding row from lookupTable
      output.push(select(y, x)); // select only the columns you need
    }
    return output;
  }
}
