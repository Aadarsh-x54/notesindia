package com.notesindia.note;

import com.notesindia.category.Category;
import com.notesindia.category.CategoryDtos;
import com.notesindia.category.CategoryRepository;
import com.notesindia.category.CategoryService;
import com.notesindia.common.ApiException;
import com.notesindia.common.PageResponse;
import com.notesindia.storage.FileValidator;
import com.notesindia.storage.StorageService;
import com.notesindia.user.Role;
import com.notesindia.user.User;
import com.notesindia.user.UserPrincipal;
import com.notesindia.user.UserRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class NoteService {

    private static final DateTimeFormatter KEY_DATE_FMT =
            DateTimeFormatter.ofPattern("yyyy/MM").withZone(ZoneOffset.UTC);

    private final NoteRepository noteRepository;
    private final CategoryRepository categoryRepository;
    private final CategoryService categoryService;
    private final UserRepository userRepository;
    private final NoteBookmarkRepository bookmarkRepository;
    private final NoteViewRepository viewRepository;
    private final NoteDownloadRepository downloadRepository;
    private final NoteReportRepository reportRepository;
    private final FileValidator fileValidator;
    private final StorageService storageService;
    private final NoteIndexingService noteIndexingService;

    public NoteService(
            NoteRepository noteRepository,
            CategoryRepository categoryRepository,
            CategoryService categoryService,
            UserRepository userRepository,
            NoteBookmarkRepository bookmarkRepository,
            NoteViewRepository viewRepository,
            NoteDownloadRepository downloadRepository,
            NoteReportRepository reportRepository,
            FileValidator fileValidator,
            StorageService storageService,
            NoteIndexingService noteIndexingService
    ) {
        this.noteRepository = noteRepository;
        this.categoryRepository = categoryRepository;
        this.categoryService = categoryService;
        this.userRepository = userRepository;
        this.bookmarkRepository = bookmarkRepository;
        this.viewRepository = viewRepository;
        this.downloadRepository = downloadRepository;
        this.reportRepository = reportRepository;
        this.fileValidator = fileValidator;
        this.storageService = storageService;
        this.noteIndexingService = noteIndexingService;
    }

    /**
     * Main Homepage Feed: ALL recently uploaded published notes in strict reverse chronological order.
     */
    @Transactional(readOnly = true)
    public PageResponse<NoteDtos.NoteResponse> getRecentFeed(int page, int size, UUID currentUserId) {
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(50, Math.max(1, size)));
        Page<Note> notes = noteRepository.findByStatusOrderByCreatedAtDesc(NoteStatus.PUBLISHED, pageable);
        return toPageResponse(notes, currentUserId);
    }

    @Transactional(readOnly = true)
    public PageResponse<NoteDtos.NoteResponse> searchNotes(String query, int page, int size, UUID currentUserId) {
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(50, Math.max(1, size)));
        if (query == null || query.isBlank()) {
            return getRecentFeed(page, size, currentUserId);
        }
        Page<Note> notes = noteRepository.globalSearch(query.trim(), NoteStatus.PUBLISHED, pageable);
        return toPageResponse(notes, currentUserId);
    }

    @Transactional(readOnly = true)
    public PageResponse<NoteDtos.NoteResponse> getNotesByCategorySlug(
            String slug,
            boolean includeChildren,
            int page,
            int size,
            UUID currentUserId
    ) {
        Category category = categoryRepository.findBySlug(slug.toLowerCase())
                .orElseThrow(() -> ApiException.notFound("Category '" + slug + "' not found"));

        Set<UUID> categoryIds = includeChildren
                ? categoryService.collectCategoryAndDescendantIds(category.getId())
                : Set.of(category.getId());

        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(50, Math.max(1, size)));
        Page<Note> notes = noteRepository.findByCategoryIds(categoryIds, NoteStatus.PUBLISHED, pageable);
        return toPageResponse(notes, currentUserId);
    }

    @Transactional
    public NoteDtos.NoteResponse getNoteDetail(UUID noteId, UUID currentUserId, boolean recordView) {
        Note note = noteRepository.findById(noteId)
                .filter(n -> n.getStatus() == NoteStatus.PUBLISHED)
                .orElseThrow(() -> ApiException.notFound("Note not found"));

        if (recordView) {
            note.setViewCount(note.getViewCount() + 1);
            noteRepository.save(note);

            NoteView view = new NoteView();
            view.setNote(note);
            if (currentUserId != null) {
                userRepository.findById(currentUserId).ifPresent(view::setUser);
            }
            viewRepository.save(view);
        }

        boolean bookmarked = currentUserId != null && bookmarkRepository.existsByUserIdAndNoteId(currentUserId, noteId);
        return toResponse(note, bookmarked);
    }

    @Transactional(readOnly = true)
    public List<NoteDtos.NoteResponse> getRelatedNotes(UUID noteId, int limit, UUID currentUserId) {
        Note note = noteRepository.findById(noteId)
                .orElseThrow(() -> ApiException.notFound("Note not found"));
        Set<UUID> categoryIds = note.getCategories().stream().map(Category::getId).collect(Collectors.toSet());
        if (categoryIds.isEmpty()) return List.of();

        List<Note> related = noteRepository.findRelatedNotes(
                noteId, categoryIds, PageRequest.of(0, Math.min(12, Math.max(1, limit)))
        );
        Set<UUID> bookmarkedIds = loadBookmarkedIds(currentUserId, related);
        return related.stream().map(n -> toResponse(n, bookmarkedIds.contains(n.getId()))).toList();
    }

    @Transactional
    public NoteDtos.NoteResponse uploadNote(
            MultipartFile file,
            String title,
            String description,
            String subject,
            String institution,
            String authorName,
            List<UUID> categoryIds,
            List<NoteDtos.NewCategoryInput> newCategories,
            UUID uploaderId
    ) {
        if (title == null || title.trim().length() < 3) {
            throw ApiException.badRequest("Note title must be at least 3 characters");
        }
        if (description == null || description.trim().length() < 10) {
            throw ApiException.badRequest("Note description must be at least 10 characters");
        }

        User uploader = userRepository.findById(uploaderId)
                .orElseThrow(() -> ApiException.unauthorized("Uploader account not found"));

        Set<Category> resolvedCategories = resolveCategories(categoryIds, newCategories, uploaderId);
        if (resolvedCategories.isEmpty()) {
            throw ApiException.badRequest("Please select or create at least one category for this note");
        }

        FileValidator.ValidatedFile validated = fileValidator.validate(file);

        // Duplicate file detection via SHA-256 checksum
        noteRepository.findFirstByFileChecksumAndStatus(validated.checksum(), NoteStatus.PUBLISHED)
                .ifPresent(existing -> {
                    throw ApiException.conflict(
                            "An identical file has already been uploaded as '" + existing.getTitle() + "'. " +
                            "Instead of uploading a duplicate, you can search for it or add categories to existing notes."
                    );
                });

        String storageKey = KEY_DATE_FMT.format(Instant.now()) + "/" + UUID.randomUUID() + "_" + validated.originalFilename();
        storageService.store(storageKey, validated.bytes(), validated.mimeType());

        Note note = new Note();
        note.setTitle(title.trim());
        note.setDescription(description.trim());
        note.setSubject(trimOrNull(subject));
        note.setInstitution(trimOrNull(institution));
        note.setAuthorName(trimOrNull(authorName) != null ? authorName.trim() : uploader.getFullName());
        note.setOriginalFilename(validated.originalFilename());
        note.setStorageKey(storageKey);
        note.setFileFormat(validated.fileFormat());
        note.setMimeType(validated.mimeType());
        note.setFileSizeBytes(validated.sizeBytes());
        note.setFileChecksum(validated.checksum());
        note.setUploadedBy(uploader);
        note.setCategories(resolvedCategories);
        note.setStatus(NoteStatus.PUBLISHED);

        Note saved = noteRepository.save(note);
        noteIndexingService.scheduleIndexAfterCommit(saved.getId());

        return toResponse(saved, false);
    }

    @Transactional
    public NoteDtos.NoteResponse updateNote(UUID noteId, NoteDtos.UpdateNoteRequest request, UserPrincipal actor) {
        Note note = noteRepository.findById(noteId)
                .orElseThrow(() -> ApiException.notFound("Note not found"));

        ensureCanModify(note, actor);

        Set<Category> resolvedCategories = resolveCategories(request.categoryIds(), request.newCategories(), actor.id());
        if (resolvedCategories.isEmpty()) {
            throw ApiException.badRequest("A note must belong to at least one category");
        }

        note.setTitle(request.title().trim());
        note.setDescription(request.description().trim());
        note.setSubject(trimOrNull(request.subject()));
        note.setInstitution(trimOrNull(request.institution()));
        note.setAuthorName(trimOrNull(request.authorName()));
        note.setCategories(resolvedCategories);

        Note saved = noteRepository.save(note);
        if (saved.getStatus() == NoteStatus.PUBLISHED) {
            noteIndexingService.scheduleIndexAfterCommit(saved.getId());
        }
        boolean bookmarked = bookmarkRepository.existsByUserIdAndNoteId(actor.id(), noteId);
        return toResponse(saved, bookmarked);
    }

    @Transactional
    public void deleteNote(UUID noteId, UserPrincipal actor) {
        Note note = noteRepository.findById(noteId)
                .orElseThrow(() -> ApiException.notFound("Note not found"));

        ensureCanModify(note, actor);

        note.setStatus(NoteStatus.REMOVED);
        note.setAiIndexed(false);
        noteRepository.save(note);
        noteIndexingService.scheduleRemoveAfterCommit(noteId);
    }

    @Transactional
    public StoredFilePayload prepareDownload(UUID noteId, UUID currentUserId, boolean incrementDownload) {
        Note note = noteRepository.findById(noteId)
                .filter(n -> n.getStatus() == NoteStatus.PUBLISHED)
                .orElseThrow(() -> ApiException.notFound("Note not found"));

        byte[] content = storageService.retrieveBytes(note.getStorageKey());

        if (incrementDownload) {
            note.setDownloadCount(note.getDownloadCount() + 1);
            noteRepository.save(note);

            NoteDownload download = new NoteDownload();
            download.setNote(note);
            if (currentUserId != null) {
                userRepository.findById(currentUserId).ifPresent(download::setUser);
            }
            downloadRepository.save(download);
        }

        return new StoredFilePayload(note.getOriginalFilename(), note.getMimeType(), content);
    }

    @Transactional
    public NoteDtos.BookmarkToggleResponse toggleBookmark(UUID noteId, UUID userId) {
        Note note = noteRepository.findById(noteId)
                .filter(n -> n.getStatus() == NoteStatus.PUBLISHED)
                .orElseThrow(() -> ApiException.notFound("Note not found"));

        Optional<NoteBookmark> existing = bookmarkRepository.findByUserIdAndNoteId(userId, noteId);
        if (existing.isPresent()) {
            bookmarkRepository.delete(existing.get());
            return new NoteDtos.BookmarkToggleResponse(noteId, false);
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.unauthorized("User not found"));
        NoteBookmark bookmark = new NoteBookmark();
        bookmark.setUser(user);
        bookmark.setNote(note);
        bookmarkRepository.save(bookmark);
        return new NoteDtos.BookmarkToggleResponse(noteId, true);
    }

    @Transactional(readOnly = true)
    public PageResponse<NoteDtos.NoteResponse> getUserBookmarks(UUID userId, int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(50, Math.max(1, size)));
        Page<Note> notes = bookmarkRepository.findBookmarkedNotes(userId, pageable);
        return toPageResponse(notes, userId);
    }

    @Transactional(readOnly = true)
    public PageResponse<NoteDtos.NoteResponse> getMyUploads(UUID userId, int page, int size) {
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(50, Math.max(1, size)));
        Page<Note> notes = noteRepository.findByUploadedByIdAndStatusNotOrderByCreatedAtDesc(userId, NoteStatus.REMOVED, pageable);
        return toPageResponse(notes, userId);
    }

    @Transactional(readOnly = true)
    public PageResponse<NoteDtos.NoteResponse> getUserPublicUploads(String username, int page, int size, UUID currentUserId) {
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(50, Math.max(1, size)));
        Page<Note> notes = noteRepository.findByUploadedByUsernameIgnoreCaseAndStatusOrderByCreatedAtDesc(
                username, NoteStatus.PUBLISHED, pageable
        );
        return toPageResponse(notes, currentUserId);
    }

    @Transactional(readOnly = true)
    public List<NoteDtos.NoteResponse> getRecentlyViewed(UUID userId, int limit) {
        List<NoteView> views = viewRepository.findRecentViewsByUser(
                userId, PageRequest.of(0, Math.min(30, Math.max(1, limit * 3)))
        );
        Map<UUID, Note> unique = new LinkedHashMap<>();
        for (NoteView view : views) {
            unique.putIfAbsent(view.getNote().getId(), view.getNote());
            if (unique.size() >= limit) break;
        }
        List<Note> list = new ArrayList<>(unique.values());
        Set<UUID> bookmarkedIds = loadBookmarkedIds(userId, list);
        return list.stream().map(n -> toResponse(n, bookmarkedIds.contains(n.getId()))).toList();
    }

    @Transactional
    public void reportNote(UUID noteId, NoteDtos.ReportNoteRequest request, UUID reporterId) {
        Note note = noteRepository.findById(noteId)
                .filter(n -> n.getStatus() != NoteStatus.REMOVED)
                .orElseThrow(() -> ApiException.notFound("Note not found"));
        User reporter = userRepository.findById(reporterId)
                .orElseThrow(() -> ApiException.unauthorized("User not found"));

        NoteReport report = new NoteReport();
        report.setNote(note);
        report.setReportedBy(reporter);
        report.setReason(request.reason().trim());
        report.setDetails(trimOrNull(request.details()));
        report.setStatus(ReportStatus.PENDING);
        reportRepository.save(report);
    }

    private Set<Category> resolveCategories(
            List<UUID> existingIds,
            List<NoteDtos.NewCategoryInput> newInputs,
            UUID creatorId
    ) {
        Set<Category> resolved = new LinkedHashSet<>();

        if (existingIds != null && !existingIds.isEmpty()) {
            List<Category> found = categoryRepository.findAllById(existingIds);
            resolved.addAll(found);
        }

        if (newInputs != null) {
            for (NoteDtos.NewCategoryInput input : newInputs) {
                if (input.name() != null && !input.name().isBlank()) {
                    Category cat = categoryService.findOrCreateEntity(
                            input.name(),
                            null,
                            input.accentColor(),
                            input.parentId(),
                            creatorId,
                            true
                    );
                    resolved.add(cat);
                }
            }
        }
        return resolved;
    }

    private void ensureCanModify(Note note, UserPrincipal actor) {
        boolean isOwner = note.getUploadedBy().getId().equals(actor.id());
        boolean isStaff = actor.role() == Role.ADMIN || actor.role() == Role.MODERATOR;
        if (!isOwner && !isStaff) {
            throw ApiException.forbidden("You are not authorized to modify this note");
        }
    }

    private PageResponse<NoteDtos.NoteResponse> toPageResponse(Page<Note> notesPage, UUID currentUserId) {
        Set<UUID> bookmarkedIds = loadBookmarkedIds(currentUserId, notesPage.getContent());
        Page<NoteDtos.NoteResponse> mapped = notesPage.map(n -> toResponse(n, bookmarkedIds.contains(n.getId())));
        return PageResponse.from(mapped);
    }

    private Set<UUID> loadBookmarkedIds(UUID userId, List<Note> notes) {
        if (userId == null || notes.isEmpty()) return Set.of();
        List<UUID> ids = notes.stream().map(Note::getId).toList();
        return bookmarkRepository.findBookmarkedNoteIds(userId, ids);
    }

    public NoteDtos.NoteResponse toResponse(Note note, boolean bookmarked) {
        List<CategoryDtos.CategorySummary> categories = note.getCategories().stream()
                .sorted(Comparator.comparing(Category::getName, String.CASE_INSENSITIVE_ORDER))
                .map(CategoryDtos.CategorySummary::from)
                .toList();

        return new NoteDtos.NoteResponse(
                note.getId(),
                note.getTitle(),
                note.getDescription(),
                note.getSubject(),
                note.getInstitution(),
                note.getAuthorName(),
                note.getOriginalFilename(),
                note.getFileFormat(),
                note.getMimeType(),
                note.getFileSizeBytes(),
                new NoteDtos.UploaderSummary(
                        note.getUploadedBy().getId(),
                        note.getUploadedBy().getUsername(),
                        note.getUploadedBy().getFullName()
                ),
                categories,
                note.getDownloadCount(),
                note.getViewCount(),
                note.getStatus(),
                note.isAiIndexed(),
                bookmarked,
                note.getCreatedAt(),
                note.getUpdatedAt()
        );
    }

    private String trimOrNull(String val) {
        return val != null && !val.isBlank() ? val.trim() : null;
    }

    public record StoredFilePayload(String filename, String mimeType, byte[] bytes) {}
}
