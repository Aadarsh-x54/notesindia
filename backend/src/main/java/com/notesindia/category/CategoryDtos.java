package com.notesindia.category;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class CategoryDtos {

    private CategoryDtos() {}

    public record CreateCategoryRequest(
            @NotBlank @Size(min = 2, max = 100) String name,
            @Size(max = 500) String description,
            @Pattern(regexp = "^#[0-9A-Fa-f]{6}$", message = "Accent color must be a valid hex color like #3B82F6")
            String accentColor,
            UUID parentId
    ) {}

    public record UpdateCategoryRequest(
            @NotBlank @Size(min = 2, max = 100) String name,
            @Size(max = 500) String description,
            @Pattern(regexp = "^#[0-9A-Fa-f]{6}$", message = "Accent color must be a valid hex color like #3B82F6")
            String accentColor,
            UUID parentId
    ) {}

    public record CategorySummary(
            UUID id,
            String name,
            String slug,
            String accentColor,
            UUID parentId,
            String parentName
    ) {
        public static CategorySummary from(Category c) {
            return new CategorySummary(
                    c.getId(),
                    c.getName(),
                    c.getSlug(),
                    c.getAccentColor(),
                    c.getParent() != null ? c.getParent().getId() : null,
                    c.getParent() != null ? c.getParent().getName() : null
            );
        }
    }

    public record CategoryResponse(
            UUID id,
            String name,
            String slug,
            String description,
            String accentColor,
            UUID parentId,
            String parentName,
            String parentSlug,
            long noteCount,
            boolean recentlyAdded,
            Instant createdAt,
            List<CategorySummary> children
    ) {}

    public record DuplicateCheckResponse(
            boolean exactMatch,
            CategorySummary existingMatch,
            List<CategorySummary> similarCategories
    ) {}
}
