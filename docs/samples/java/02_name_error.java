// Compile error: a misspelled variable
public class Main {
    public static void main(String[] args) {
        int total = 0;
        for (int n : new int[] {1, 2, 3}) {
            total += n;
        }
        System.out.println(totl);
    }
}
