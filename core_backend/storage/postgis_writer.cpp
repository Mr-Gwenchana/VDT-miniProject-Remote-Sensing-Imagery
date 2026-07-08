#include "postgis_writer.h"
#include "gdal_priv.h"
#include "ogrsf_frmts.h"
#include "gdal_alg.h"
#include <stdexcept>
#include <iostream>
#include <opencv2/opencv.hpp>
#include <thread>

namespace Storage {

    PostGISWriter::PostGISWriter(const std::string& connectionString, const std::string& tableName) {
        connStr = connectionString;
        layerName = tableName;
    }

    PostGISWriter::~PostGISWriter() {
        Close();
    }

    void PostGISWriter::Open(const std::string& projection) {
        if (pgDS)
            return;

        pgDS = (GDALDataset*)GDALOpenEx(
            connStr.c_str(), GDAL_OF_VECTOR | GDAL_OF_UPDATE,
            nullptr, nullptr, nullptr
        );
        if (!pgDS) {
            throw std::runtime_error("[PostGISWriter] Cannot connect to PostgreSQL: " + connStr);
        }

        layer = pgDS->GetLayerByName(layerName.c_str());
        if (!layer) {
            OGRSpatialReference srs;
            if (!projection.empty()) {
                srs.importFromWkt(projection.c_str());
            }

            layer = pgDS->CreateLayer(layerName.c_str(), &srs, wkbPolygon, nullptr);
            if (!layer) {
                Close();
                throw std::runtime_error("[PostGISWriter] Failed to create layer '" + layerName + "'");
            }



            Close();

            pgDS = (GDALDataset*)GDALOpenEx(
                connStr.c_str(), GDAL_OF_VECTOR | GDAL_OF_UPDATE,
                nullptr, nullptr, nullptr
            );
            if (!pgDS) {
                throw std::runtime_error("[PostGISWriter] Cannot reconnect to PostgreSQL after creating table.");
            }
            layer = pgDS->GetLayerByName(layerName.c_str());
            if (!layer) {
                throw std::runtime_error("[PostGISWriter] Failed to find the newly created layer.");
            }
        }
    }

    void PostGISWriter::SaveMaskAsPolygon(const Common::InferenceData& infData) {
        bool has_building = false;
        for (uint8_t pixel : infData.mask) {
            if (pixel > 0) {
                has_building = true;
                break;
            }
        }
        if (!has_building) {
            return;
        }
        if (!pgDS || !layer) {
            throw std::runtime_error("[PostGISWriter] Not connected! Call Open() first.");
        }


        // using Opencv to boundary polygon
        cv::Mat mask_mat(infData.height, infData.width, CV_8UC1, const_cast<uint8_t*>(infData.mask.data()));

        std::vector<std::vector<cv::Point>> contours;
        cv::findContours(mask_mat, contours, cv::RETR_EXTERNAL, cv::CHAIN_APPROX_SIMPLE);

        {
            std::lock_guard<std::mutex> lock(writeMutex);
            for (const auto& contour : contours) {
                if (contour.size() < 4) 
                    continue;

                OGRLinearRing ring;
                for (const auto& pt : contour) {
                    double geoX = infData.geoTransform[0] + pt.x * infData.geoTransform[1] + pt.y * infData.geoTransform[2];
                    double geoY = infData.geoTransform[3] + pt.x * infData.geoTransform[4] + pt.y * infData.geoTransform[5];
                    ring.addPoint(geoX, geoY);
                }
                ring.closeRings();

                OGRPolygon* poly = new OGRPolygon();
                poly->addRing(&ring);
                polygonBuffer.push_back(poly);
            }
            if (polygonBuffer.size() >= 500) {
                FlushBufferLocked();
            }
        }
    }

    void PostGISWriter::FlushBufferLocked() {
        if (polygonBuffer.empty() || !layer || !pgDS) return;
        size_t batchSize = polygonBuffer.size();
        try {
            pgDS->StartTransaction();
            OGRFeatureDefn* layerDefn = layer->GetLayerDefn();
            for (OGRPolygon* poly : polygonBuffer) {
                OGRFeature* pgFeature = OGRFeature::CreateFeature(layerDefn);
                pgFeature->SetGeometry(poly);
                layer->CreateFeature(pgFeature);
                OGRFeature::DestroyFeature(pgFeature);
                delete poly;
            }
            pgDS->CommitTransaction();
            std::cout << "[PostGISWriter] Flushed batch of " << batchSize << " polygons to database." << std::endl;
        } catch (const std::exception& e) {
            std::cerr << "[PostGISWriter] Error flushing batch: " << e.what() << std::endl;
            pgDS->RollbackTransaction();
            for (OGRPolygon* poly : polygonBuffer) {
                delete poly;
            }
        }
        polygonBuffer.clear();
    }

