package com.notesindia.note;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.notesindia.common.ApiException;
import com.notesindia.common.ApiResponse;
import com.notesindia.common.PageResponse;
import com.notesindia.user.UserPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/notes")
public class NoteController {

    private final NoteService noteService;
    private final ObjectMapper objectMapper;

    public NoteController(NoteService noteService, ObjectMapper objectMapper) {
        this.noteService = noteService;
        this.objectMapper = objectMapper;
    }

    /**
     * Homepage Main Feed — ALL recently uploaded notes, strict reverse chronological order.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<PageResponse<NoteDtos.NoteResponse>>> getRecentFeed(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        UUID userId = principal != null ? principal.id() : null;
        return ResponseEntity.ok(ApiResponse.ok(noteService.getRecentFeed(page, size, userId)));
    }

    @GetMapping("/search")
    public ResponseEntity<ApiResponse<PageResponse<NoteDtos.NoteResponse>>> searchNotes(
            @RequestParam(name = "q", required = false) String query,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        UUID userId = principal != null ? principal.id() : null;
        return ResponseEntity.ok(ApiResponse.ok(noteService.searchNotes(query, page, size, userId)));
    }

    @GetMapping("/category/{slug}")
    public ResponseEntity<ApiResponse<PageResponse<NoteDtos.NoteResponse>>> getByCategory(
            @PathVariable String slug,
            @RequestParam(defaultValue = "true") boolean includeChildren,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        UUID userId = principal != null ? principal.id() : null;
        return ResponseEntity.ok(ApiResponse.ok(
                noteService.getNotesByCategorySlug(slug, includeChildren, page, size, userId)
        ));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<NoteDtos.NoteResponse>> getNoteDetail(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "true") boolean recordView,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        UUID userId = principal != null ? principal.id() : null;
        return ResponseEntity.ok(ApiResponse.ok(noteService.getNoteDetail(id, userId, recordView)));
    }

    @GetMapping("/{id}/related")
    public ResponseEntity<ApiResponse<List<NoteDtos.NoteResponse>>> getRelatedNotes(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "4") int limit,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        UUID userId = principal != null ? principal.id() : null;
        return ResponseEntity.ok(ApiResponse.ok(noteService.getRelatedNotes(id, limit, userId)));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<NoteDtos.NoteResponse>> uploadNote(
            @RequestPart("file") MultipartFile file,
            @RequestParam("title") String title,
            @RequestParam("description") String description,
            @RequestParam(value = "subject", required = false) String subject,
            @RequestParam(value = "institution", required = false) String institution,
            @RequestParam(value = "authorName", required = false) String authorName,
            @RequestParam(value = "categoryIds", required = false) List<UUID> categoryIds,
            @RequestParam(value = "newCategories", required = false) String newCategoriesJson,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        List<NoteDtos.NewCategoryInput> newCategories = parseNewCategories(newCategoriesJson);
        NoteDtos.NoteResponse created = noteService.uploadNote(
                file, title, description, subject, institution, authorName,
                categoryIds, newCategories, principal.id()
        );
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok("Note uploaded and published successfully", created));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<NoteDtos.NoteResponse>> updateNote(
            @PathVariable UUID id,
            @Valid @RequestBody NoteDtos.UpdateNoteRequest request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(ApiResponse.ok("Note updated", noteService.updateNote(id, request, principal)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteNote(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        noteService.deleteNote(id, principal);
        return ResponseEntity.ok(ApiResponse.ok("Note deleted", null));
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<byte[]> downloadNote(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        UUID userId = principal != null ? principal.id() : null;
        NoteService.StoredFilePayload payload = noteService.prepareDownload(id, userId, true);

        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(payload.filename(), StandardCharsets.UTF_8)
                .build();

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .contentType(MediaType.parseMediaType(payload.mimeType()))
                .contentLength(payload.bytes().length)
                .body(payload.bytes());
    }

    @GetMapping("/{id}/preview")
    public ResponseEntity<byte[]> previewNote(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        UUID userId = principal != null ? principal.id() : null;
        NoteService.StoredFilePayload payload = noteService.prepareDownload(id, userId, false);

        ContentDisposition disposition = ContentDisposition.inline()
                .filename(payload.filename(), StandardCharsets.UTF_8)
                .build();

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .contentType(MediaType.parseMediaType(payload.mimeType()))
                .contentLength(payload.bytes().length)
                .body(payload.bytes());
    }

    @PostMapping("/{id}/bookmark")
    public ResponseEntity<ApiResponse<NoteDtos.BookmarkToggleResponse>> toggleBookmark(
            @PathVariable UUID id,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(ApiResponse.ok(noteService.toggleBookmark(id, principal.id())));
    }

    @GetMapping("/bookmarks")
    public ResponseEntity<ApiResponse<PageResponse<NoteDtos.NoteResponse>>> getBookmarks(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(ApiResponse.ok(noteService.getUserBookmarks(principal.id(), page, size)));
    }

    @GetMapping("/my-uploads")
    public ResponseEntity<ApiResponse<PageResponse<NoteDtos.NoteResponse>>> getMyUploads(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(ApiResponse.ok(noteService.getMyUploads(principal.id(), page, size)));
    }

    @GetMapping("/user/{username}")
    public ResponseEntity<ApiResponse<PageResponse<NoteDtos.NoteResponse>>> getUserUploads(
            @PathVariable String username,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        UUID userId = principal != null ? principal.id() : null;
        return ResponseEntity.ok(ApiResponse.ok(noteService.getUserPublicUploads(username, page, size, userId)));
    }

    @GetMapping("/recently-viewed")
    public ResponseEntity<ApiResponse<List<NoteDtos.NoteResponse>>> getRecentlyViewed(
            @RequestParam(defaultValue = "8") int limit,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        return ResponseEntity.ok(ApiResponse.ok(noteService.getRecentlyViewed(principal.id(), limit)));
    }

    @PostMapping("/{id}/report")
    public ResponseEntity<ApiResponse<Void>> reportNote(
            @PathVariable UUID id,
            @Valid @RequestBody NoteDtos.ReportNoteRequest request,
            @AuthenticationPrincipal UserPrincipal principal
    ) {
        noteService.reportNote(id, request, principal.id());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok("Report submitted for moderation review", null));
    }

    private List<NoteDtos.NewCategoryInput> parseNewCategories(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            // Also accept comma-separated names gracefully
            List<NoteDtos.NewCategoryInput> fallback = new ArrayList<>();
            for (String part : json.split(",")) {
                if (!part.isBlank()) {
                    fallback.add(new NoteDtos.NewCategoryInput(part.trim(), null, null));
                }
            }
            if (fallback.isEmpty()) {
                throw ApiException.badRequest("Invalid newCategories payload");
            }
            return fallback;
        }
    }
}
