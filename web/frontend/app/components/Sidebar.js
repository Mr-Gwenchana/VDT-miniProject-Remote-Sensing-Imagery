"use client";

import { useState, useRef, useCallback, useEffect } from "react";

function PerformanceMonitor({ telemetry }) {
  const ramPercent = Math.round((telemetry.ramUsedMB / (telemetry.ramTotalMB || 1)) * 100) || 0;
  const vramPercent = Math.round((telemetry.gpuVramUsedMB / (telemetry.gpuVramTotalMB || 1)) * 100) || 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* CPU Card */}
      <div style={{ background: "var(--color-bg-tertiary)", padding: 16, borderRadius: 12, border: "1px solid var(--color-border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#38bdf8", display: "flex", alignItems: "center", gap: 6 }}>CPU Usage</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#38bdf8" }}>{telemetry.cpuPercent}%</span>
        </div>
        <div style={{ width: "100%", height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${telemetry.cpuPercent}%`, height: "100%", background: "linear-gradient(90deg, #0284c7, #38bdf8)", transition: "width 0.5s ease" }}></div>
        </div>
      </div>

      {/* RAM Card */}
      <div style={{ background: "var(--color-bg-tertiary)", padding: 16, borderRadius: 12, border: "1px solid var(--color-border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#c084fc", display: "flex", alignItems: "center", gap: 6 }}>RAM</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#c084fc" }}>{telemetry.ramUsedMB} / {telemetry.ramTotalMB} MB</span>
        </div>
        <div style={{ width: "100%", height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${ramPercent}%`, height: "100%", background: "linear-gradient(90deg, #9333ea, #c084fc)", transition: "width 0.5s ease" }}></div>
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 6, textAlign: "right" }}>{ramPercent}% Utilized</div>
      </div>

      {/* GPU Card */}
      <div style={{ background: "var(--color-bg-tertiary)", padding: 16, borderRadius: 12, border: "1px solid var(--color-border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#34d399", display: "flex", alignItems: "center", gap: 6 }}>GPU Usage</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#34d399" }}>{telemetry.gpuPercent}%</span>
        </div>
        <div style={{ width: "100%", height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${telemetry.gpuPercent}%`, height: "100%", background: "linear-gradient(90deg, #059669, #34d399)", transition: "width 0.5s ease" }}></div>
        </div>
      </div>

      {/* GPU VRAM Card */}
      <div style={{ background: "var(--color-bg-tertiary)", padding: 16, borderRadius: 12, border: "1px solid var(--color-border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#f43f5e", display: "flex", alignItems: "center", gap: 6 }}>GPU VRAM</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#f43f5e" }}>{telemetry.gpuVramUsedMB} / {telemetry.gpuVramTotalMB} MB</span>
        </div>
        <div style={{ width: "100%", height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${vramPercent}%`, height: "100%", background: "linear-gradient(90deg, #e11d48, #fb7185)", transition: "width 0.5s ease" }}></div>
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 6, textAlign: "right" }}>{vramPercent}% Utilized</div>
      </div>
    </div>
  );
}