    void PostGISWriter::Close() {
        if (pgDS) {
            {
                std::lock_guard<std::mutex> lock(writeMutex);
                FlushBufferLocked();
            }
            GDALClose(pgDS);
            pgDS = nullptr;
            layer = nullptr;
        }
    }

    void PostGISWriter::StorageWorker(int thread_id, Common::ThreadSafeQueue<Common::InferenceData>* queue) {
        Common::InferenceData infData;
        while (queue->pop(infData)) {
            try {
                SaveMaskAsPolygon(infData);
            } catch (const std::exception& e) {
                std::cerr << "[Storage " << thread_id << "] Error: " << e.what() << std::endl;
            }
        }
    }

    void PostGISWriter::StorageProcess(Common::ThreadSafeQueue<Common::InferenceData>* queue, int num_workers) {
        std::vector<std::thread> storage_threads;
        for (int i = 0; i < num_workers; i++) {
            storage_threads.push_back(std::thread(&PostGISWriter::StorageWorker, this, i + 1, queue));
        }
        for (auto& t : storage_threads) {
            if (t.joinable()) t.join();
        }
        {
            std::lock_guard<std::mutex> lock(writeMutex);
            FlushBufferLocked();
        }
    }

    void PostGISWriter::MergeOverlappingPolygons() {
        if (!pgDS) {
            std::cerr << "[PostGISWriter] Database not connected. Cannot merge polygons." << std::endl;
            return;
        }

        std::string mergedTableName = layerName + "_final";
        std::string sqlDrop = "DROP TABLE IF EXISTS " + mergedTableName + ";";
        
        std::string sqlMerge = 
            "CREATE TABLE " + mergedTableName + " AS "
            "WITH valid_geoms AS ("
            "    SELECT ST_Buffer(ST_MakeValid(wkb_geometry), 0) AS wkb_geometry "
            "    FROM " + layerName + " "
            "), "
            "clustered AS ("
            "    SELECT wkb_geometry, ST_ClusterDBSCAN(wkb_geometry, eps := 0, minpoints := 1) OVER () AS cluster_id "
            "    FROM valid_geoms "
            ") "
            "SELECT row_number() OVER () AS id, ST_Union(wkb_geometry) AS wkb_geometry "
            "FROM clustered "
            "GROUP BY cluster_id;";

        std::string sqlIndex = "CREATE INDEX idx_" + mergedTableName + "_geom ON " + mergedTableName + " USING GIST (wkb_geometry);";

        // Execute queries
        OGRLayer* resDrop = pgDS->ExecuteSQL(sqlDrop.c_str(), nullptr, nullptr);
        if (resDrop) pgDS->ReleaseResultSet(resDrop);

        OGRLayer* resMerge = pgDS->ExecuteSQL(sqlMerge.c_str(), nullptr, nullptr);
        if (resMerge) pgDS->ReleaseResultSet(resMerge);

        OGRLayer* resIndex = pgDS->ExecuteSQL(sqlIndex.c_str(), nullptr, nullptr);
        if (resIndex) pgDS->ReleaseResultSet(resIndex);

        std::cout << "--- Polygons successfully merged into '" << mergedTableName << "' ---" << std::endl;
    }

    void PostGISWriter::ClearTables() {
        if (!pgDS) {
            std::cerr << "[PostGISWriter] Database not connected. Cannot clear tables." << std::endl;
            return;
        }

        // Drop the _final table
        std::string sqlDropFinal = "DROP TABLE IF EXISTS " + layerName + "_final;";
        OGRLayer* res1 = pgDS->ExecuteSQL(sqlDropFinal.c_str(), nullptr, nullptr);
        if (res1) pgDS->ReleaseResultSet(res1);
        std::cout << "[PostGISWriter] Dropped table '" << layerName << "_final'" << std::endl;

        // Truncate the base table
        std::string sqlTruncate = "TRUNCATE TABLE " + layerName + ";";
        OGRLayer* res2 = pgDS->ExecuteSQL(sqlTruncate.c_str(), nullptr, nullptr);
        if (res2) pgDS->ReleaseResultSet(res2);
        std::cout << "[PostGISWriter] Truncated table '" << layerName << "'" << std::endl;
    }

}
