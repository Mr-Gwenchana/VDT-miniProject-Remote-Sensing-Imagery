"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import Sidebar from "./components/Sidebar";

// Dynamically import MapView (Leaflet needs window/document)
const MapView = dynamic(() => import("./components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="map-container" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div className="spinner" style={{ margin: "0 auto 12px" }}></div>
        <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Loading map...</div>
      </div>
    </div>
  ),
});

export default function HomePage() {
  const [files, setFiles] = useState([]);
  const [coords, setCoords] = useState({ lat: "0.000000", lng: "0.000000" });
  const [toast, setToast] = useState(null);
  const mapViewRef = useRef(null);

  // Spatial DB Query states
  const [isDrawingBox, setIsDrawingBox] = useState(false);
  const [queriedGeoJson, setQueriedGeoJson] = useState(null);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const pollRef = useRef(null);

  // Poll pipeline status while running
  useEffect(() => {
    if (!pipelineRunning) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("http://localhost:3001/pipeline-status");
        const data = await res.json();
        if (!data.running) {
          setPipelineRunning(false);
          setToast({ icon: "✅", text: "Inference completed" });
          setTimeout(() => setToast(null), 5000);
        }
      } catch (e) { }
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, [pipelineRunning]);

  const handleFileLoaded = useCallback((layerData) => {
    setFiles([layerData]);
    // Pipeline is auto-triggered by backend on upload, start polling
    setPipelineRunning(true);
    setToast({ icon: "🚀", text: `${layerData.fileName} loaded, pipeline started` });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const handleRemoveFile = useCallback(async (id) => {
    setFiles([]);
    setQueriedGeoJson(null);
    try {
      await fetch("http://localhost:3001/upload", { method: "DELETE" });
      setToast({ icon: "🗑️", text: "Image has been removed" });
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      console.warn("Could not delete from backend:", err);
    }
  }, []);

  const handleFlyTo = useCallback((file) => {
    // MapView will automatically fly to bounds when layers change
  }, []);

  const handleToggleDrawBox = useCallback(() => {
    setIsDrawingBox((prev) => !prev);
  }, []);

  const handleClearQuery = useCallback(() => {
    setQueriedGeoJson(null);
    setToast({ icon: "🗑️", text: "Cleared polygons" });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleBoxDrawn = useCallback(async ({ minLng, minLat, maxLng, maxLat }) => {
    setIsDrawingBox(false);
    setToast({ icon: "⏳", text: "Loading spatial data..." });

    try {
      const url = `http://localhost:3001/query-box?minLng=${minLng}&minLat=${minLat}&maxLng=${maxLng}&maxLat=${maxLat}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setQueriedGeoJson(data);
      const count = data?.features?.length || 0;
      setToast({ icon: "✅", text: `Found ${count} buildings` });
      setTimeout(() => setToast(null), 4000);
    } catch (err) {
      console.error("Query box error:", err);
      setToast({ icon: "❌", text: "Query failed" });
      setTimeout(() => setToast(null), 4000);
    }
  }, []);

  return (
    <div className="app-container">
      <Sidebar
        onFileLoaded={handleFileLoaded}
        files={files}
        onRemoveFile={handleRemoveFile}
        onFlyTo={handleFlyTo}
        isDrawingBox={isDrawingBox}
        onToggleDrawBox={handleToggleDrawBox}
        queriedCount={queriedGeoJson?.features?.length || 0}
        onClearQuery={handleClearQuery}
        pipelineRunning={pipelineRunning}
      />

      <div style={{ position: "relative", flex: 1 }}>
        <MapView
          ref={mapViewRef}
          geoTiffLayers={files}
          onCoordsChange={setCoords}
          isDrawingBox={isDrawingBox}
          onBoxDrawn={handleBoxDrawn}
          queriedGeoJson={queriedGeoJson}
        />

        {/* Map overlay toast */}
        {toast && (
          <div className="map-overlay-toast">
            <span className="toast-icon">{toast.icon}</span>
            <span className="toast-text">{toast.text}</span>
          </div>
        )}

        {/* Coordinates display */}
        <div className="coordinates-badge">
          {coords.lat}, {coords.lng}
        </div>
      </div>
    </div>
  );
}
