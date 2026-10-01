// Compile error: a misspelled variable
#include <iostream>

int main() {
    int total = 0;
    for (int n : {1, 2, 3}) {
        total += n;
    }
    std::cout << totl << std::endl;
    return 0;
}
