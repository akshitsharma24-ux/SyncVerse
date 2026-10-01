// Timeout: the loop never ends because count never changes
public class Main {
    public static void main(String[] args) {
        int count = 0;
        int total = 0;
        while (count < 10) {
            total += count;
        }
        System.out.println(total);
    }
}
