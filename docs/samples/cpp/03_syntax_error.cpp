// Compile error: a missing semicolon
#include <iostream>
#include <string>

void greet(const std::string& name) {
    std::cout << "Hello, " << name << std::endl
}

int main() {
    greet("Asha");
    return 0;
}
