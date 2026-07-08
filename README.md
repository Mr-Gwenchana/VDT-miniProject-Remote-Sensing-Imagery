# 🛰️ Mini-Project: High-Performance Remote Sensing Imagery Processing System

## 💡 1. Giới thiệu

Đây là hệ thống xử lý và phân tích ảnh viễn thám khổ lớn (GeoTIFF) hiệu năng cao, tự động nhận diện và khoanh vùng lớp phủ công trình xây dựng (*Building Footprint Extraction*). 

Hệ thống sử dụng kiến trúc lõi **C++ Core-Backend đa luồng** (Producer-Consumer Pipeline) kết hợp suy luận AI trên **GPU NVIDIA (ONNX Runtime + CUDA)**, cơ sở dữ liệu không gian **PostgreSQL/PostGIS** và giao diện Web GIS Dashboard trực quan trên **Node.js / Next.js**.

---

## 🛠️ 2. Yêu cầu hệ thống

Để triển khai chương trình qua Docker với hỗ trợ GPU, máy tính cần cài đặt sẵn:
- **Hệ điều hành:** Linux (Ubuntu) hoặc Windows 10/11 (kèm WSL2).
- **Phần cứng:** GPU NVIDIA có VRAM $\ge$ 4 GB, có hỗ trợ nhân CUDA
- **Trình điều khiển & Công cụ:**
  - NVIDIA Driver hỗ trợ CUDA.
  - **[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)** (Bắt buộc để Docker sử dụng được GPU).
  - **Git**, **Docker Engine** và **Docker Compose**.

---

## 🚀 3. Cài đặt và Khởi chạy

### Bước 1: Clone mã nguồn
Mở terminal và tải dự án về máy:
```bash
git clone https://github.com/Mr-Gwenchana/VDT-miniProject-Remote-Sensing-Imagery.git
cd VDT-miniProject-Remote-Sensing-Imagery
```

### Bước 2: Tải mô hình AI từ QGIS Deepness Model Zoo
> ⚠️ **Lưu ý:** Các tệp trọng số AI (`*.onnx`) có dung lượng lớn nên không lưu trữ trên Git. Bạn cần tải thủ công và đặt vào đúng thư mục trước khi chạy.

1. Truy cập kho mô hình **QGIS Deepness Model Zoo**: https://qgis-plugin-deepness.readthedocs.io/en/latest/main/main_model_zoo.html
2. Tìm và tải mô hình phân vùng công trình từ ảnh vệ tinh (ví dụ: *Building Footprint Segmentation / XUnet*) định dạng **`.onnx`**.
3. Tạo thư mục `core_backend/models/` và copy tệp `.onnx` vừa tải về vào thư mục này, đặt tên là `ramp_XUnet_256.onnx`:
   ```bash
   mkdir -p core_backend/models
   cp /path/to/downloaded_model.onnx ./core_backend/models/ramp_XUnet_256.onnx
   ```

### Bước 3: Cấu hình biến môi trường
Tạo tệp cấu hình `.env` và `.env.docker` từ tệp mẫu `.env.example` có sẵn:
```bash
cp .env.example .env
cp .env.example .env.docker
```
*(Nếu chạy local hoặc Docker trên máy cá nhân với cấu hình mặc định, bạn có thể giữ nguyên các thông số trong `.env.example`, hãy NHỚ `điều chỉnh mật khẩu database theo mật khẩu database của bạn` nếu cần).*

### Bước 4: Khởi chạy hệ thống

**Cách 1: Khởi chạy tự động bằng Docker Compose (Khuyên dùng)**
Biên dịch và khởi chạy toàn bộ các dịch vụ (Frontend, Backend, Core-Backend C++ GPU và PostGIS):
```bash
docker compose up --build -d
```
Kiểm tra trạng thái các container đang hoạt động:
```bash
docker compose ps
```

**Cách 2: Biên dịch và chạy trực tiếp Local trên máy Host (Không dùng Docker)**
Nếu bạn tự biên dịch khối xử lý C++ Core-Backend (bằng CMake) và chạy local trực tiếp trên máy host (Windows / Linux):
> ⚠️ **Lưu ý bắt buộc khi chạy Local:** Sau khi biên dịch C++ Core-Backend xong, bạn **phải copy** các tệp thư viện liên kết động của **cuDNN** (`cudnn*.dll` trên Windows hoặc `libcudnn*.so` trên Linux) và **ONNX Runtime** (`onnxruntime.dll`, `onnxruntime_providers_cuda.dll` / `libonnxruntime*.so`) vào ngay bên trong thư mục `core_backend/build/` (hoặc thư mục chứa tệp thực thi `.exe` / binary sau biên dịch). Việc này giúp hệ điều hành tìm thấy thư viện và kích hoạt được khối suy luận AI trên GPU CUDA thành công.

### Bước 5: Truy cập ứng dụng
Sau khi hệ thống khởi động thành công, truy cập qua trình duyệt:
- **Giao diện Web Dashboard (Next.js):** http://localhost:3000
- **Dịch vụ API Backend (Node.js):** http://localhost:3001
- **Cơ sở dữ liệu PostGIS:** `localhost:5432`

---

## 📂 4. Cấu trúc thư mục

```text
VDT-miniProject-Remote-Sensing-Imagery/
├── core_backend/        # Lõi xử lý C++ đa luồng (Tiler, Inference Engine, PostGIS Writer)
│   └── models/          # Thư mục đặt tệp mô hình .onnx tải về từ Deepness Zoo
├── web/                 # Dịch vụ Web bổ trợ
│   ├── backend/         # Node.js API (Tiếp nhận ảnh GeoTIFF, điều phối pipeline)
│   └── frontend/        # Next.js / React Web GIS Dashboard
├── docs/                # Tài liệu báo cáo học thuật chuyên sâu (Chương 1 - Chương 7)
├── scripts/             # Các tập lệnh tiện ích kiểm thử hệ thống
├── Dockerfile.backend   # Cấu hình Docker cho Backend & C++ Core
├── Dockerfile.frontend  # Cấu hình Docker cho Next.js Frontend
├── docker-compose.yml   # Khởi chạy toàn bộ hệ thống kèm hỗ trợ GPU NVIDIA
└── .env.example         # Tệp mẫu cấu hình biến môi trường
```
