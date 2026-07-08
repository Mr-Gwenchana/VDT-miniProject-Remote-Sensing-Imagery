"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";

export default function MapView({
  geoTiffLayers,
  onCoordsChange,
  isDrawingBox,
  onBoxDrawn,
  queriedGeoJson
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef({});
  const geoJsonLayerRef = useRef(null);

  // Refs for box drawing state
  const drawStateRef = useRef({
    isDown: false,
    startLatLng: null,
    tempRect: null,
  });

  // Initialize map
  useEffect(() => {
    if (mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [21.0285, 105.8542], // Hanoi default
      zoom: 6,
      zoomControl: false,
      attributionControl: false,
    });

    // Google Satellite tiles
    L.tileLayer("https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
      maxZoom: 22,
      subdomains: ["mt0", "mt1", "mt2", "mt3"],
    }).addTo(map);

    // Zoom control in bottom-left
    L.control.zoom({ position: "bottomleft" }).addTo(map);

    // Track mouse coordinates
    map.on("mousemove", (e) => {
      if (onCoordsChange) {
        onCoordsChange({
          lat: e.latlng.lat.toFixed(6),
          lng: e.latlng.lng.toFixed(6),
        });
      }
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle GeoTIFF layer updates
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Remove layers that are no longer in the list
    const currentIds = new Set(geoTiffLayers.map((l) => l.id));
    Object.keys(layersRef.current).forEach((id) => {
      if (!currentIds.has(id)) {
        map.removeLayer(layersRef.current[id]);
        delete layersRef.current[id];
      }
    });

    // Add new layers
    geoTiffLayers.forEach((layerData) => {
      if (layersRef.current[layerData.id]) return;
      if (!layerData.bounds) return;

      const { bounds, imageUrl } = layerData;

      // bounds: [[south, west], [north, east]]
      const leafletBounds = L.latLngBounds(
        L.latLng(bounds[0][0], bounds[0][1]),
        L.latLng(bounds[1][0], bounds[1][1])
      );

      const overlay = L.imageOverlay(imageUrl, leafletBounds, {
        opacity: 0.85,
        interactive: false,
      });

      overlay.addTo(map);
      layersRef.current[layerData.id] = overlay;

      // Fly to the new layer
      map.flyToBounds(leafletBounds, {
        padding: [50, 50],
        duration: 1.5,
        maxZoom: 17,
      });
    });
  }, [geoTiffLayers]);

  // Handle Box Drawing mode events
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const container = map.getContainer();

    if (isDrawingBox) {
      container.style.cursor = "crosshair";
      map.dragging.disable();

      const onMouseDown = (e) => {
        drawStateRef.current.isDown = true;
        drawStateRef.current.startLatLng = e.latlng;
      };

      const onMouseMove = (e) => {
        if (!drawStateRef.current.isDown || !drawStateRef.current.startLatLng) return;
        const start = drawStateRef.current.startLatLng;
        const current = e.latlng;
        const bounds = L.latLngBounds(start, current);

        if (!drawStateRef.current.tempRect) {
          drawStateRef.current.tempRect = L.rectangle(bounds, {
            color: "#f43f5e",
            weight: 2,
            dashArray: "5, 5",
            fillColor: "#f43f5e",
            fillOpacity: 0.15,
          }).addTo(map);
        } else {
          drawStateRef.current.tempRect.setBounds(bounds);
        }
      };

      const onMouseUp = (e) => {
        if (!drawStateRef.current.isDown || !drawStateRef.current.startLatLng) return;
        const start = drawStateRef.current.startLatLng;
        const end = e.latlng;
        drawStateRef.current.isDown = false;

        const minLng = Math.min(start.lng, end.lng);
        const maxLng = Math.max(start.lng, end.lng);
        const minLat = Math.min(start.lat, end.lat);
        const maxLat = Math.max(start.lat, end.lat);

        if (drawStateRef.current.tempRect) {
          map.removeLayer(drawStateRef.current.tempRect);
          drawStateRef.current.tempRect = null;
        }

        if (Math.abs(maxLng - minLng) > 0.0001 && Math.abs(maxLat - minLat) > 0.0001) {
          if (onBoxDrawn) {
            onBoxDrawn({ minLng, minLat, maxLng, maxLat });
          }
        }
      };

      map.on("mousedown", onMouseDown);
      map.on("mousemove", onMouseMove);
      map.on("mouseup", onMouseUp);

      return () => {
        container.style.cursor = "";
        map.dragging.enable();
        map.off("mousedown", onMouseDown);
        map.off("mousemove", onMouseMove);
        map.off("mouseup", onMouseUp);
        if (drawStateRef.current.tempRect) {
          map.removeLayer(drawStateRef.current.tempRect);
          drawStateRef.current.tempRect = null;
        }
      };
    } else {
      container.style.cursor = "";
      map.dragging.enable();
    }
  }, [isDrawingBox, onBoxDrawn]);

  // Handle GeoJSON query result rendering
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (geoJsonLayerRef.current) {
      map.removeLayer(geoJsonLayerRef.current);
      geoJsonLayerRef.current = null;
    }

    if (queriedGeoJson && queriedGeoJson.features && queriedGeoJson.features.length > 0) {
      const geoLayer = L.geoJSON(queriedGeoJson, {
        style: {
          color: "#00f2fe",
          weight: 2,
          fillColor: "#4facfe",
          fillOpacity: 0.35,
        },
        onEachFeature: (feature, layer) => {
          const props = feature.properties || {};
          const info = Object.entries(props).map(([k, v]) => `<b>${k}:</b> ${JSON.stringify(v)}`).join("<br/>");
          if (info) {
            layer.bindPopup(`<div style="font-size:12px; max-height:200px; overflow-y:auto;">${info}</div>`);
          }
        }
      });

      geoLayer.addTo(map);
      geoJsonLayerRef.current = geoLayer;

      // Fit map to queried polygons
      try {
        const bounds = geoLayer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
        }
      } catch (e) { }
    }
  }, [queriedGeoJson]);

  return (
    <div className="map-container">
      <div ref={mapRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
