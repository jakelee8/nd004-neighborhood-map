let googleReady, googleError;

(function () {
  'use strict';

  /**
   * Base view.
   */
  class View {
    constructor (data) {
      this.init();
      this.update(data);
    }

    update (data) {
      if (data) {
        for (let key in data) {
          let prop = this[key];
          if (prop && typeof prop === 'function') {
            prop(data[key]);
          }
        }
      }
    }

    init () {}
  }

  /**
   * Page view.
   */
  class PageView extends View {
    get overpassURI () {
      return 'https://api.openstreetmap.fr/oapi/interpreter';
    }

    init () {
      // Bind and debounce methods
      this.search = _.debounce(this.search.bind(this), 500);
      this.onSelect = this.onSelect.bind(this);
      this.onQueryChange = this.onQueryChange.bind(this);
      this.onFilterChange = this.onFilterChange.bind(this);
      this.onResult = this.onResult.bind(this);

      // Create observables
      this.query = ko.observable();
      this.places = ko.observableArray();
      this.amenities = ko.observableArray(['']);
      this.selectedPlace = ko.observable();
      this.selectedAmenity = ko.observable();
      this.expanded = ko.observable(false);
      this.pending = ko.observable(false);
      this.error = ko.observable();

      // Create calculated observables
      this.filteredPlaces = ko.computed(() => {
        let places = this.places();
        var amenity = this.selectedAmenity();
        if (amenity) {
          places = ko.utils.arrayFilter(places, (it) => {
            return it.amenity == amenity;
          });
        }
        return places;
      });

      // Create child views
      this.map = new GoogleMapView();

      // Open place info on selection
      this.selectedPlace.subscribe(this.onSelect);

      // Trigger search on search field change
      this.query.subscribe(this.onQueryChange);

      // Update map markers on filter change
      this.filteredPlaces.subscribe(this.onFilterChange);
    }

    /**
     * Bind this view to the provided DOM root.
     *
     * @param {DOMNode} $root
     */
    bind ($root) {
      // Apply bindings between self and root
      ko.applyBindings(this, $root);
    }

    onSelect () {
      if (this._place) {
        this._place._marker.blur();
      }
      let place = this._place = this.selectedPlace();
      if (place) {
        place._marker.focus();
      }
    }

    onFilterChange () {
      let amenity = this.selectedAmenity();
      // Update map markers
      this.places().forEach((place) => {
        place._marker.visible(!amenity || place.amenity == amenity);
      });
    }

    onQueryChange () {
      this.search({
        query: this.query(),
        amenity: this.selectedAmenity()
      }, this.onResult);
    }

    /**
     * Search for nearby places and update model.
     *
     * @param {Object} [options] Search options
     * @param {String} [options.query] A search query
     * @param {String} [options.amenity] An amenity category
     */
    search (options, fn) {
      let center = this.map.center();
      if (!center) {
        this.error('Google Maps unavailable.');
        return;
      }

      if (!options) {
        options = {};
      }

      // Build query
      let query = ('(around:' + (20000 / this.map.zoom()) + ',' +
                   center.lat() + ',' + center.lng() + ')');
      query += '[name][amenity]';
      let q = _.trim(options.query || '');
      if (q) {
        q = q.replace(/[^a-z0-9]+/ig, '.*');
        query += '[~"."~"' + q + '",i]';
      }

      let params = {
        data: '[out:json];node' + query + ';out meta 100;'
      };

      this.pending(true);
      this.error(null);

      $.getJSON(this.overpassURI, params, (data) => {
        if (fn && data) {
          fn(data);
        }
      })
        .fail(() => this.error('Unable to complete request.'))
        .always(() => this.pending(false));
    }

    onResult (data) {
      // Clear map of markers
      this.selectedPlace(null);
      this.map.clearMarkers();

      // Get list of known amenities.
      let amenity = this.selectedAmenity();
      let amenities = this.amenities();

      // Process results
      let places = [];
      data.elements.forEach((it) => {
        // Skip tagless results
        if (!it || !it.tags) return;
        // Process single result into place
        let place = this._makePlace(it);
        // Add map marker
        let marker = place._marker = this.map.addMarker(place.location);
        // Add marker click handler
        marker.on('click', () => this.selectedPlace(place));
        // Hide the marker if filtered
        marker.visible(!amenity || place.amenity == amenity);
        // Collect place
        places.push(place);
        // Update amenities
        if (amenities.indexOf(place.amenity) < 0) {
          amenities.push(place.amenity);
        }
      });

      // Update search result and amenities
      this.places(places);
      this.amenities(amenities);

      // Set error message if empty results
      if (!places.length) {
        this.error('No places found.');
      }
    }

    _makePlace (it) {
      // Create place object
      let place = {
        id: it.id,
        location: {lat: it.lat, lng: it.lon},
        address: 'Address not available',
        phone: 'Phone number not available.'
      };

      // Build address
      let addr = [];
      if (it.tags['addr:housenumber']) {
        addr.push(it.tags['addr:housenumber']);
      }
      if (it.tags['addr:street']) {
        addr.push(it.tags['addr:street']);
      }
      if (it.tags['addr:postcode']) {
        addr.push(it.tags['addr:postcode']);
      }
      addr = addr.join(' ');
      if (it.tags['addr:city']) {
        addr += (addr ? ', ' : ' ') + it.tags['addr:city'];
      }
      if (addr) {
        place.address = addr;
      }

      // Collect remaining tags
      let tags = [];
      for (let key in it.tags) {
        switch (key) {
          case 'name':
          case 'amenity':
          case 'phone':
          case 'website':
            place[key] = it.tags[key];
            break;
          case 'source':
            place.source = it.tags.source.replace(/;/g, ', ');
            break;
          default:
            if (!key.startsWith('addr:') && !key.startsWith('checked_exists:')) {
              tags.push({ name: key, value: it.tags[key]});
            }
        }
      }

      // Save tags.
      place.tags = tags;

      return place;
    }
  }

  /**
   * Google Map view.
   */
  class GoogleMapView extends View {
    init () {
      this.ready = ko.observable();
      this._markers = [];
    }

    /**
     * Bind view to DOM.
     *
     * @param $root DOM node to use for displaying Google Maps
     */
    bind ($root) {
      // Create new Google Maps canvas
      this._map = new google.maps.Map($root, {
        center: {lat: 47.608013, lng: -122.335167},  // Seattle
        zoom: 14,
        mapTypeControl: false
      });
      // Ready!
      this.ready(true);
    }

    /**
     * Add listener callback.
     *
     * @param {String} eventName The event name.
     * @param {Function} fn The callback function.
     */
    on (eventName, fn) {
      google.maps.event.addListener(this._map, 'click', fn);
    }

    /**
     * Get the center of the box.
     *
     * @return {google.maps.LatLng}
     */
    center () {
      return this._map && this._map.getCenter();
    }

    /**
     * Get the bounding box of the map.
     *
     * @return {google.maps.LatLngBounds}
     */
    bbox () {
      return this._map && this._map.getBounds();
    }

    /**
     * Get the map zoom level.
     *
     * @return {Number}
     */
    zoom () {
      return this._map && this._map.getZoom();
    }

    /**
     * Add a new marker for the given location on the map.
     *
     * @param {google.maps.LatLng} location
     */
    addMarker (position) {
      // Create a marker for this place
      let marker = new GoogleMapsMarkerView(this._map, position);
      // Add the place to the places list
      this._markers.push(marker);
      return marker;
    }

    /**
     * Clear markers from the map.
     */
    clearMarkers () {
      // Remove markers from the map
      this._markers.forEach((marker) => { marker.remove(); });
      // Clear the markers list
      this._markers.length = 0;
    }
  }

  class GoogleMapsMarkerView {
    constructor (map, position) {
      this._map = map;
      this._position = position;
      // Create a marker for this place
      this._marker = new google.maps.Marker({map: map, position: position});
    }

    /**
     * Add listener callback.
     *
     * @param {String} eventName The event name.
     * @param {Function} fn The callback function.
     */
    on (eventName, fn) {
      google.maps.event.addListener(this._marker, eventName, fn);
    }

    /**
     * Remove this marker from the map.
     */
    remove () {
      this._marker.setMap(null);
      google.maps.event.clearInstanceListeners(this._marker);
    }

    /**
     * Focus on this marker.
     */
    focus () {
      this._marker.setZIndex(1000);
      this._marker.setIcon('assets/img/flag.png');
      this._marker.setAnimation(google.maps.Animation.DROP);
      this._map.panTo(this._position);
    }

    /**
     * Unfocus from this marker.
     */
    blur () {
      this._marker.setZIndex();
      this._marker.setIcon();
    }

    /**
     * Get or set visibility.
     */
    visible () {
      if (arguments.length) {
        this._marker.setVisible(arguments[0]);
      } else {
        return this._marker.getVisible();
      }
    }
  }

  // Initialize Zurb Foundation
  $(document).foundation();

  // Create page view
  let page = new PageView();

  // Apply KnockoutJS bindings
  page.bind();

  /**
   * Google Maps API callback.
   */
  googleReady = function () {
    // Create Google Maps canvas
    page.map.bind(document.getElementById('map'));
    // Manually trigger search
    page.onQueryChange();
  };

  /**
   * Handle Google Maps loading error.
   */
  googleError = function () {
    page.map.ready(true);
  };
})();