export default function Sidebar({
  onFileLoaded,
  files,
  onRemoveFile,
  onFlyTo,
  isDrawingBox,
  onToggleDrawBox,
  queriedCount = 0,
  onClearQuery,
  pipelineRunning = false
}) {
  const [activeTab, setActiveTab] = useState("workspace");
  const [telemetry, setTelemetry] = useState({
    cpuPercent: 0,
    ramUsedMB: 0,
    ramTotalMB: 0,
    gpuPercent: 0,
    gpuVramUsedMB: 0,
    gpuVramTotalMB: 0,
    pipelineRunning: false,
  });

  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [expandedInfo, setExpandedInfo] = useState(null);
  const [notification, setNotification] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (activeTab !== "performance") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("http://localhost:3001/telemetry");
        if (res.ok) {
          const data = await res.json();
          setTelemetry(data);
        }
      } catch (e) { }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const showNotification = useCallback((type, text) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 3500);
  }, []);

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
    return (bytes / 1073741824).toFixed(2) + " GB";
  };

  const processGeoTiff = useCallback(
    async (file) => {
      setUploadProgress({ fileName: file.name, percent: 10 });

      try {
        // Dynamically import georaster (heavy library, load on demand)
        const parseGeoRaster = (await import("georaster")).default;

        setUploadProgress({ fileName: file.name, percent: 30 });

        // Read the file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();

        setUploadProgress({ fileName: file.name, percent: 60 });

        // Parse the GeoTIFF metadata
        const georaster = await parseGeoRaster(arrayBuffer);

        setUploadProgress({ fileName: file.name, percent: 80 });

        // Extract bounds from georaster
        const { xmin, xmax, ymin, ymax, width, height, numberOfRasters, projection } = georaster;

        // Reproject bounds from source CRS to EPSG:4326 (lat/lng) for Leaflet
        const proj4 = (await import("proj4")).default;
        let projString = projection ? String(projection).trim() : null;

        // Normalize projection string for proj4
        // georaster may return just a number like "3857", or "EPSG:3857", or a full WKT string
        if (projString && /^\d+$/.test(projString)) {
          projString = "EPSG:" + projString;
        }

        let sw, ne; // [lat, lng] pairs
        const needsReprojection = projString
          && projString !== "EPSG:4326"
          && !projString.includes("WGS 84")
          && !projString.includes("WGS84")
          && (Math.abs(xmin) > 360 || Math.abs(ymin) > 90);

        if (needsReprojection) {
          // Coordinates are NOT in degrees — need reprojection
          try {
            const swXY = proj4(projString, "EPSG:4326", [xmin, ymin]);
            const neXY = proj4(projString, "EPSG:4326", [xmax, ymax]);
            sw = [swXY[1], swXY[0]]; // proj4 returns [lng, lat], Leaflet needs [lat, lng]
            ne = [neXY[1], neXY[0]];
          } catch (projErr) {
            console.warn("proj4 reprojection failed, using raw bounds:", projErr);
            sw = [ymin, xmin];
            ne = [ymax, xmax];
          }
        } else {
          // Already in geographic coordinates (degrees)
          sw = [ymin, xmin];
          ne = [ymax, xmax];
        }

        console.log("Reprojected bounds:", { sw, ne, originalCRS: projString?.substring(0, 60) });

        // Convert GeoTIFF pixel data to a canvas image for overlay
        // Downscale if image is too large to avoid browser lag
        const MAX_DIM = 8192;
        const scale = Math.min(1, MAX_DIM / Math.max(width, height));
        const canvasW = Math.round(width * scale);
        const canvasH = Math.round(height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext("2d");

        // First render at original size into a temp canvas
        const tmpCanvas = document.createElement("canvas");
        tmpCanvas.width = width;
        tmpCanvas.height = height;
        const tmpCtx = tmpCanvas.getContext("2d");

        const imageData = tmpCtx.createImageData(width, height);
        const data = imageData.data;

        // GeoTIFF values are stored per-band
        const numBands = georaster.numberOfRasters;

        if (numBands >= 3) {
          // RGB image
          const rBand = georaster.values[0];
          const gBand = georaster.values[1];
          const bBand = georaster.values[2];

          for (let row = 0; row < height; row++) {
            for (let col = 0; col < width; col++) {
              const idx = (row * width + col) * 4;
              data[idx] = rBand[row][col];     // R
              data[idx + 1] = gBand[row][col]; // G
              data[idx + 2] = bBand[row][col]; // B
              data[idx + 3] = 255;              // A
            }
          }
        } else if (numBands === 1) {
          // Grayscale image
          const band = georaster.values[0];
          for (let row = 0; row < height; row++) {
            for (let col = 0; col < width; col++) {
              const idx = (row * width + col) * 4;
              const val = band[row][col];
              data[idx] = val;     // R
              data[idx + 1] = val; // G
              data[idx + 2] = val; // B
              data[idx + 3] = 255; // A
            }
          }
        }

        tmpCtx.putImageData(imageData, 0, 0);

        // Draw scaled version into final canvas
        ctx.drawImage(tmpCanvas, 0, 0, canvasW, canvasH);

        // Use JPEG for much smaller data URL (PNG can be 10x larger)
        const imageUrl = canvas.toDataURL("image/jpeg", 0.92);

        setUploadProgress({ fileName: file.name, percent: 100 });

        // Build layer data
        const layerData = {
          id: `${file.name}-${Date.now()}`,
          fileName: file.name,
          fileSize: file.size,
          width,
          height,
          bands: numBands,
          projection: projString || "Unknown",
          bounds: [sw, ne],
          imageUrl,
          uploadedAt: new Date().toLocaleTimeString(),
        };

        // Upload raw file to NestJS backend storage and await confirmation that pipeline spawned
        try {
          const formData = new FormData();
          formData.append("file", file);
          const uploadRes = await fetch("http://localhost:3001/upload", {
            method: "POST",
            body: formData,
          });
          const uploadData = await uploadRes.json();
          console.log("Backend upload response:", uploadData);
        } catch (uploadReqErr) {
          console.warn("Backend upload error:", uploadReqErr);
        }

        onFileLoaded(layerData);
        showNotification("success", `${file.name} loaded successfully`);

        setTimeout(() => setUploadProgress(null), 500);
      } catch (err) {
        console.error("Failed to parse GeoTIFF:", err);
        showNotification("error", `Failed to parse ${file.name}: ${err.message}`);
        setUploadProgress(null);
      }
    },
    [onFileLoaded, showNotification]
  );

  const handleFiles = useCallback(
    (fileList) => {
      if (!fileList || fileList.length === 0) return;
      const file = fileList[0]; // strictly take only 1 file
      const ext = file.name.toLowerCase();
      if (ext.endsWith(".tif") || ext.endsWith(".tiff") || ext.endsWith(".geotiff")) {
        processGeoTiff(file);
      } else {
        showNotification("error", `Unsupported format: ${file.name}. Only GeoTIFF (.tif) is supported.`);
      }
    },
    [processGeoTiff, showNotification]
  );

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleInputChange = (e) => {
    if (e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = "";
    }
  };

  return (
    <>
      <aside className="sidebar">
        {/* Header */}
        <div className="sidebar-header">
          <div className="logo-area">
            <div className="logo-icon">🛰️</div>
            <div>
              <div className="logo-text">Building Footprint Platform</div>
            </div>
          </div>
        </div>

        {/* Nav Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--color-border)", background: "rgba(0,0,0,0.2)" }}>
          <button
            onClick={() => setActiveTab("workspace")}
            style={{
              flex: 1, padding: "12px 8px", background: "none", border: "none",
              borderBottom: activeTab === "workspace" ? "2px solid #38bdf8" : "2px solid transparent",
              color: activeTab === "workspace" ? "#38bdf8" : "var(--color-text-muted)",
              fontWeight: activeTab === "workspace" ? 600 : 400, fontSize: 13, cursor: "pointer", transition: "all 0.2s"
            }}
          >
            🌍 Workspace
          </button>
          <button
            onClick={() => setActiveTab("performance")}
            style={{
              flex: 1, padding: "12px 8px", background: "none", border: "none",
              borderBottom: activeTab === "performance" ? "2px solid #a855f7" : "2px solid transparent",
              color: activeTab === "performance" ? "#a855f7" : "var(--color-text-muted)",
              fontWeight: activeTab === "performance" ? 600 : 400, fontSize: 13, cursor: "pointer", transition: "all 0.2s"
            }}
          >
            ⚡ Performance
          </button>
        </div>

        {/* Body */}
        <div className="sidebar-body">
          {activeTab === "performance" ? (
            <PerformanceMonitor telemetry={telemetry} />
          ) : (
            <>
              {/* Upload Section - Only visible when NO image is uploaded */}
              {files.length === 0 && (
                <div>
                  <div className="section-title">📤 Upload Image (1 Max)</div>
                  <div
                    className={`upload-zone ${isDragging ? "dragging" : ""}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={handleClick}
                  >
                    <div className="upload-icon-wrapper">
                      <span className="upload-icon">🌍</span>
                    </div>
                    <div className="upload-text-primary">
                      Drag & drop or <span>browse</span>
                    </div>
                    <div className="upload-text-secondary">
                      Supports single GeoTIFF (.tif, .tiff)
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".tif,.tiff,.geotiff"
                      style={{ display: "none" }}
                      onChange={handleInputChange}
                    />
                  </div>

                  {uploadProgress && (
                    <div className="upload-progress">
                      <div className="progress-bar-track">
                        <div
                          className="progress-bar-fill"
                          style={{ width: `${uploadProgress.percent}%` }}
                        />
                      </div>
                      <div className="progress-text">
                        <span>{uploadProgress.fileName}</span>
                        <span>{uploadProgress.percent}%</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Spatial Database Query Section */}
              <div style={{ marginTop: files.length > 0 ? 0 : 20 }}>
                <div className="section-title">📐 PostGIS Spatial Query</div>
                <div style={{ background: "rgba(15, 23, 42, 0.4)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 10, lineHeight: 1.4 }}>
                    Draw a rectangle on the map to see all building lying completely within the box.
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className={`action-btn ${isDrawingBox ? "action-btn-danger" : "action-btn-secondary"}`}
                      style={{ flex: 1, padding: "8px 12px", fontSize: 13 }}
                      onClick={onToggleDrawBox}
                    >
                      {isDrawingBox ? "⏹️ Cancel Drawing" : "✏️ Draw Query Box"}
                    </button>

                    {queriedCount > 0 && (
                      <button
                        className="action-btn action-btn-secondary"
                        style={{ padding: "8px 12px", fontSize: 13, background: "rgba(239, 68, 68, 0.15)", borderColor: "rgba(239, 68, 68, 0.3)", color: "#fca5a5" }}
                        onClick={onClearQuery}
                        title="Clear queried polygons"
                      >
                        🗑️ Clear ({queriedCount})
                      </button>
                    )}
                  </div>

                  {isDrawingBox && (
                    <div style={{ marginTop: 8, fontSize: 12, color: "#38bdf8", background: "rgba(56, 189, 248, 0.1)", padding: "6px 10px", borderRadius: 6, border: "1px dashed rgba(56, 189, 248, 0.4)" }}>
                      💡 Click and drag on the map to draw a box.
                    </div>
                  )}
                </div>
              </div>

              {/* Loaded Files */}
              <div style={{ marginTop: 20 }}>
                <div className="section-title">
                  🗂️ Active Image Layer ({files.length}/1)
                </div>

                {files.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">📡</div>
                    <div className="empty-state-text">
                      No satellite image loaded.
                      <br />
                      Upload 1 GeoTIFF to get started.
                    </div>
                  </div>
                ) : (
                  <div className="file-list">
                    {files.map((f) => (
                      <div key={f.id}>
                        <div
                          className={`file-card ${expandedInfo === f.id ? "active" : ""}`}
                          onClick={() => {
                            setExpandedInfo(expandedInfo === f.id ? null : f.id);
                            onFlyTo(f);
                          }}
                        >
                          <div className="file-icon-box">🗺️</div>
                          <div className="file-info">
                            <div className="file-name">{f.fileName}</div>
                            <div className="file-meta">
                              {formatFileSize(f.fileSize)} • {f.width}×{f.height}px
                            </div>
                          </div>
                          <button
                            className="file-remove-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveFile(f.id);
                            }}
                            title="Remove layer"
                          >
                            ✕
                          </button>
                        </div>

                        {/* Expanded Info */}
                        {expandedInfo === f.id && (
                          <div className="info-panel" style={{ marginTop: 6 }}>
                            <div className="info-panel-body">
                              <div className="info-row">
                                <span className="info-label">Dimensions</span>
                                <span className="info-value">
                                  {f.width} × {f.height}
                                </span>
                              </div>
                              <div className="info-row">
                                <span className="info-label">Bands</span>
                                <span className="info-value">{f.bands}</span>
                              </div>
                              <div className="info-row">
                                <span className="info-label">Projection</span>
                                <span className="info-value" style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {f.projection.length > 20 ? f.projection.substring(0, 20) + "..." : f.projection}
                                </span>
                              </div>
                              <div className="info-row">
                                <span className="info-label">SW Corner</span>
                                <span className="info-value">
                                  {f.bounds[0][0].toFixed(4)}, {f.bounds[0][1].toFixed(4)}
                                </span>
                              </div>
                              <div className="info-row">
                                <span className="info-label">NE Corner</span>
                                <span className="info-value">
                                  {f.bounds[1][0].toFixed(4)}, {f.bounds[1][1].toFixed(4)}
                                </span>
                              </div>
                              <div className="info-row">
                                <span className="info-label">Uploaded</span>
                                <span className="info-value">{f.uploadedAt}</span>
                              </div>
                              <div className="info-row">
                                <span className="info-label">Status</span>
                                <span className="status-badge ready">
                                  <span className="status-dot" />
                                  Ready
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                        <button
                          className="action-btn action-btn-secondary"
                          style={{ marginTop: 10, width: "100%", padding: "9px 12px", fontSize: 13, background: "rgba(239, 68, 68, 0.15)", borderColor: "rgba(239, 68, 68, 0.3)", color: "#fca5a5", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                          onClick={() => onRemoveFile(f.id)}
                        >
                          🗑️ Clear & Upload New Image
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer - Pipeline Status */}
        <div className="sidebar-footer">
          {pipelineRunning ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "rgba(56, 189, 248, 0.1)", borderRadius: 10, border: "1px solid rgba(56, 189, 248, 0.3)" }}>
              <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }}></div>
              <span style={{ fontSize: 13, color: "#38bdf8" }}>AI Inference running...</span>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", textAlign: "center", padding: "8px 0" }}>
              {files.length > 0 ? "✅ Ready - Inference completed" : "Upload a GeoTIFF to begin"}
            </div>
          )}
        </div>
      </aside>

      {/* Notification Toast */}
      {notification && (
        <div className={`notification ${notification.type}`}>
          <span className="notification-icon">
            {notification.type === "success" ? "✅" : "❌"}
          </span>
          <span className="notification-text">{notification.text}</span>
        </div>
      )}
    </>
  );
}
