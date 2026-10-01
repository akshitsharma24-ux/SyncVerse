// Aliasing: b = a makes two names for ONE list
import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<Integer> a = new ArrayList<>(List.of(1, 2, 3));
        List<Integer> b = a;
        b.add(4);
        System.out.println("a is " + a);
        System.out.println("b is " + b);
    }
}
