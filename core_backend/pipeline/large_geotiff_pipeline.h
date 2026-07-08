#pragma once

#include <string>
#include <map>

namespace Pipeline {

    class LargeGeotiffPipeline {
    public:
        // Configuration parameters with sensible defaults
        struct Config {
            std::string imagePath;
            std::string modelPath;
            std::string dbConn;
            std::string dbTable = "buildings_polygon";
            int tileSize = 256;
            int overlapPercent = 20;
            int tilingThreads = 2;
            int inferenceThreads = 6;
            int storageThreads = 5;
            int queueCapacity = 4500;
            bool useGpu = true;
        };

        LargeGeotiffPipeline();
        ~LargeGeotiffPipeline() = default;

        void LoadConfig(const std::string& envFilePath, const std::string& imagePathArg);

        void SetConfig(const Config& cfg);

        const Config& GetConfig() const;

        int Run();

    private:
        Config config;
        static std::map<std::string, std::string> LoadEnvFile(const std::string& filepath);

        // Utility: convert std::string to std::wstring (for ONNX Runtime model path on Windows)
        static std::wstring ToWideString(const std::string& s);
    };

}
