// Timeout: the loop never ends because count never changes
#include <iostream>

int main() {
    int count = 0;
    int total = 0;
    while (count < 10) {
        total += count;
    }
    std::cout << total << std::endl;
    return 0;
}
