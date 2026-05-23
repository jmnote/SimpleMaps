(function () {
  "use strict";

  let loadPromise;

  async function loadLf(leafletDistUrl) {
    if (!loadPromise) {
      loadPromise = (async () => {
        const distUrl = leafletDistUrl.replace(/\/?$/, "/");
        const leafletJsUrl = distUrl + "leaflet.js";
        const leafletCssUrl = distUrl + "leaflet.css";
        mw.loader.load(leafletCssUrl, "text/css");
        await mw.loader.getScript(leafletJsUrl);
        if (typeof L === "undefined") {
          throw new Error("Leaflet loaded but L is not defined");
        }
        return L;
      })();
    }
    return loadPromise;
  }

  const SM = {
    init: async function ($content) {
      const $maps = $content.find(".mw-simple-maps");
      if (!$maps.length) {
        return;
      }

      const firstMapData = $maps.first().data("map-data") || {};
      if (!firstMapData.leaflet_dist_url) {
        console.error("SimpleMaps: Missing leaflet_dist_url");
        return;
      }
      const leafletDistUrl = firstMapData.leaflet_dist_url;

      try {
        await loadLf(leafletDistUrl);
        $maps.each(function () {
          const $el = $(this);
          if ($el.data("mw-sm-init")) {
            return;
          }
          $el.data("mw-sm-init", true);

          const data = $el.data("map-data");
          SM.render($el, data);
        });
      } catch (err) {
        console.error("SimpleMaps: Failed to load Leaflet", err);
      }
    },

    render: function ($el, data) {
      const zoom = parseInt(data.zoom) || 14;
      const hasExplicitZoom =
        data.zoom_explicit === 1 ||
        data.zoom_explicit === "1" ||
        data.zoom_explicit === true;
      const explicitZoomOffset = 4;
      const explicitZoomOffsetDistanceThresholdM = 500000;
      const scrollzoom = (data.scrollzoom || data.scrollwheelzoom || "")
        .toString()
        .trim()
        .toLowerCase();
      const isScrollWheelZoomEnabled = !(
        scrollzoom === "off" ||
        scrollzoom === "false" ||
        scrollzoom === "0" ||
        scrollzoom === "no"
      );
      const defaultMarkerColor = (data.markercolor || "blue").trim();
      const defaultShapeColor = (data.shapecolor || "red").trim();
      const defaultGeoJsonColor = (data.geojsoncolor || "blue").trim();
      const parseShapeStyle = function (parts, includeFillOptions) {
        const partColor = (parts[3] || "").trim();
        const color = partColor || defaultShapeColor;
        const style = {
          color: color,
          opacity: parseFloat(parts[4]) || 1,
          weight: parseInt(parts[5]) || 2,
        };

        if (includeFillOptions) {
          const partFillColor = (parts[6] || "").trim();
          style.fillColor = partFillColor || color;
          style.fillOpacity = parseFloat(parts[7]) || 0.2;
        }

        return style;
      };

      const map = L.map($el[0]).setView([0, 0], 1);
      if (!isScrollWheelZoomEnabled) {
        map.scrollWheelZoom.disable();
      }

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      const bounds = L.latLngBounds();
      let hasItems = false;

      let centerLatLng = null;
      if (data.center) {
        SM.loc(data.center, function (latlng) {
          centerLatLng = latlng;
        });
      }

      let locs = [];
      if (data.locations) locs = data.locations.split(";");

      locs.forEach(function (locStr) {
        SM.loc(locStr, function (latlng, info) {
          const markerColor = (info.color || "").trim() || defaultMarkerColor;
          const markerPath =
            "M5.59,10.48A7.2,7.2 0 1 1 18.41,10.48Q16,15 12,23Q8,15 5.59,10.48z";
          const markerSvg =
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="' +
            markerColor +
            '" stroke="white" stroke-width="0.5" d="' +
            markerPath +
            '"/><circle cx="12" cy="7.2" r="2.5" fill="white" /></svg>';
          const markerIconUrl =
            "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(markerSvg);
          const leafletDistUrl = data.leaflet_dist_url.replace(/\/?$/, "/");
          const markerShadowUrl = leafletDistUrl + "images/marker-shadow.png";

          const customIcon = L.icon({
            iconUrl: markerIconUrl,
            shadowUrl: markerShadowUrl,
            iconSize: [32, 32],
            iconAnchor: [16, 31],
            popupAnchor: [0, -31],
            shadowSize: [30, 30],
            shadowAnchor: [9, 30],
            className: "mw-sm-pin",
          });

          const markerOptions = { icon: customIcon };
          if (info.title) {
            markerOptions.title = info.title;
          }
          const marker = L.marker(latlng, markerOptions).addTo(map);
          if (info.title) {
            let popupContent = "<b>" + info.title + "</b>";
            if (info.text) popupContent += "<br>" + info.text;
            marker.bindPopup(popupContent);
          }
          bounds.extend(latlng);
          hasItems = true;
        });
      });

      if (data.lines) {
        data.lines.split(";").forEach(function (lineStr) {
          const parts = lineStr.split("~");
          const pointsStr = parts[0].split(":");
          const title = parts[1] || "";
          const text = parts[2] || "";
          const lineStyle = parseShapeStyle(parts, false);

          const latlngs = [];
          let processedCount = 0;

          pointsStr.forEach(function (p, i) {
            SM.loc(
              p,
              function (latlng) {
                latlngs[i] = latlng;
                processedCount++;
                if (processedCount === pointsStr.length) {
                  const validLatlngs = latlngs.filter(Boolean);
                  if (validLatlngs.length >= 2) {
                    const polyline = L.polyline(validLatlngs, lineStyle).addTo(
                      map,
                    );
                    if (title)
                      polyline.bindPopup("<b>" + title + "</b><br>" + text);
                    bounds.extend(polyline.getBounds());
                    hasItems = true;
                  }
                }
              },
              function () {
                processedCount++;
              },
            );
          });
        });
      }

      if (data.polygons) {
        data.polygons.split(";").forEach(function (polyStr) {
          const parts = polyStr.split("~");
          const pointsStr = parts[0].split(":");
          const title = parts[1] || "";
          const text = parts[2] || "";
          const polygonStyle = parseShapeStyle(parts, true);

          const latlngs = [];
          let processedCount = 0;

          pointsStr.forEach(function (p, i) {
            SM.loc(
              p,
              function (latlng) {
                latlngs[i] = latlng;
                processedCount++;
                if (processedCount === pointsStr.length) {
                  const validLatlngs = latlngs.filter(Boolean);
                  if (validLatlngs.length >= 3) {
                    const polygon = L.polygon(validLatlngs, polygonStyle).addTo(
                      map,
                    );
                    if (title)
                      polygon.bindPopup("<b>" + title + "</b><br>" + text);
                    bounds.extend(polygon.getBounds());
                    hasItems = true;
                  }
                }
              },
              function () {
                processedCount++;
              },
            );
          });
        });
      }

      if (data.circles) {
        data.circles.split(";").forEach(function (circleStr) {
          const parts = circleStr.split("~");
          const subParts = parts[0].split(":");
          const centerStr = subParts[0];
          const radius = parseFloat(subParts[1]) || 100;
          const title = parts[1] || "";
          const text = parts[2] || "";
          const circleStyle = parseShapeStyle(parts, true);

          SM.loc(
            centerStr,
            function (latlng) {
              const circle = L.circle(
                latlng,
                Object.assign({ radius: radius }, circleStyle),
              ).addTo(map);
              if (title) circle.bindPopup("<b>" + title + "</b><br>" + text);
              bounds.extend(latlng);
              hasItems = true;
            },
            function () {},
          );
        });
      }

      if (data.rectangles) {
        data.rectangles.split(";").forEach(function (rectStr) {
          const parts = rectStr.split("~");
          const pointsStr = parts[0].split(":");
          const title = parts[1] || "";
          const text = parts[2] || "";
          const rectangleStyle = parseShapeStyle(parts, true);

          const latlngs = [];
          let processedCount = 0;

          pointsStr.forEach(function (p, i) {
            SM.loc(
              p,
              function (latlng) {
                latlngs[i] = latlng;
                processedCount++;
                if (processedCount === pointsStr.length) {
                  const validLatlngs = latlngs.filter(Boolean);
                  if (validLatlngs.length >= 2) {
                    const rectangle = L.rectangle(
                      validLatlngs,
                      rectangleStyle,
                    ).addTo(map);
                    if (title)
                      rectangle.bindPopup("<b>" + title + "</b><br>" + text);
                    bounds.extend(rectangle.getBounds());
                    hasItems = true;
                  }
                }
              },
              function () {
                processedCount++;
              },
            );
          });
        });
      }

      if (data.geojson_data) {
        try {
          if (
            data.geojson_data.type === "FeatureCollection" &&
            Array.isArray(data.geojson_data.features) &&
            data.geojson_data.features.length === 0
          ) {
            // Skip empty GeoJSON payloads.
          } else {
            const geoStyle = {
              color: defaultGeoJsonColor,
              opacity: 0.5,
              weight: 2,
              fillColor: defaultGeoJsonColor,
              fillOpacity: 0.2,
            };
            const geoLayer = L.geoJSON(data.geojson_data, {
              style: function () {
                return geoStyle;
              },
              pointToLayer: function (_, latlng) {
                return L.circleMarker(latlng, {
                  radius: 5,
                  color: geoStyle.color,
                  opacity: geoStyle.opacity,
                  weight: geoStyle.weight,
                  fillColor: geoStyle.fillColor,
                  fillOpacity: 0.6,
                });
              },
            }).addTo(map);
            const geoBounds = geoLayer.getBounds();
            if (geoBounds && geoBounds.isValid()) {
              bounds.extend(geoBounds);
              hasItems = true;
            }
          }
        } catch (e) {
          console.error("SimpleMaps: Invalid geojson payload", e);
        }
      }

      let isViewSet = false;
      let userInteracted = false;
      let resizeDebounceTimer = null;
      let isAutoFitting = false;
      let resizeObserver = null;
      const getFitBoundsPadding = function () {
        return [32, 32];
      };
      const fitBoundsWithPadding = function (targetBounds, options) {
        const extraOptions = Object.assign({}, options, {
          padding: getFitBoundsPadding(),
        });
        map.fitBounds(targetBounds, extraOptions);
      };
      const getTargetExplicitZoom = function () {
        if (!hasExplicitZoom || !hasItems || !bounds.isValid()) {
          return zoom;
        }
        const center = bounds.getCenter();
        const ne = bounds.getNorthEast();
        const distance = center.distanceTo(ne);
        if (distance > explicitZoomOffsetDistanceThresholdM) {
          return Math.max(0, zoom - explicitZoomOffset);
        }
        return zoom;
      };
      const updateView = function (options) {
        options = options || {};
        map.invalidateSize();
        if (centerLatLng) {
          if (!isViewSet) {
            map.setView(centerLatLng, zoom);
            isViewSet = true;
          } else {
            map.panTo(centerLatLng, options);
          }
        } else if (hasItems) {
          if (!isViewSet) {
            isAutoFitting = true;
            fitBoundsWithPadding(bounds);
            isAutoFitting = false;
            if (hasExplicitZoom) {
              map.setZoom(getTargetExplicitZoom());
            }
            isViewSet = true;
          } else if (!userInteracted) {
            isAutoFitting = true;
            fitBoundsWithPadding(bounds, options);
            isAutoFitting = false;
            if (hasExplicitZoom) {
              map.setZoom(getTargetExplicitZoom());
            }
          }
        } else if (!isViewSet) {
          map.setView([0, 0], 2);
          isViewSet = true;
        }
      };

      map.on("movestart zoomstart", function () {
        if (!isAutoFitting) {
          userInteracted = true;
        }
      });
      $(window).on("resize", function () {
        clearTimeout(resizeDebounceTimer);
        resizeDebounceTimer = setTimeout(function () {
          updateView({ animate: false });
        }, 150);
      });
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(function () {
          clearTimeout(resizeDebounceTimer);
          resizeDebounceTimer = setTimeout(function () {
            updateView({ animate: false });
          }, 150);
        });
        resizeObserver.observe($el[0]);
      }
      updateView();
    },

    loc: function (locStr, callback, onInvalid) {
      const parts = locStr.split("~");
      const coordsOrAddr = parts[0].trim();
      const title = parts[1] || "";
      const text = parts[2] || "";
      const color = parts[3] || "";

      const coords = SM.parseCoord(coordsOrAddr);
      if (coords) {
        callback(coords, { title: title, text: text, color: color });
        return;
      }
      if (typeof onInvalid === "function") {
        onInvalid(coordsOrAddr);
      }
    },

    normCoord: function (str) {
      return (str || "")
        .replace(/\u00C2/g, "")
        .replace(/[′’]/g, "'")
        .replace(/[″”]/g, '"')
        .replace(/[º˚]/g, "°")
        .replace(/\s+/g, " ")
        .trim();
    },

    parseCoord: function (input) {
      const str = SM.normCoord(input);
      if (!str || str.indexOf(",") === -1) {
        return null;
      }

      const pair = str.split(",").map(function (v) {
        return v.trim();
      });
      if (pair.length !== 2) {
        return null;
      }

      const isStrictDecimal = function (v) {
        return /^[-+]?\d{1,3}(?:\.\d+)?$/.test(v);
      };
      if (isStrictDecimal(pair[0]) && isStrictDecimal(pair[1])) {
        return [parseFloat(pair[0]), parseFloat(pair[1])];
      }

      const lat = SM.dmsToDec(pair[0], ["N", "S"]);
      const lon = SM.dmsToDec(pair[1], ["E", "W"]);
      if (lat === null || lon === null) {
        return null;
      }
      return [lat, lon];
    },

    dmsToDec: function (dmsText, allowedDirections) {
      const text = SM.normCoord(dmsText).toUpperCase();
      const dirRegex = new RegExp("(" + allowedDirections.join("|") + ")");
      const dirMatch = text.match(dirRegex);
      const direction = dirMatch ? dirMatch[1] : null;
      const nums = text.match(/-?\d+(?:\.\d+)?/g);
      if (!nums || nums.length < 1) {
        return null;
      }

      const degrees = parseFloat(nums[0]);
      const minutes = nums.length > 1 ? parseFloat(nums[1]) : 0;
      const seconds = nums.length > 2 ? parseFloat(nums[2]) : 0;
      if ([degrees, minutes, seconds].some(isNaN)) {
        return null;
      }

      let decimal = Math.abs(degrees) + minutes / 60 + seconds / 3600;
      if (degrees < 0 || direction === "S" || direction === "W") {
        decimal = -decimal;
      }
      return decimal;
    },
  };

  mw.hook("wikipage.content").add(function ($content) {
    SM.init($content);
  });
})();
;
