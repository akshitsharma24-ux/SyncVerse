// StackOverflowError: no base case
public class Main {
    static int countdown(int n) {
        System.out.println(n);
        return countdown(n - 1);
    }

    public static void main(String[] args) {
        countdown(5);
    }
}
