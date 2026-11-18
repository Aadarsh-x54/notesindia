package com.notesindia.note;

import com.notesindia.category.CategoryDtos;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class NoteDtos {

    private NoteDtos() {}

    public record NewCategoryInput(
            @NotBlank @Size(min = 2, max = 100) String name,
            UUID parentId,
            String accentColor
    ) {}

    public record UpdateNoteRequest(
            @NotBlank @Size(min = 3, max = 255) String title,
            @NotBlank @Size(min = 10, max = 5000) String description,
            @Size(max = 150) String subject,
            @Size(max = 200) String institution,
            @Size(max = 150) String authorName,
            List<UUID> categoryIds,
            List<NewCategoryInput> newCategories
    ) {}

    public record ReportNoteRequest(
            @NotBlank @Size(max = 60) String reason,
            @Size(max = 2000) String details
    ) {}

    public record UploaderSummary(
            UUID id,
            String username,
            String fullName
    ) {}

    public record NoteResponse(
            UUID id,
            String title,
            String description,
            String subject,
            String institution,
            String authorName,
            String originalFilename,
            String fileFormat,
            String mimeType,
            long fileSizeBytes,
            UploaderSummary uploadedBy,
            List<CategoryDtos.CategorySummary> categories,
            long downloadCount,
            long viewCount,
            NoteStatus status,
            boolean aiIndexed,
            boolean bookmarked,
            Instant createdAt,
            Instant updatedAt
    ) {}

    public record BookmarkToggleResponse(
            UUID noteId,
            boolean bookmarked
    ) {}
}
