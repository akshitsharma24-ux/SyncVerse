// Aliasing: b is another name for the SAME vector, not a copy
#include <iostream>
#include <vector>

void show(const char* label, const std::vector<int>& v) {
    std::cout << label;
    for (int x : v) std::cout << " " << x;
    std::cout << std::endl;
}

int main() {
    std::vector<int> a = {1, 2, 3};
    std::vector<int>& b = a;
    b.push_back(4);
    show("a is", a);
    show("b is", b);
    return 0;
}
