// Compile error: text used as a number. Try stdin: 15
#include <iostream>
#include <string>

int main() {
    std::string age;
    std::cin >> age;
    int doubled = age * 2;
    std::cout << "Double your age is " << doubled << std::endl;
    return 0;
}
