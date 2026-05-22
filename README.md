# DisplayMap Extension

`DisplayMap` is a lightweight and modern extension for displaying maps in MediaWiki.

## Key Features

* **Leaflet Rendering**: Renders maps with Leaflet.
* **Markers & Shapes**: Supports markers, lines, polygons, circles, and rectangles.
* **Address Geocoding**: Converts address strings to coordinates via OpenStreetMap Nominatim.
* **GeoJSON Overlay**: Supports `geojson=` query (URL or place query).
* **Parser Function**: Embed maps with `{{#display_map: ... }}`.

## Installation

Add the following line to your `LocalSettings.php`:

```php
wfLoadExtension( 'DisplayMap' );
```

## Usage

### Basic Map
```text
{{#display_map: center=Seoul | zoom=12 }}
```

### Single Marker
```text
{{#display_map: Seoul | center=Seoul | zoom=10 }}
```

### Multiple Markers
```text
{{#display_map: Seoul~Seoul~Capital of South Korea~red; Busan~Busan~Port City~blue }}
```

### Scroll Zoom
`scrollzoom` is the primary parameter.  
`scrollwheelzoom` is kept as an alias for backward compatibility.

```text
{{#display_map: Seoul | scrollzoom=off }}
```

### GeoJSON
```text
{{#display_map: geojson=Berlin | height=300px | scrollzoom=off }}
```

For non-URL values, the extension calls Nominatim with:

```text
https://nominatim.openstreetmap.org/search?format=geojson&polygon_geojson=1&limit=1&q=<query>
```

### Shape Examples
```text
{{#display_map:
  lines=37.5665,126.9780:35.1796,129.0756~Seoul-Busan line~sample~#2563eb~0.8~3
| polygons=37.58,126.97:37.57,127.00:37.55,126.99~Area~sample~#dc2626~0.8~2~#dc2626~0.2
}}
```

## Configuration (LocalSettings.php)

You can override the default values defined in `extension.json` using these variables:

* `$wgDisplayMapDefaultWidth`: default map width (`100%`)
* `$wgDisplayMapDefaultHeight`: default map height (`400px`)
* `$wgDisplayMapDefaultZoom`: default zoom level (`14`)
* `$wgDisplayMapDefaultMarkerColor`: default marker color (`blue`)
* `$wgDisplayMapDefaultShapeColor`: default shape color (`red`)
* `$wgDisplayMapLeafletDistUrl`: Leaflet dist base URL (e.g. `https://unpkg.com/leaflet@1.9.4/dist/`)

## Notes

* Geocoding and `geojson` API responses are cached server-side (`WANObjectCache`).
* If geocoding fails, invalid points are skipped and valid points continue rendering.

## License

Apache-2.0
