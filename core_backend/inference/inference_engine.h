#ifndef INFERENCE_ENGINE_H
#define INFERENCE_ENGINE_H

#include "../common/tile_data.h"
#include "../common/thread_safe_queue.h"
#include "../common/inference_data.h"
#include <onnxruntime_cxx_api.h>
#include <string>
#include <mutex>

namespace InferenceEngine {
    class ModelRunner {
    private:
        Ort::Env env{ORT_LOGGING_LEVEL_WARNING, "Inference_Tile"};
        mutable Ort::Session session{nullptr};
        Ort::MemoryInfo memory_info{nullptr};
        
        std::string input_name_str;
        std::string output_name_str;
        int model_bands = 3;
        mutable std::mutex gpu_mutex;

    public:
#ifdef _WIN32
        ModelRunner(const wchar_t* model_path, bool use_gpu = false);
#else
        ModelRunner(const char* model_path, bool use_gpu = false);
#endif
        void InferenceProcess(Common::ThreadSafeQueue<Common::TileData>* in_queue, Common::ThreadSafeQueue<Common::InferenceData>* out_queue, int num_workers);

    private:
        void InferenceTile(const Common::TileData& tileData, Common::ThreadSafeQueue<Common::InferenceData>* out_queue) const;
        void InferenceWorker(int thread_id, Common::ThreadSafeQueue<Common::TileData>* in_queue, Common::ThreadSafeQueue<Common::InferenceData>* out_queue);
    };
}

#endif