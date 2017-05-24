'use strict';

let initMap = (function () {
  /**
   * Google Maps PlaceResult model.
   */
  class Place {
    /**
     * Constructor.
     *
     * @param place Google Maps PlaceResult instance
     * @param map Map instance
     */
    constructor (place, map) {
      this._place = place;

      // Create a marker for this place
      this._marker = new google.maps.Marker({
        map: map._map, position: place.geometry.location
      });

      // Populate the model
      this.fromJS(place);

      // Create a proxied select method to select this place
      this.select = map.select.bind(map, this);
    }

    fromJS (place) {
      this.id = place.place_id;
      this.name = place.name;
      this.address = place.vicinity;
      this.tags = place.types;

      this.icon = place.icon;
      this.photos = (place.photos || []).map((it) => {
        return new PlacePhoto(it);
      });
    }
  }

  /**
   * Google Maps Place Photo model.
   */
  class PlacePhoto {
    /**
     * Constructor.
     *
     * @param placePhoto Google Maps PlacePhoto instance
     */
    constructor (placePhoto) {
      this.fromJS(placePhoto);
    }

    /**
     * Update the values on this model with the provided values.
     *
     * @param placePhoto Google Maps PlacePhoto instance
     */
    fromJS (placePhoto) {
      this.width = placePhoto.width;
      this.height = placePhoto.height;
      this.htmlAttributions = placePhoto.html_attributions;
      this.url = placePhoto.getUrl({maxWidth: 160, maxHeight: 160});
    }
  }

  /**
   * Map model.
   */
  class Map {
    /**
     * Constructor.
     *
     * @param $map DOM node to use for displaying Google Maps
     */
    constructor ($map) {
      // Bind and debounce search method
      this.search = this.search.bind(this);
      this.search = _.debounce(this.search, 500);
      this.select = this.select.bind(this);
      this.select = _.debounce(this.select, 200);
      this.createMarker = this.createMarker.bind(this);

      // Create observables
      this.query = ko.observable();
      this.places = ko.observableArray();
      this.selected = ko.observable();
      this.requestPending = ko.observable(false);
      this.emptyResults = ko.observable(false);

      // Create new Google Maps canvas
      this._map = new google.maps.Map($map, {
        center: {lat: 47.608013, lng: -122.335167},  // Seattle
        zoom: 12,
        mapTypeControl: false
      });

      // Create places API client
      this.placesService = new google.maps.places.PlacesService(this._map);

      // Create single map info window
      this.infoWindow = new google.maps.InfoWindow();

      // Add click listener
      google.maps.event.addListener(this._map, 'click', (event) => {
        if (!event.__map_handled) {
          this.select();
        }
      });

      // Trigger search on search field change
      this.query.subscribe(this.search);

      // Trigger change to info window on select
      this.selected.subscribe(() => {
        let place = this.selected();
        if (place) {
          this.infoWindow.open(this._map, place._marker);
        } else {
          this.infoWindow.close();
        }
      });
    }

    /**
     * Search for nearby places and update model.
     */
    search () {
      this.requestPending(true);
      this.emptyResults(false);
      this.placesService.nearbySearch({
        bounds: this._map.getBounds(),
        keyword: this.query() || void 0
      }, (results, status) => {
        this.requestPending(false);
        if (status == google.maps.places.PlacesServiceStatus.OK) {
          this.replaceMarkers(results);
        } else {
          this.emptyResults(true);
          this.clearMarkers();
        }
      });
    }

    /**
     * Select the given place.
     *
     * @param place A Place instance
     */
    select (place) {
      // Reset old place marker
      let oldPlace = this.selected();
      if (oldPlace) {
        oldPlace._marker.setIcon();
      }
      // Animate the marker
      if (place) {
        place._marker.setIcon('assets/img/red-flag.svg');
        place._marker.setAnimation(google.maps.Animation.DROP);
      }
      // select new place
      this.selected(place);
    }

    /**
     * Create a marker for the given place on the map.
     *
     * @param place A Google Maps PlaceResult
     */
    createMarker (place) {
      place = new Place(place, this);

      // Listen for click events to select this place
      google.maps.event.addListener(place._marker, 'click', (event) => {
        this.select(place);
        // Mark the event as handled
        event.__map_handled = true;
      });

      // Add the place to the places list
      this.places.push(place);
    }

    /**
     * Replace markers with the given results.
     *
     * @param results Array of Google Maps PlaceResult
     */
    replaceMarkers (results) {
      this.clearMarkers();
      results.forEach(this.createMarker);
    }

    /**
     * Clear markers from the map.
     */
    clearMarkers () {
      // Remove markers from the map
      this.places().forEach((place) => {
        place._marker.setMap(null);
        google.maps.event.clearInstanceListeners(place._marker);
      });
      // Remove markers from the observable
      this.places.removeAll();
    }
  }

  // Initialize Zurb Foundation
  $(document).foundation();

  /**
   * Google Maps API callback.
   */
  return function () {
    // Get DOM nodes
    let $map = document.getElementById('map');
    let $places = document.getElementById('places');
    let $placeInfo = document.getElementById('place-info');

    // Create map data model
    let map = new Map($map);

    // Apply KnockoutJS bindings
    ko.applyBindings(map, $places);

    // Set info window content to place info
    map.selected.subscribe(() => {
      let place = map.selected();
      if (place) {
        let target = map.infoWindow.getContent();
        if (!target || typeof target === 'string') {
          target = document.createElement('div');
        }
        ko.renderTemplate('place-info-template', place, {}, target);
        map.infoWindow.setContent(target);
        // Close off-canvas drawer
        $($places).foundation('close');
      }
    });

    // Manually trigger search
    map.search();
  };
})();
