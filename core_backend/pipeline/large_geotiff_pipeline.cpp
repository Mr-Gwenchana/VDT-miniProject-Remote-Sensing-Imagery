#include "large_geotiff_pipeline.h"

#include <iostream>
#include <fstream>
#include <thread>

#include "gdal_priv.h"

#include "../common/image_info.h"
#include "../common/inference_data.h"
#include "../common/thread_safe_queue.h"
#include "../tiling/tile_engine.h"
#include "../inference/inference_engine.h"
#include "../storage/postgis_writer.h"

namespace Pipeline {

    LargeGeotiffPipeline::LargeGeotiffPipeline() {
        GDALAllRegister();
    }

    std::map<std::string, std::string> LargeGeotiffPipeline::LoadEnvFile(const std::string& filepath) {
        std::map<std::string, std::string> envVars;
        std::ifstream file(filepath);
        std::string activePath = filepath;
        if (!file.is_open()) {
            activePath = "../" + filepath;
            file.open(activePath);
            if (!file.is_open()) {
                activePath = "../../" + filepath;
                file.open(activePath);
            }
        }
        if (!file.is_open()) {
            std::cerr << "Warning: Could not open " << filepath << " (or parent dirs) - using default values." << std::endl;
            return envVars;
        }
        std::cout << "[Pipeline] Loaded config from: " << activePath << std::endl;
        std::string line;
        while (std::getline(file, line)) {
            if (line.empty() || line[0] == '#') continue;
            auto pos = line.find('=');
            if (pos != std::string::npos) {
                envVars[line.substr(0, pos)] = line.substr(pos + 1);
            }
        }
        return envVars;
    }

    std::wstring LargeGeotiffPipeline::ToWideString(const std::string& s) {
        return std::wstring(s.begin(), s.end());
    }

    void LargeGeotiffPipeline::LoadConfig(const std::string& envFilePath, const std::string& imagePathArg) {
        auto env = LoadEnvFile(envFilePath);

        config.imagePath = imagePathArg;

        // Prioritize actual system environment variables, then fallback to .env file, then hardcoded defaults
        const char* envModelPath = std::getenv("MODEL_PATH");
        if (envModelPath && std::string(envModelPath) != "") {
            config.modelPath = envModelPath;
        } else {
            config.modelPath = env.count("MODEL_PATH") ? env["MODEL_PATH"] : "E:/VDTProject/core_backend/models/ramp_XUnet_256.onnx";
        }

        const char* envDbConn = std::getenv("DB_CONN");
        if (envDbConn && std::string(envDbConn) != "") {
            config.dbConn = envDbConn;
        } else {
            config.dbConn = env.count("DB_CONN") ? env["DB_CONN"] : "";
        }

        const char* envDbTable = std::getenv("DB_TABLE");
        if (envDbTable && std::string(envDbTable) != "") {
            config.dbTable = envDbTable;
        } else {
            config.dbTable = env.count("DB_TABLE") ? env["DB_TABLE"] : "buildings_polygon";
        }
    }

    void LargeGeotiffPipeline::SetConfig(const Config& cfg) {
        config = cfg;
    }

    const LargeGeotiffPipeline::Config& LargeGeotiffPipeline::GetConfig() const {
        return config;
    }

    int LargeGeotiffPipeline::Run() {
        std::cout << "=== Starting Pipeline ===" << std::endl;

        // --- Validate config ---
        if (config.imagePath.empty()) {
            std::cerr << "Error: No image path specified." << std::endl;
            return 1;
        }
        if (config.dbConn.empty()) {
            std::cerr << "Error: No database connection string specified." << std::endl;
            return 1;
        }

        std::cout << "Image: " << config.imagePath << std::endl;

        // --- Read image metadata via GDAL ---
        GDALDataset* dataset = (GDALDataset*)GDALOpen(config.imagePath.c_str(), GA_ReadOnly);
        if (!dataset) {
            std::cerr << "Error: Cannot open image " << config.imagePath << std::endl;
            return 1;
        }

        Common::ImageInfo imgInfo;
        imgInfo.xSize     = dataset->GetRasterXSize();
        imgInfo.ySize     = dataset->GetRasterYSize();
        imgInfo.bandCount = dataset->GetRasterCount();
        imgInfo.tileSize  = config.tileSize;

        dataset->GetGeoTransform(imgInfo.geoTransform);
        const char* proj = dataset->GetProjectionRef();
        imgInfo.projection = proj ? proj : "";

        GDALClose(dataset);

        // --- Connect to PostGIS ---
        Storage::PostGISWriter writer(config.dbConn, config.dbTable);
        try {
            writer.Open(imgInfo.projection);
            std::cout << "Connected to Database [" << config.dbTable << "]" << std::endl;
        } catch (const std::exception& e) {
            std::cerr << "DATABASE ERROR: " << e.what() << std::endl;
            return 1;
        }

        // --- Clear old data ---
        std::cout << "--- Clearing old data ---" << std::endl;
        writer.ClearTables();

        // --- Build pipeline components ---
#ifdef _WIN32
        std::wstring modelPathW = ToWideString(config.modelPath);
        TileEngine::Tiler tiler(config.overlapPercent, config.tilingThreads);
        InferenceEngine::ModelRunner runner(modelPathW.c_str(), config.useGpu);
#else
        TileEngine::Tiler tiler(config.overlapPercent, config.tilingThreads);
        InferenceEngine::ModelRunner runner(config.modelPath.c_str(), config.useGpu);
#endif

        Common::ThreadSafeQueue<Common::TileData> tileQueue(config.queueCapacity);
        Common::ThreadSafeQueue<Common::InferenceData> inferenceQueue(config.queueCapacity);

        std::cout << "--- Pipeline: Tiling -> Inference -> Storage ---" << std::endl;

        // Stage 1: Tiling
        std::thread tilerThread([&]() {
            tiler.TilingProcess(config.imagePath, imgInfo, &tileQueue);
            std::cout << "--- Tiling completed ---" << std::endl;
            tileQueue.setFinished();
        });

        // Stage 2: Inference
        std::thread inferenceThread([&]() {
            runner.InferenceProcess(&tileQueue, &inferenceQueue, config.inferenceThreads);
            std::cout << "--- Inference completed ---" << std::endl;
            inferenceQueue.setFinished();
        });

        // Stage 3: Storage (blocks current thread)
        writer.StorageProcess(&inferenceQueue, config.storageThreads);

        if (tilerThread.joinable()) tilerThread.join();
        if (inferenceThread.joinable()) inferenceThread.join();

        // Stage 4: Post-processing (merge overlapping polygons)
        std::cout << "--- Post-Processing ---" << std::endl;
        writer.MergeOverlappingPolygons();

        std::cout << "=== PIPELINE COMPLETED ===" << std::endl;
        return 0;
    }

}
