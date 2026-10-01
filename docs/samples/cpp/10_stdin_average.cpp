// Average of the numbers on stdin. Try stdin: 3 4 5
#include <iomanip>
#include <iostream>

int main() {
    int n;
    int sum = 0;
    int count = 0;
    while (std::cin >> n) {
        sum += n;
        count++;
    }
    std::cout << std::fixed << std::setprecision(1) << static_cast<double>(sum) / count << std::endl;
    return 0;
}
