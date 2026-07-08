#include "inference_engine.h"
#include <vector>
#include<thread>
#include <iostream>
#include <algorithm>
#include <cstring>

namespace InferenceEngine {

#ifdef _WIN32
    ModelRunner::ModelRunner(const wchar_t* model_path, bool use_gpu) {
#else
    ModelRunner::ModelRunner(const char* model_path, bool use_gpu) {
#endif
        Ort::SessionOptions session_options;
        
        if(use_gpu){
            try {
                OrtCUDAProviderOptions cuda_options;
                cuda_options.device_id = 0;
                session_options.AppendExecutionProvider_CUDA(cuda_options);
                std::cout << "Using GPU for inference" << std::endl;
            } catch (const std::exception& e) {
                std::cerr << "[Warning] Could not initialize CUDA provider (" << e.what() << "). Falling back to CPU inference." << std::endl;
            }
        }
        session_options.SetIntraOpNumThreads(1);
        
        session = Ort::Session(env, model_path, session_options);
        
        Ort::AllocatorWithDefaultOptions allocator;
        auto input_name = session.GetInputNameAllocated(0, allocator);
        auto output_name = session.GetOutputNameAllocated(0, allocator);
        
        input_name_str = input_name.get();
        output_name_str = output_name.get();
        
        memory_info = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
    }

    void ModelRunner::InferenceTile(const Common::TileData& tileData, Common::ThreadSafeQueue<Common::InferenceData>* out_queue) const {
        int w = tileData.width;
        int h = tileData.height;
        
        std::vector<float> norm_pixels(w * h * model_bands);
        for (int b = 0; b < model_bands; b++) {
            for (int i = 0; i < w * h; i++) {
                norm_pixels[b * w * h + i] = tileData.pixels[b * w * h + i] / 255.0f;
            }
        }
        
        std::vector<int64_t> input_dims = {1, model_bands, h, w};
        Ort::Value input_tensor = Ort::Value::CreateTensor<float>(
            memory_info, norm_pixels.data(), w * h * model_bands,
            input_dims.data(), input_dims.size()
        );

        // Run Inference
        const char *input_names[] = {input_name_str.c_str()};
        const char *output_names[] = {output_name_str.c_str()};

        std::vector<Ort::Value> output_tensors;
        {
            std::lock_guard<std::mutex> lock(gpu_mutex);
            output_tensors = session.Run(
                Ort::RunOptions{nullptr},
                input_names, &input_tensor, 1,
                output_names, 1
            );
        }
        
        auto &output = output_tensors[0];
        float *output_data = output.GetTensorMutableData<float>();

        std::vector<uint8_t> mask(w * h, 0);
        float *class0 = output_data;
        float *class1 = output_data + (w * h);

        for (int i = 0; i < w * h; i++) {
            if (class1[i] > class0[i]) {
                mask[i] = 1;
            }
        }
        
        Common::InferenceData infData;
        infData.mask = std::move(mask);
        infData.width = w;
        infData.height = h;
        std::memcpy(infData.geoTransform, tileData.geoTransform, 6 * sizeof(double));
        infData.projection = tileData.projection;

        if (out_queue) {
            out_queue->push(std::move(infData));
        }
    }

    void ModelRunner::InferenceWorker(int thread_id, Common::ThreadSafeQueue<Common::TileData>* in_queue, Common::ThreadSafeQueue<Common::InferenceData>* out_queue) {
        Common::TileData tileData;
        while (in_queue->pop(tileData)) {
            try {
                InferenceTile(tileData, out_queue);
            } catch (const std::exception& e) {
                std::cerr << "[Inference " << thread_id << "] Error processing tile: " << e.what() << std::endl;
            }
        }
    }

    void ModelRunner::InferenceProcess(Common::ThreadSafeQueue<Common::TileData>* in_queue, Common::ThreadSafeQueue<Common::InferenceData>* out_queue, int num_workers) {
        std::vector<std::thread> inference_threads;
        for (int i = 0; i < num_workers; i++) {
            inference_threads.push_back(std::thread(&ModelRunner::InferenceWorker, this, i + 1, in_queue, out_queue));
        }

        for (auto& t : inference_threads) {
            if (t.joinable()) t.join();
        }
    }

}
