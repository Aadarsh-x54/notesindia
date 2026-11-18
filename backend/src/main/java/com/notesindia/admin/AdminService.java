package com.notesindia.admin;

import com.notesindia.category.Category;
import com.notesindia.category.CategoryDtos;
import com.notesindia.category.CategoryRepository;
import com.notesindia.category.CategoryService;
import com.notesindia.common.ApiException;
import com.notesindia.common.PageResponse;
import com.notesindia.note.*;
import com.notesindia.user.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

@Service
public class AdminService {

    private final UserRepository userRepository;
    private final NoteRepository noteRepository;
    private final NoteService noteService;
    private final NoteIndexingService noteIndexingService;
    private final NoteReportRepository reportRepository;
    private final CategoryRepository categoryRepository;
    private final CategoryService categoryService;
    private final AuditLogRepository auditLogRepository;

    public AdminService(
            UserRepository userRepository,
            NoteRepository noteRepository,
            NoteService noteService,
            NoteIndexingService noteIndexingService,
            NoteReportRepository reportRepository,
            CategoryRepository categoryRepository,
            CategoryService categoryService,
            AuditLogRepository auditLogRepository
    ) {
        this.userRepository = userRepository;
        this.noteRepository = noteRepository;
        this.noteService = noteService;
        this.noteIndexingService = noteIndexingService;
        this.reportRepository = reportRepository;
        this.categoryRepository = categoryRepository;
        this.categoryService = categoryService;
        this.auditLogRepository = auditLogRepository;
    }

    @Transactional(readOnly = true)
    public AdminDtos.DashboardStats getDashboardStats() {
        long totalUsers = userRepository.count();
        long publishedNotes = noteRepository.countByStatus(NoteStatus.PUBLISHED);
        long flaggedNotes = noteRepository.countByStatus(NoteStatus.FLAGGED);
        long totalCategories = categoryRepository.count();
        long totalDownloads = noteRepository.sumTotalDownloads();
        long totalStorage = noteRepository.sumActiveStorageBytes();
        long pendingReports = reportRepository.countByStatus(ReportStatus.PENDING);

        List<Category> allCategories = categoryRepository.findAll();
        List<AdminDtos.CategoryAnalyticsItem> analytics = new ArrayList<>();
        for (Category cat : allCategories) {
            List<Note> catNotes = noteRepository.findAllByCategoryId(cat.getId()).stream()
                    .filter(n -> n.getStatus() == NoteStatus.PUBLISHED)
                    .toList();
            long downloads = catNotes.stream().mapToLong(Note::getDownloadCount).sum();
            analytics.add(new AdminDtos.CategoryAnalyticsItem(
                    cat.getId(), cat.getName(), cat.getSlug(), cat.getAccentColor(),
                    catNotes.size(), downloads
            ));
        }
        analytics.sort(Comparator.comparingLong(AdminDtos.CategoryAnalyticsItem::noteCount).reversed());

        return new AdminDtos.DashboardStats(
                totalUsers,
                publishedNotes,
                flaggedNotes,
                totalCategories,
                totalDownloads,
                totalStorage,
                pendingReports,
                analytics.stream().limit(12).toList()
        );
    }

