package com.notesindia.admin;

import com.notesindia.note.NoteStatus;
import com.notesindia.note.ReportStatus;
import com.notesindia.user.Role;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class AdminDtos {

    private AdminDtos() {}

    public record CategoryAnalyticsItem(
            UUID categoryId,
            String name,
            String slug,
            String accentColor,
            long noteCount,
            long totalDownloads
    ) {}

    public record DashboardStats(
            long totalUsers,
            long totalPublishedNotes,
            long totalFlaggedNotes,
            long totalCategories,
            long totalDownloads,
            long totalStorageBytes,
            long pendingReports,
            List<CategoryAnalyticsItem> topCategories
    ) {}

    public record UpdateUserRequest(
            Role role,
            Boolean active
    ) {}

    public record UpdateNoteStatusRequest(
            @NotNull NoteStatus status
    ) {}

    public record ReviewReportRequest(
            @NotNull ReportStatus decision, // REVIEWED_DISMISSED or REVIEWED_REMOVED
            @Size(max = 1000) String resolutionNote
    ) {}

    public record MergeCategoriesRequest(
            @NotNull UUID sourceCategoryId,
            @NotNull UUID targetCategoryId
    ) {}

    public record ReportResponse(
            UUID id,
            UUID noteId,
            String noteTitle,
            NoteStatus noteStatus,
            String reporterUsername,
            String reason,
            String details,
            ReportStatus status,
            String reviewerUsername,
            String resolutionNote,
            Instant createdAt,
            Instant resolvedAt
    ) {}

    public record AuditLogResponse(
            UUID id,
            String actorUsername,
            String action,
            String targetType,
            String targetId,
            String details,
            Instant createdAt
    ) {}
}
