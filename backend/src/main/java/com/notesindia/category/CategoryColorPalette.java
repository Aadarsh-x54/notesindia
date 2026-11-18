package com.notesindia.category;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class CategoryColorPalette {

    private static final Map<String, String> PRESET_COLORS = Map.ofEntries(
            Map.entry("ssc", "#3B82F6"),           // Blue
            Map.entry("ssc cgl", "#3B82F6"),
            Map.entry("ssc chsl", "#60A5FA"),
            Map.entry("ssc mts", "#2563EB"),
            Map.entry("ssc gd", "#38BDF8"),
            Map.entry("banking", "#22C55E"),       // Green
            Map.entry("ibps po", "#22C55E"),
            Map.entry("sbi po", "#16A34A"),
            Map.entry("railway", "#F97316"),       // Orange
            Map.entry("rrb ntpc", "#F97316"),
            Map.entry("programming", "#A855F7"),   // Purple
            Map.entry("coding", "#9333EA"),
            Map.entry("java", "#F97316"),          // Orange
            Map.entry("python", "#EAB308"),        // Yellow
            Map.entry("cpp", "#3B82F6"),
            Map.entry("javascript", "#FACC15"),
            Map.entry("mathematics", "#06B6D4"),   // Cyan
            Map.entry("quantitative aptitude", "#06B6D4"),
            Map.entry("engineering", "#EF4444"),   // Red
            Map.entry("computer science", "#EC4899"),
            Map.entry("dbms", "#14B8A6"),
            Map.entry("operating system", "#8B5CF6"),
            Map.entry("upsc", "#F59E0B"),
            Map.entry("gate", "#10B981"),
            Map.entry("reasoning", "#6366F1")
    );

    private static final List<String> DYNAMIC_PALETTE = List.of(
            "#3B82F6", "#22C55E", "#F97316", "#A855F7",
            "#EAB308", "#06B6D4", "#EF4444", "#EC4899",
            "#14B8A6", "#8B5CF6", "#F59E0B", "#10B981",
            "#6366F1", "#38BDF8", "#84CC16", "#FB7185"
    );

    public String pickColor(String normalizedName, String requestedColor) {
        if (requestedColor != null && requestedColor.matches("^#[0-9A-Fa-f]{6}$")) {
            return requestedColor.toUpperCase();
        }
        String preset = PRESET_COLORS.get(normalizedName);
        if (preset != null) {
            return preset;
        }
        int index = Math.abs(normalizedName.hashCode()) % DYNAMIC_PALETTE.size();
        return DYNAMIC_PALETTE.get(index);
    }
}
