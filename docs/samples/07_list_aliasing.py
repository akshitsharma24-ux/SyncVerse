# Aliasing: b = a makes two names for ONE list
a = [1, 2, 3]
b = a
b.append(4)
print("a is", a)
print("b is", b)
