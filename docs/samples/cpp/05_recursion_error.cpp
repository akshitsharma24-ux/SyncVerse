// Segmentation fault: no base case, so the stack runs out
#include <iostream>

int countdown(int n) {
    return countdown(n - 1);
}

int main() {
    std::cout << countdown(5) << std::endl;
    return 0;
}
