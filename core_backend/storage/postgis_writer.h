#ifndef POSTGIS_WRITER_H
#define POSTGIS_WRITER_H

#include <string>
#include <vector>
#include <cstdint>
#include <mutex>

#include "../common/thread_safe_queue.h"
#include "../common/inference_data.h"

class GDALDataset;
class OGRLayer;
class OGRPolygon;

namespace Storage {

    class PostGISWriter {
    private:
        std::string connStr;
        std::string layerName;

        GDALDataset* pgDS = nullptr; 
        OGRLayer* layer = nullptr;
        std::mutex writeMutex;

        std::vector<OGRPolygon*> polygonBuffer;
        void FlushBufferLocked();

    public:
        // connStr format: "PG:dbname=vdt host=localhost port=5432 user=postgres password=yourpass"
        PostGISWriter(const std::string& connectionString, const std::string& tableName);
        ~PostGISWriter();

        PostGISWriter(const PostGISWriter&) = delete;
        PostGISWriter& operator=(const PostGISWriter&) = delete;

        void Open(const std::string& projection = "");

        void SaveMaskAsPolygon(const Common::InferenceData& infData);
        void StorageProcess(Common::ThreadSafeQueue<Common::InferenceData>* queue, int num_workers);
        void MergeOverlappingPolygons();
        void ClearTables();

        void Close();

    private:
        void StorageWorker(int thread_id, Common::ThreadSafeQueue<Common::InferenceData>* queue);
    };

}

#endif