    @Transactional(readOnly = true)
    public PageResponse<AuthDtos.UserResponse> listUsers(String q, int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(50, Math.max(1, size)));
        Page<User> users = (q != null && !q.isBlank())
                ? userRepository.searchUsers(q.trim(), pageable)
                : userRepository.findAll(pageable);
        return PageResponse.from(users.map(AuthDtos.UserResponse::from));
    }

    @Transactional
    public AuthDtos.UserResponse updateUser(UUID targetUserId, AdminDtos.UpdateUserRequest request, UUID actorId) {
        User target = userRepository.findById(targetUserId)
                .orElseThrow(() -> ApiException.notFound("User not found"));

        if (targetUserId.equals(actorId) && Boolean.FALSE.equals(request.active())) {
            throw ApiException.badRequest("You cannot deactivate your own admin account");
        }
        if (request.role() != null) target.setRole(request.role());
        if (request.active() != null) target.setActive(request.active());

        User saved = userRepository.save(target);
        recordAudit(actorId, "USER_UPDATED", "USER", saved.getId().toString(),
                "Role=" + saved.getRole() + ", Active=" + saved.isActive());
        return AuthDtos.UserResponse.from(saved);
    }

    @Transactional(readOnly = true)
    public PageResponse<NoteDtos.NoteResponse> listNotes(String q, int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(50, Math.max(1, size)));
        Page<Note> notes = (q != null && !q.isBlank())
                ? noteRepository.adminSearch(q.trim(), pageable)
                : noteRepository.findAllByOrderByCreatedAtDesc(pageable);
        return PageResponse.from(notes.map(n -> noteService.toResponse(n, false)));
    }

    @Transactional
    public NoteDtos.NoteResponse updateNoteStatus(UUID noteId, NoteStatus status, UUID actorId) {
        Note note = noteRepository.findById(noteId)
                .orElseThrow(() -> ApiException.notFound("Note not found"));
        note.setStatus(status);
        if (status == NoteStatus.REMOVED || status == NoteStatus.FLAGGED) {
            note.setAiIndexed(false);
        }
        Note saved = noteRepository.save(note);
        if (status == NoteStatus.REMOVED || status == NoteStatus.FLAGGED) {
            noteIndexingService.scheduleRemoveAfterCommit(noteId);
        } else if (status == NoteStatus.PUBLISHED) {
            noteIndexingService.scheduleIndexAfterCommit(noteId);
        }
        recordAudit(actorId, "NOTE_STATUS_CHANGED", "NOTE", noteId.toString(), "Status=" + status);
        return noteService.toResponse(saved, false);
    }

    @Transactional
    public boolean reindexNote(UUID noteId, UUID actorId) {
        boolean indexed = noteIndexingService.indexNoteSync(noteId);
        recordAudit(actorId, "NOTE_AI_REINDEX", "NOTE", noteId.toString(), "Indexed=" + indexed);
        return indexed;
    }

    @Transactional(readOnly = true)
    public PageResponse<AdminDtos.ReportResponse> listReports(ReportStatus status, int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(50, Math.max(1, size)));
        Page<NoteReport> reports = status != null
                ? reportRepository.findByStatusOrderByCreatedAtDesc(status, pageable)
                : reportRepository.findAllByOrderByCreatedAtDesc(pageable);
        return PageResponse.from(reports.map(this::toReportResponse));
    }

    @Transactional
    public AdminDtos.ReportResponse reviewReport(UUID reportId, AdminDtos.ReviewReportRequest request, UUID actorId) {
        if (request.decision() == ReportStatus.PENDING) {
            throw ApiException.badRequest("Decision must be REVIEWED_DISMISSED or REVIEWED_REMOVED");
        }
        NoteReport report = reportRepository.findById(reportId)
                .orElseThrow(() -> ApiException.notFound("Report not found"));
        User reviewer = userRepository.findById(actorId)
                .orElseThrow(() -> ApiException.unauthorized("Reviewer not found"));

        report.setStatus(request.decision());
        report.setReviewedBy(reviewer);
        report.setResolutionNote(request.resolutionNote());
        report.setResolvedAt(Instant.now());

        if (request.decision() == ReportStatus.REVIEWED_REMOVED) {
            Note note = report.getNote();
            note.setStatus(NoteStatus.REMOVED);
            note.setAiIndexed(false);
            noteRepository.save(note);
            noteIndexingService.scheduleRemoveAfterCommit(note.getId());
        }

        NoteReport saved = reportRepository.save(report);
        recordAudit(actorId, "REPORT_REVIEWED", "NOTE_REPORT", reportId.toString(),
                "Decision=" + request.decision() + ", Note=" + report.getNote().getId());
        return toReportResponse(saved);
    }

    @Transactional
    public CategoryDtos.CategoryResponse updateCategory(UUID id, CategoryDtos.UpdateCategoryRequest request, UUID actorId) {
        CategoryDtos.CategoryResponse updated = categoryService.update(id, request);
        recordAudit(actorId, "CATEGORY_UPDATED", "CATEGORY", id.toString(), "Name=" + updated.name());
        return updated;
    }

    /**
     * Merges a duplicate source category into a target category.
     * Re-links all notes and child categories without duplicating notes, then deletes the source.
     */
    @Transactional
    public void mergeCategories(AdminDtos.MergeCategoriesRequest request, UUID actorId) {
        if (request.sourceCategoryId().equals(request.targetCategoryId())) {
            throw ApiException.badRequest("Source and target categories must be different");
        }
        Category source = categoryRepository.findById(request.sourceCategoryId())
                .orElseThrow(() -> ApiException.notFound("Source category not found"));
        Category target = categoryRepository.findById(request.targetCategoryId())
                .orElseThrow(() -> ApiException.notFound("Target category not found"));

        // Re-link all notes from source -> target without duplicating notes
        List<Note> affectedNotes = noteRepository.findAllByCategoryId(source.getId());
        for (Note note : affectedNotes) {
            note.getCategories().remove(source);
            note.getCategories().add(target);
            noteRepository.save(note);
        }

        // Re-parent any child categories of source to target
        List<Category> children = categoryRepository.findByParentIdOrderByNameAsc(source.getId());
        for (Category child : children) {
            if (!child.getId().equals(target.getId())) {
                child.setParent(target);
                categoryRepository.save(child);
            }
        }

        String details = "Merged '" + source.getName() + "' (" + affectedNotes.size() + " notes) into '" + target.getName() + "'";
        categoryRepository.delete(source);
        recordAudit(actorId, "CATEGORIES_MERGED", "CATEGORY", target.getId().toString(), details);
    }

    @Transactional
    public void deleteCategory(UUID categoryId, UUID actorId) {
        Category cat = categoryRepository.findById(categoryId)
                .orElseThrow(() -> ApiException.notFound("Category not found"));
        long attachedNotes = categoryRepository.countPublishedNotesForCategory(categoryId);
        if (attachedNotes > 0) {
            throw ApiException.badRequest(
                    "Cannot delete category with " + attachedNotes + " active notes. Merge it into another category first."
            );
        }
        List<Category> children = categoryRepository.findByParentIdOrderByNameAsc(categoryId);
        for (Category child : children) {
            child.setParent(cat.getParent());
            categoryRepository.save(child);
        }
        String name = cat.getName();
        categoryRepository.delete(cat);
        recordAudit(actorId, "CATEGORY_DELETED", "CATEGORY", categoryId.toString(), "Deleted '" + name + "'");
    }

    @Transactional(readOnly = true)
    public PageResponse<AdminDtos.AuditLogResponse> listAuditLogs(int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(50, Math.max(1, size)));
        Page<AuditLog> logs = auditLogRepository.findAllByOrderByCreatedAtDesc(pageable);
        return PageResponse.from(logs.map(l -> new AdminDtos.AuditLogResponse(
                l.getId(),
                l.getActor() != null ? l.getActor().getUsername() : "system",
                l.getAction(),
                l.getTargetType(),
                l.getTargetId(),
                l.getDetails(),
                l.getCreatedAt()
        )));
    }

    private AdminDtos.ReportResponse toReportResponse(NoteReport r) {
        return new AdminDtos.ReportResponse(
                r.getId(),
                r.getNote().getId(),
                r.getNote().getTitle(),
                r.getNote().getStatus(),
                r.getReportedBy().getUsername(),
                r.getReason(),
                r.getDetails(),
                r.getStatus(),
                r.getReviewedBy() != null ? r.getReviewedBy().getUsername() : null,
                r.getResolutionNote(),
                r.getCreatedAt(),
                r.getResolvedAt()
        );
    }

    private void recordAudit(UUID actorId, String action, String targetType, String targetId, String details) {
        AuditLog logEntry = new AuditLog();
        if (actorId != null) {
            userRepository.findById(actorId).ifPresent(logEntry::setActor);
        }
        logEntry.setAction(action);
        logEntry.setTargetType(targetType);
        logEntry.setTargetId(targetId);
        logEntry.setDetails(details);
        auditLogRepository.save(logEntry);
    }
}
