#ifndef THREAD_SAFE_QUEUE_H
#define THREAD_SAFE_QUEUE_H

#include <queue>
#include <mutex>
#include <condition_variable>

namespace Common {

    template <typename T>
    class ThreadSafeQueue {
    private:
        std::queue<T> safe_queue;
        std::mutex safe_queue_mutex;
        std::condition_variable safe_queue_cond_var_pop;
        std::condition_variable safe_queue_cond_var_push;
        bool safe_queue_finished = false;
        size_t max_items;

    public:
        explicit ThreadSafeQueue(size_t max_items = 10) : max_items(max_items) {}

        void push(T item) {
            std::unique_lock<std::mutex> lock(safe_queue_mutex);
            safe_queue_cond_var_push.wait(lock, [this]() { return safe_queue.size() < max_items; });

            safe_queue.push(std::move(item));
            lock.unlock();
            safe_queue_cond_var_pop.notify_one();
        }

        bool pop(T& item) {
            std::unique_lock<std::mutex> lock(safe_queue_mutex);
            safe_queue_cond_var_pop.wait(lock, [this]() { return !safe_queue.empty() || safe_queue_finished; });

            if (safe_queue.empty() && safe_queue_finished) {
                return false;
            }

            item = std::move(safe_queue.front());
            safe_queue.pop();
            
            lock.unlock();
            safe_queue_cond_var_push.notify_one();
            
            return true;
        }

        void setFinished() {
            std::unique_lock<std::mutex> lock(safe_queue_mutex);
            safe_queue_finished = true;
            lock.unlock();
            safe_queue_cond_var_pop.notify_all();
        }

        bool isEmpty() {
            std::unique_lock<std::mutex> lock(safe_queue_mutex);
            return safe_queue.empty();
        }
    };

}

#endif // THREAD_SAFE_QUEUE_H
