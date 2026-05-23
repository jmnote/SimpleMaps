<?php

namespace SimpleMaps;

use MediaWiki\MediaWikiServices;
use Parser;
use PPFrame;

class Handler
{
    public static function render(Parser $parser, PPFrame $frame, array $args)
    {
        $params = self::extractParams($args, $frame);
        $svc = MediaWikiServices::getInstance();
        $config = $svc->getMainConfig();
        $hasExplicitZoom = array_key_exists('zoom', $params);

        $width = $params['width'] ?? $config->get('SimpleMapsWidth');
        $height = $params['height'] ?? $config->get('SimpleMapsHeight');
        $params['zoom'] = $params['zoom'] ?? $config->get('SimpleMapsZoom');
        $params['zoom_explicit'] = $hasExplicitZoom ? 1 : 0;
        $params['markercolor'] = $params['markercolor'] ?? $config->get('SimpleMapsMarkerColor');
        $params['shapecolor'] = $params['shapecolor'] ?? $config->get('SimpleMapsShapeColor');
        if (! isset($params['scrollzoom']) && isset($params['scrollwheelzoom'])) {
            $params['scrollzoom'] = $params['scrollwheelzoom'];
        }
        $params['leaflet_dist_url'] = $config->get('SimpleMapsLeafletDistUrl');

        if (is_numeric($width)) {
            $width .= 'px';
        }
        if (is_numeric($height)) {
            $height .= 'px';
        }

        $params = self::resolveLocs($params);
        $params = self::resolveGeoJson($params);

        $output = $parser->getOutput();
        $output->addModules(['ext.simplemaps.main']);
        $mapData = htmlspecialchars(json_encode($params), ENT_QUOTES, 'UTF-8');

        $html = "<div class=\"mw-simple-maps\" style=\"width: $width; height: $height;\" data-map-data=\"$mapData\"></div>";

        return [$html, 'noparse' => true, 'isHTML' => true];
    }

    private static function resolveLocs(array $params)
    {
        $keysToGeocode = ['locations', 'center'];
        foreach ($keysToGeocode as $key) {
            if (isset($params[$key])) {
                $params[$key] = self::geocodeList($params[$key]);
            }
        }

        $complexKeys = ['lines', 'polygons', 'circles', 'rectangles'];
        foreach ($complexKeys as $key) {
            if (isset($params[$key])) {
                $items = explode(';', $params[$key]);
                foreach ($items as &$item) {
                    $parts = explode('~', $item);
                    if ($key === 'circles') {
                        $subParts = explode(':', $parts[0]);
                        $subParts[0] = self::geocode($subParts[0]);
                        $parts[0] = implode(':', $subParts);
                    } else {
                        $points = explode(':', $parts[0]);
                        foreach ($points as &$point) {
                            $point = self::geocode($point);
                        }
                        $parts[0] = implode(':', $points);
                    }
                    $item = implode('~', $parts);
                }
                $params[$key] = implode(';', $items);
            }
        }

        return $params;
    }

    private static function geocodeList($str)
    {
        $items = explode(';', $str);
        foreach ($items as &$item) {
            $parts = explode('~', $item);
            $parts[0] = self::geocode($parts[0]);
            $item = implode('~', $parts);
        }

        return implode(';', $items);
    }

    private static function geocode($address)
    {
        $address = trim($address);
        if (empty($address) || self::isCoord($address)) {
            return $address;
        }

        $cache = MediaWikiServices::getInstance()->getMainWANObjectCache();
        $cacheKey = $cache->makeKey('simplemaps', 'geocode', md5($address));

        return $cache->getWithSetCallback(
            $cacheKey,
            $cache::TTL_MONTH,
            function () use ($address) {
                $url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q='.urlencode($address);
                $options = [
                    'http' => [
                        'header' => "User-Agent: MediaWiki-SimpleMaps/0.2.0\r\n",
                        'timeout' => 3.0,
                        'ignore_errors' => true,
                    ],
                ];
                $context = stream_context_create($options);
                $response = @file_get_contents($url, false, $context);

                if ($response) {
                    $data = json_decode($response, true);
                    if (! empty($data[0])) {
                        return $data[0]['lat'].','.$data[0]['lon'];
                    }
                }

                if (function_exists('wfDebugLog')) {
                    wfDebugLog('SimpleMaps', 'Geocode failed for address: '.$address);
                }

                return $address;
            }
        );
    }

    private static function resolveGeoJson(array $params): array
    {
        $params['geojson_data'] = null;
        if (! isset($params['geojson'])) {
            return $params;
        }

        $query = trim((string) $params['geojson']);
        if ($query === '') {
            return $params;
        }

        $cache = MediaWikiServices::getInstance()->getMainWANObjectCache();
        $cacheKey = $cache->makeKey('simplemaps', 'geojson', md5($query));

        $geojson = $cache->getWithSetCallback(
            $cacheKey,
            $cache::TTL_WEEK,
            static function () use ($query) {
                $data = self::fetchGeoJsonFromApi($query);

                return is_array($data) ? $data : [];
            }
        );

        if (is_array($geojson) && ! empty($geojson)) {
            $params['geojson_data'] = $geojson;
        }

        return $params;
    }

    private static function fetchGeoJsonFromApi(string $query): ?array
    {
        $isUrl = filter_var($query, FILTER_VALIDATE_URL) !== false;
        $url = $isUrl
            ? $query
            : 'https://nominatim.openstreetmap.org/search?format=geojson&polygon_geojson=1&limit=1&q='.urlencode($query);

        $options = [
            'http' => [
                'header' => "User-Agent: MediaWiki-SimpleMaps/0.2.0\r\n",
                'timeout' => 4.0,
                'ignore_errors' => true,
            ],
        ];
        $context = stream_context_create($options);
        $response = @file_get_contents($url, false, $context);

        if (! $response) {
            if (function_exists('wfDebugLog')) {
                wfDebugLog('SimpleMaps', 'GeoJSON API fetch failed: '.$query);
            }

            return null;
        }

        $data = json_decode($response, true);
        if (! is_array($data)) {
            if (function_exists('wfDebugLog')) {
                wfDebugLog('SimpleMaps', 'GeoJSON decode failed: '.$query);
            }

            return null;
        }

        return $data;
    }

    private static function isCoord($str)
    {
        if (preg_match('/^[-+]?\d{1,3}(?:\.\d+)?\s*,\s*([-+]?\d{1,3}(?:\.\d+)?)$/', $str)) {
            return true;
        }
        if (preg_match('/\d+.*[NSEW]/i', $str) || preg_match('/\d+[°Â°]/u', $str)) {
            return true;
        }

        return false;
    }

    private static function extractParams(array $args, PPFrame $frame)
    {
        $params = [];
        $unnamedIndex = 0;

        foreach ($args as $arg) {
            $parts = explode('=', $frame->expand($arg), 2);
            if (count($parts) === 2) {
                $name = trim(strtolower($parts[0]));
                $value = trim($parts[1]);
                $params[$name] = $value;
            } else {
                $value = trim($frame->expand($arg));
                if ($unnamedIndex === 0) {
                    $params['locations'] = $value;
                } else {
                    $params['unnamed_'.$unnamedIndex] = $value;
                }
                $unnamedIndex++;
            }
        }

        return $params;
    }
}
