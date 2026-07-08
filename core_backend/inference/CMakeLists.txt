add_library(vdt_inference inference_engine.cpp inference_engine.h)
target_include_directories(vdt_inference PUBLIC ${CMAKE_SOURCE_DIR} ${ONNXRUNTIME_INCLUDE})
target_link_directories(vdt_inference PUBLIC ${ONNXRUNTIME_LIB})
target_link_libraries(vdt_inference PUBLIC onnxruntime vdt_storage)