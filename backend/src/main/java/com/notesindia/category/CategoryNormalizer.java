package com.notesindia.category;

import org.springframework.stereotype.Component;

import java.text.Normalizer;
import java.util.Locale;

@Component
public class CategoryNormalizer {

    public String cleanDisplayName(String raw) {
        if (raw == null) return "";
        return raw.trim().replaceAll("\\s+", " ");
    }

    public String normalize(String raw) {
        String cleaned = cleanDisplayName(raw);
        String decomposed = Normalizer.normalize(cleaned, Normalizer.Form.NFKD)
                .replaceAll("\\p{M}", "");
        return decomposed
                .toLowerCase(Locale.ROOT)
                .replace("c++", "cpp")
                .replace("c#", "csharp")
                .replaceAll("[^a-z0-9]+", " ")
                .trim();
    }

    public String toSlug(String raw) {
        String normalized = normalize(raw);
        String slug = normalized.replaceAll("\\s+", "-");
        return slug.isBlank() ? "category" : slug;
    }

    /**
     * Computes Levenshtein distance between two normalized strings to warn about
     * near-duplicate categories (e.g. "Javscript" vs "JavaScript").
     */
    public int levenshteinDistance(String a, String b) {
        int[][] dp = new int[a.length() + 1][b.length() + 1];
        for (int i = 0; i <= a.length(); i++) dp[i][0] = i;
        for (int j = 0; j <= b.length(); j++) dp[0][j] = j;

        for (int i = 1; i <= a.length(); i++) {
            for (int j = 1; j <= b.length(); j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                dp[i][j] = Math.min(
                        Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1),
                        dp[i - 1][j - 1] + cost
                );
            }
        }
        return dp[a.length()][b.length()];
    }

    public boolean isLikelyDuplicate(String normalizedA, String normalizedB) {
        if (normalizedA.equals(normalizedB)) return true;
        String compactA = normalizedA.replace(" ", "");
        String compactB = normalizedB.replace(" ", "");
        if (compactA.equals(compactB)) return true;

        int maxLen = Math.max(compactA.length(), compactB.length());
        if (maxLen < 4) return false;
        int dist = levenshteinDistance(compactA, compactB);
        return (maxLen <= 6 && dist <= 1) || (maxLen > 6 && dist <= 2);
    }
}
