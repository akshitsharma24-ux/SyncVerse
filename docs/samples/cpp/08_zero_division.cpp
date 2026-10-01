// Floating point exception: average of an empty vector divides by zero
#include <iostream>
#include <vector>

int average(const std::vector<int>& nums) {
    int sum = 0;
    for (int n : nums) {
        sum += n;
    }
    return sum / static_cast<int>(nums.size());
}

int main() {
    std::vector<int> nums;
    std::cout << average(nums) << std::endl;
    return 0;
}
