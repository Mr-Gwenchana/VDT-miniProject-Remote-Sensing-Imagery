cmake_minimum_required(VERSION 3.20)
project(VDTProject LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Dependencies
set(OpenCV_DIR "E:/MSYS2/mingw64/lib/cmake/opencv4")
find_package(GDAL REQUIRED)
find_package(OpenCV REQUIRED)


# ONNX Runtime
set(ONNXRUNTIME_ROOT "E:/onnxruntime/onnxruntime-win-x64-gpu-1.26.0")
set(ONNXRUNTIME_INCLUDE "${ONNXRUNTIME_ROOT}/include")
set(ONNXRUNTIME_LIB "${ONNXRUNTIME_ROOT}/lib")

# Common headers
include_directories(${CMAKE_SOURCE_DIR}/common)

# Modules
add_subdirectory(tiling)
add_subdirectory(inference)
add_subdirectory(storage)
add_subdirectory(pipeline)

# Main executable
add_executable(vdt_app main.cpp)
target_link_libraries(vdt_app PRIVATE vdt_pipeline)
