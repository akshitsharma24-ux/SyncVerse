// Golden path: average of numbers. The loop goes one step too far.
#include <iostream>
#include <vector>

double average(const std::vector<int>& nums) {
    int total = 0;
    for (size_t i = 0; i <= nums.size(); i++) {
        total += nums.at(i);
    }
    return static_cast<double>(total) / nums.size();
}

int main() {
    std::cout << average({3, 4, 5}) << std::endl;
    return 0;
}
